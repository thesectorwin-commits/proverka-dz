# Проверка домашнего задания — бэкенд

Next.js (App Router) + TypeScript + Supabase + авторизация через Яндекс ID.

## Принципы, заложенные в архитектуру

- **Фотографии не сохраняются нигде** — ни на диске, ни в логах, ни в бэкапах. Base64-строка живёт только в памяти одного запроса (`app/api/checks/route.ts`) и исчезает после ответа.
- **Из Яндекс ID берётся только `id`** — email, имя, аватар осознанно не читаются и не сохраняются (`app/api/auth/yandex/callback/route.ts`).
- **API-ключи (Anthropic, Supabase service_role) существуют только на сервере** — импортируются исключительно в файлах `app/api/**`, никогда в клиентских компонентах.
- **RLS в Supabase включён без публичных политик** — доступ к данным только через `service_role` с сервера.

## Установка

```bash
npm install
cp .env.example .env.local
# заполните .env.local своими ключами (см. разделы ниже)
npm run dev
```

## Настройка Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. Project Settings → API → скопируйте `Project URL` и `service_role` ключ в `.env.local`
3. Откройте SQL Editor → вставьте содержимое `supabase/schema.sql` → Run
4. Чтобы назначить себя администратором: сначала один раз войдите через Яндекс ID на сайте, затем в SQL Editor:

```sql
select id, yandex_id from users; -- найдите свою строку
update users set is_admin = true where yandex_id = 'ВАШ_ЯНДЕКС_ID';
```

## Настройка Яндекс ID

1. [oauth.yandex.ru](https://oauth.yandex.ru/) → создать приложение
2. Платформа: веб-сервисы. Redirect URI: `http://localhost:3000/api/auth/yandex/callback` для разработки (на проде — ваш реальный домен)
3. Скопируйте `client_id` и `client_secret` в `.env.local`

## Деплой на Vercel (этап разработки/тестирования)

1. Загрузите проект в GitHub-репозиторий
2. [vercel.com](https://vercel.com) → New Project → импортируйте репозиторий
3. Добавьте все переменные из `.env.example` в Vercel → Settings → Environment Variables
4. Обновите `YANDEX_REDIRECT_URI` на реальный адрес (`https://ваш-проект.vercel.app/api/auth/yandex/callback`) и в `.env`, и в настройках приложения на oauth.yandex.ru

## Миграция на РФ-хостинг перед реальным запуском

Когда будете готовы к запуску с настоящими пользователями — два отдельных шага:

1. **Приложение**: перенести деплой с Vercel на VPS в Yandex Cloud/Selectel (Next.js запускается через `npm run build && npm run start`, либо в Docker-контейнере — конфигурация не меняется)
2. **База данных**: managed Supabase Cloud физически работает не в РФ. Для соответствия 152-ФЗ нужно либо самостоятельно развернуть Supabase (open-source, есть Docker-образ) на своём РФ-сервере, либо перейти на обычный PostgreSQL в РФ-облаке. Схема из `supabase/schema.sql` — обычный SQL, переносится без изменений.

## Структура проекта

```
app/
  page.tsx                    — лендинг
  login/page.tsx               — страница входа
  dashboard/page.tsx            — личный кабинет
  admin/page.tsx                — админ-панель
  api/
    auth/yandex/route.ts               — редирект на Яндекс OAuth
    auth/yandex/callback/route.ts      — обмен кода, создание пользователя/сессии
    auth/logout/route.ts               — выход
    checks/route.ts                    — загрузка и проверка фото (без сохранения фото)
    checks/[id]/route.ts               — получение одной проверки
    checks/list/route.ts               — история проверок
    me/route.ts                        — профиль + удаление аккаунта
    admin/stats/route.ts               — статистика для админки
lib/
  supabaseServer.ts   — серверный клиент Supabase (service_role)
  session.ts          — сессии на подписанных JWT в httpOnly cookie
  claude.ts           — системный промпт и вызов Claude API (перенесено из прототипа)
  admin.ts            — проверка прав администратора
components/
  PhotoChecker.tsx     — клиентский компонент загрузки фото и результата
supabase/
  schema.sql           — полная схема БД с RLS
```
