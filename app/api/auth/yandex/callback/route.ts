import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { createSession } from '@/lib/session';
import { publicUrl } from '@/lib/publicUrl';

// GET /api/auth/yandex/callback?code=...
//
// Обмен кода авторизации на access token и получение профиля пользователя.
// ВАЖНО (см. согласованный принцип минимизации ПДн): из ответа Яндекса мы
// сознательно сохраняем ТОЛЬКО id. Остальные поля (login, email, имя,
// аватар), даже если Яндекс их вернул, никуда не записываются и не
// используются — они просто отбрасываются.

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const errorParam = request.nextUrl.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(publicUrl('/login?error=denied', request));
  }
  if (!code) {
    return NextResponse.redirect(publicUrl('/login?error=no_code', request));
  }

  const clientId = process.env.YANDEX_CLIENT_ID;
  const clientSecret = process.env.YANDEX_CLIENT_SECRET;
  const redirectUri = process.env.YANDEX_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Переменные окружения для Яндекс ID не настроены' },
      { status: 500 }
    );
  }

  // Шаг 1: обмениваем код на access token.
  // client_secret участвует только здесь, на сервере — никогда в браузере.
  let accessToken: string;
  try {
    const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const bodyText = await tokenResponse.text();
      console.error('Yandex OAuth token exchange failed:', tokenResponse.status, bodyText);
      return NextResponse.redirect(publicUrl('/login?error=token_exchange', request));
    }

    const tokenData = await tokenResponse.json();
    accessToken = tokenData.access_token;
  } catch (err) {
    console.error('Yandex OAuth token exchange network error:', err);
    return NextResponse.redirect(publicUrl('/login?error=network', request));
  }

  // Шаг 2: получаем профиль пользователя, но используем из него только id.
  let yandexId: string;
  try {
    const profileResponse = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${accessToken}` }
    });

    if (!profileResponse.ok) {
      return NextResponse.redirect(publicUrl('/login?error=profile_fetch', request));
    }

    const profile = await profileResponse.json();
    yandexId = String(profile.id);
    // Осознанно НЕ читаем profile.login / profile.default_email /
    // profile.real_name и т.д. — они отбрасываются здесь же.
  } catch (err) {
    console.error('Yandex profile fetch network error:', err);
    return NextResponse.redirect(publicUrl('/login?error=network', request));
  }

  // Шаг 3: находим или создаём пользователя по yandex_id.
  const { data: existingUser, error: selectError } = await supabaseServer
    .from('users')
    .select('id')
    .eq('yandex_id', yandexId)
    .maybeSingle();

  if (selectError) {
    console.error('Supabase select error:', selectError);
    return NextResponse.redirect(publicUrl('/login?error=db', request));
  }

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const { data: newUser, error: insertError } = await supabaseServer
      .from('users')
      .insert({ yandex_id: yandexId })
      .select('id')
      .single();

    if (insertError || !newUser) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.redirect(publicUrl('/login?error=db', request));
    }
    userId = newUser.id;
  }

  await createSession({ userId });

  return NextResponse.redirect(publicUrl('/dashboard', request));
}
