import { createClient } from '@supabase/supabase-js';

// ВАЖНО: этот файл использует SUPABASE_SERVICE_ROLE_KEY — ключ с полным
// доступом к базе в обход RLS. Он должен существовать только в серверном
// окружении (переменные без префикса NEXT_PUBLIC_) и никогда не должен
// попасть в клиентский бандл или в браузер.
//
// Импортируйте этот модуль только из файлов внутри app/api/** или из
// серверных компонентов — никогда из компонентов с 'use client'.

if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL не задан в переменных окружения');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY не задан в переменных окружения');
}

export const supabaseServer = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);
