-- Планировщик напоминаний "пора делать уроки" — БЕЗ стороннего пинг-сервиса.
-- Supabase-расширения pg_cron (планировщик задач) + pg_net (HTTP-запросы
-- прямо из Postgres) дёргают наш собственный /api/cron/reminders раз в
-- минуту. Доступно на любом тарифе Supabase (включая бесплатный) — в
-- отличие от Vercel Cron, который на Hobby-тарифе не чаще раза в сутки.
--
-- ПЕРЕД ЗАПУСКОМ замените:
--   1) YOUR-DOMAIN — на настоящий домен деплоя (например,
--      ваш домен, без https:// и без слэша на конце)
--   2) YOUR_CRON_SECRET — на значение переменной окружения CRON_SECRET (передаётся заголовком
--      Authorization: Bearer, а не в адресе — так секрет не попадает в логи веб-сервера),
--      которое задано в Vercel (Project → Settings → Environment Variables)
--
-- Выполнить целиком в Supabase → SQL Editor. Безопасно перезапускать —
-- джоб с тем же именем пересоздаётся, а не дублируется.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'homework-reminders-ping') then
    perform cron.unschedule('homework-reminders-ping');
  end if;
end $$;

select cron.schedule(
  'homework-reminders-ping',
  '* * * * *', -- каждую минуту
  $$
    select net.http_get(
      url := 'https://YOUR-DOMAIN/api/cron/reminders',
      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
    );
  $$
);

-- Проверить, что задача создана и когда сработает в следующий раз:
-- select * from cron.job where jobname = 'homework-reminders-ping';
--
-- Посмотреть историю запусков (успех/ошибка, HTTP-статус ответа):
-- select * from cron.job_run_details
-- where jobid = (select jobid from cron.job where jobname = 'homework-reminders-ping')
-- order by start_time desc limit 20;
--
-- Отключить совсем: select cron.unschedule('homework-reminders-ping');

-- ---------------------------------------------------------------------
-- Удаление старых фото решений (48 часов) — см. CLAUDE.md, раздел про
-- хранение фото. Реже, чем напоминания: точность до минуты тут не нужна,
-- раз в 15 минут более чем достаточно и меньше нагружает pg_net.
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-old-check-photos') then
    perform cron.unschedule('delete-old-check-photos');
  end if;
end $$;

select cron.schedule(
  'delete-old-check-photos',
  '*/15 * * * *', -- каждые 15 минут
  $$
    select net.http_get(
      url := 'https://YOUR-DOMAIN/api/cron/delete-old-photos',
      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
    );
  $$
);

-- Отключить совсем: select cron.unschedule('delete-old-check-photos');
