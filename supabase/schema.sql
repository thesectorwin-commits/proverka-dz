-- Схема БД для сервиса проверки домашних заданий.
-- Выполнить целиком в Supabase → SQL Editor.
--
-- Принципы (по договорённости): фото не хранятся вообще, из Яндекс ID
-- берём только yandex_id (без email/имени/аватара), доступ к данным только
-- через сервисную роль с сервера — никогда напрямую из браузера.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- users: минимум полей. Только внутренний id + внешний идентификатор
-- Яндекса. Явно НЕ храним email/имя/аватар, даже если Яндекс их вернёт.
-- ---------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  yandex_id text unique not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- children: ребёнок как отдельная сущность в личном кабинете.
-- label — псевдоним, а не настоящее имя (см. согласованный принцип
-- минимизации персональных данных).
-- ---------------------------------------------------------------------
create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label text not null,
  grade smallint check (grade between 1 and 5),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- checks: одна проверка одного фото. Фото НЕ хранится — только результат.
-- ---------------------------------------------------------------------
create table if not exists checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  child_id uuid references children(id) on delete set null,
  subject text not null check (subject in ('math','russian','english','world')),
  grade smallint check (grade between 2 and 5),
  general_comment text,
  tokens_input integer,
  tokens_output integer,
  incorrect_count smallint not null default 0,
  unclear_count smallint not null default 0,
  created_at timestamptz not null default now()
);

-- incorrect_count/unclear_count — денормализованные счётчики заданий по
-- статусу (см. check_tasks ниже), считаются один раз при сохранении
-- проверки (app/api/checks/route.ts), чтобы в списке истории
-- (app/api/checks/list/route.ts) их можно было показать без JOIN на
-- каждую строку. Добавляем колонки, если таблица уже существовала, и
-- сразу же пересчитываем их для старых проверок из уже сохранённых
-- check_tasks — безопасно перезапускать (идемпотентно).
alter table checks add column if not exists incorrect_count smallint not null default 0;
alter table checks add column if not exists unclear_count smallint not null default 0;

-- photo_path — путь к временно сохранённому фото решения в Supabase
-- Storage (бакет check-photos, см. ниже). ЕДИНСТВЕННОЕ осознанное
-- исключение из принципа "фото не хранятся вообще" (CLAUDE.md) — по
-- явному решению владельца проекта, чтобы показывать превью в истории.
-- Фото и это поле удаляются через 48 часов (см. app/api/cron/delete-old-photos
-- и supabase/cron.sql) — после истечения срока превью не показывается,
-- даже если запись в checks по какой-то причине не была вовремя очищена.
alter table checks add column if not exists photo_path text;

-- ai_provider — каким провайдером реально обработана эта проверка:
-- 'claude' (Haiku 4.5 + Sonnet 4.6, провайдер по умолчанию), 'openai'
-- (gpt-5.4-mini, экспериментальный, см. lib/openai.ts и lib/aiProvider.ts)
-- или 'index' (узкая проверка по индексу учебника, пилот, см.
-- lib/textbookIndex.ts, lib/openai.ts → tryTextbookIndexCheck) — обычный
-- ai_provider в этом случае вообще не вызывается. Только для
-- истории/админки (сравнение стоимости/качества в переходный период) —
-- на логику не влияет. Колонка без CHECK — намеренно, чтобы не пришлось
-- трогать схему при каждом новом варианте.
alter table checks add column if not exists ai_provider text not null default 'claude';

-- ---------------------------------------------------------------------
-- check-photos: приватный бакет для временного (48 часов) хранения фото
-- решения. НЕ публичный — доступ только через service_role с сервера и
-- авторизованный эндпоинт GET /api/checks/[id]/photo, который проверяет
-- владельца проверки и срок 48 часов перед тем, как отдать файл.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('check-photos', 'check-photos', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- check_tasks: отдельные задания внутри проверки.
-- ---------------------------------------------------------------------
create table if not exists check_tasks (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  number text not null,
  condition text,
  status text not null check (status in ('correct','incorrect','unclear')),
  explanation text,
  correct_solution text,
  created_at timestamptz not null default now()
);

-- Пересчёт incorrect_count/unclear_count для уже существующих проверок —
-- новые колонки выше по умолчанию 0, без этого шага старые проверки
-- показывали бы "без ошибок" независимо от реального результата.
-- Идемпотентно, безопасно выполнять повторно.
update checks c
set incorrect_count = (select count(*) from check_tasks t where t.check_id = c.id and t.status = 'incorrect'),
    unclear_count = (select count(*) from check_tasks t where t.check_id = c.id and t.status = 'unclear');

-- ---------------------------------------------------------------------
-- usage_counters: лимит бесплатных проверок в текущем периоде.
-- ---------------------------------------------------------------------
create table if not exists usage_counters (
  user_id uuid not null references users(id) on delete cascade,
  period_start date not null,
  checks_used integer not null default 0,
  primary key (user_id, period_start)
);

-- ---------------------------------------------------------------------
-- anonymous_usage: суточный лимит бесплатных проверок без авторизации.
-- Хранится только хеш IP (соль — SESSION_SECRET), не сам адрес, и не
-- связано ни с одной другой таблицей — анонимные проверки нигде не
-- сохраняются, это только счётчик для защиты от накрутки платного API.
-- ---------------------------------------------------------------------
create table if not exists anonymous_usage (
  ip_hash text not null,
  period_start date not null,
  checks_used integer not null default 0,
  primary key (ip_hash, period_start)
);

-- ---------------------------------------------------------------------
-- demo_usage: суточный лимит на кнопку "Демо-проверка" на главной
-- странице (components/DemoCheckSection.tsx, app/api/checks/demo/route.ts)
-- — живой вызов проверки на заранее подготовленном фото (public/demo/),
-- БЕЗ загрузки своего фото и БЕЗ сессии. Отдельная от anonymous_usage
-- таблица, а не тот же счётчик — кнопка не требует вообще никакого
-- взаимодействия (даже выбора файла), её тривиально закликать скриптом,
-- и это не должно расходовать лимит обычных анонимных проверок.
-- ---------------------------------------------------------------------
create table if not exists demo_usage (
  ip_hash text not null,
  period_start date not null,
  checks_used integer not null default 0,
  primary key (ip_hash, period_start)
);

-- ---------------------------------------------------------------------
-- pricing_votes: опрос "какая цена подписки была бы приемлемой" на
-- лендинге (тестовый режим). Анонимно, без привязки к пользователю —
-- нужна только агрегированная статистика для админ-панели.
-- ---------------------------------------------------------------------
create table if not exists pricing_votes (
  id uuid primary key default gen_random_uuid(),
  tier text check (tier in ('299','599','899')),
  choice text not null check (choice in ('ok','no')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- push_subscriptions: подписки на браузерные push-уведомления (Web Push).
-- Один пользователь может иметь несколько подписок (разные устройства —
-- например, телефон родителя и телефон ребёнка на одном аккаунте).
-- endpoint уникален — если пользователь переустановит PWA, старая
-- подписка на этом устройстве просто перезапишется через upsert.
--
-- device_type/device_label заполняются вручную самим пользователем в
-- личном кабинете (см. компонент PushDevicesManager) — сервер не может
-- автоматически определить, чей это физически телефон, только браузер
-- сообщает user_agent как подсказку для UI.
-- ---------------------------------------------------------------------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_type text check (device_type in ('parent','child')),
  device_label text,
  user_agent text,
  client_device_id text,
  created_at timestamptz not null default now()
);

-- Добавляем новые колонки, если таблица уже существовала до этого поля
-- (безопасно перезапускать — ничего не сломает при повторном запуске).
alter table push_subscriptions add column if not exists device_type text;
alter table push_subscriptions add column if not exists device_label text;
alter table push_subscriptions add column if not exists user_agent text;
-- client_device_id — случайный UUID, который клиент генерирует один раз и
-- хранит в localStorage (lib/usePushSubscription.ts). endpoint у Web Push
-- подписки может смениться на том же физическом устройстве (переподписка,
-- сброс разрешений, особенности iOS) — client_device_id остаётся стабильным
-- и позволяет серверу узнать "это то же устройство" и подчистить старую
-- запись вместо накопления дублей (см. app/api/push/subscribe/route.ts).
alter table push_subscriptions add column if not exists client_device_id text;
create index if not exists idx_push_subscriptions_client_device on push_subscriptions(user_id, client_device_id);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'push_subscriptions_device_type_check'
  ) then
    alter table push_subscriptions
      add constraint push_subscriptions_device_type_check
      check (device_type in ('parent','child'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- reminder_settings: расписание напоминания "пора делать уроки" —
-- по будним дням, одно время на весь аккаунт (детей по отдельности пока
-- нет — раздел "Дети" не реализован). Настраивает родитель в личном
-- кабинете, отправляется устройствам с device_type='child' по крону
-- (см. app/api/cron/reminders/route.ts). last_sent_date — защита от
-- повторной отправки в тот же день, если планировщик (см. supabase/cron.sql)
-- дёрнет эндпоинт больше одного раза в пределах окна.
-- ---------------------------------------------------------------------
create table if not exists reminder_settings (
  user_id uuid primary key references users(id) on delete cascade,
  enabled boolean not null default false,
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1,2,3,4,5]::smallint[]),
  time_of_day time not null default '17:00',
  last_sent_date date,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- push_templates: тексты автоматических push-уведомлений, редактируемые
-- из админки (см. lib/pushTemplates.ts). Если для ключа нет строки —
-- используется дефолт из кода, ничего не ломается. check_ready поддерживает
-- плейсхолдеры {subject}/{grade} в теле сообщения.
-- ---------------------------------------------------------------------
create table if not exists push_templates (
  key text primary key check (key in ('check_ready','reminder')),
  title text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- app_settings: универсальная таблица админ-настроек "ключ-значение",
-- по тому же принципу, что push_templates выше, но не привязана к одному
-- домену — будущие переключатели могут переиспользовать её же, просто
-- расширив CHECK на новый ключ. Ключи:
-- - 'ai_provider' ('claude' | 'openai', см. lib/aiProvider.ts) — какой
--   провайдер обрабатывает /api/checks: текущий Claude (Haiku 4.5 +
--   Sonnet 4.6) или экспериментальный gpt-5.4-mini (lib/openai.ts, перенос
--   архитектуры из scripts/test-gpt56-luna.ts после серии тестов, см.
--   CLAUDE.md).
-- - 'textbook_index_enabled' ('true' | иначе трактуется как false,
--   см. lib/aiProvider.ts → getTextbookIndexEnabled) — пилот "индекс
--   учебника" (lib/textbookIndex.ts, lib/openai.ts → tryTextbookIndexCheck):
--   узкая проверка по заранее известному ответу вместо полного решения
--   моделью, для страниц одной конкретной рабочей тетради (пока 10
--   страниц). Проверяется ДО ai_provider — если сработала, ai_provider
--   вообще не используется для этой проверки.
-- Если строки для ключа нет — используется дефолт из кода (для обоих
-- ключей выше — текущее поведение, "выключено"/"claude"), ничего не
-- ломается.
-- ---------------------------------------------------------------------
create table if not exists app_settings (
  key text primary key check (key in ('ai_provider', 'textbook_index_enabled')),
  value text not null,
  updated_at timestamptz not null default now()
);

-- Таблица уже могла существовать в проде с прежним CHECK (только
-- 'ai_provider') до появления textbook_index_enabled — create table if not
-- exists выше не тронет уже существующую таблицу, поэтому расширяем CHECK
-- отдельно, идемпотентно (безопасно перезапускать).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'app_settings_key_check') then
    alter table app_settings drop constraint app_settings_key_check;
  end if;
  alter table app_settings
    add constraint app_settings_key_check
    check (key in ('ai_provider', 'textbook_index_enabled'));
end $$;

-- ---------------------------------------------------------------------
-- subscriptions: базовая заготовка под будущую монетизацию (ЮKassa и т.п.).
-- Эндпоинтов оплаты в этой версии ещё нет — таблица подготовлена заранее.
-- ---------------------------------------------------------------------
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan text not null check (plan in ('basic','pro')),
  status text not null check (status in ('active','cancelled','past_due')),
  current_period_end timestamptz,
  provider text,
  provider_subscription_id text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: включаем везде. Сервер обращается через service_role (обходит RLS),
-- поэтому политики ниже — это защита на случай, если anon/authenticated
-- ключ где-то случайно попадёт в браузер. Мы используем свою (Яндекс ID)
-- авторизацию, а не Supabase Auth, поэтому политики намеренно строгие:
-- напрямую из браузера сюда доступа быть не должно вообще.
-- ---------------------------------------------------------------------
alter table users enable row level security;
alter table children enable row level security;
alter table checks enable row level security;
alter table check_tasks enable row level security;
alter table usage_counters enable row level security;
alter table anonymous_usage enable row level security;
alter table demo_usage enable row level security;
alter table pricing_votes enable row level security;
alter table push_subscriptions enable row level security;
alter table subscriptions enable row level security;
alter table reminder_settings enable row level security;
alter table push_templates enable row level security;
alter table app_settings enable row level security;

-- Никаких политик для anon/authenticated не создаём намеренно —
-- по умолчанию RLS без политик блокирует весь доступ, кроме service_role.

create index if not exists idx_children_user on children(user_id);
create index if not exists idx_checks_user on checks(user_id);
create index if not exists idx_checks_child on checks(child_id);
create index if not exists idx_check_tasks_check on check_tasks(check_id);
create index if not exists idx_subscriptions_user on subscriptions(user_id);
create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);
