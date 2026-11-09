import { NextResponse } from 'next/server';

// GET /api/auth/yandex — просто перенаправляет на страницу авторизации
// Яндекса. Кнопка "Войти через Яндекс ID" на фронтенде ведёт сюда.

// Без этого Next.js предрендерит маршрут при сборке (он не читает запрос) и «запечёт» YANDEX_CLIENT_ID/YANDEX_REDIRECT_URI
// из окружения сборки. При самохостинге сборка идёт в CI с тестовыми значениями, и Яндекс получал client_id=build.
export const dynamic = 'force-dynamic';

export async function GET() {
  const clientId = process.env.YANDEX_CLIENT_ID;
  const redirectUri = process.env.YANDEX_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'YANDEX_CLIENT_ID или YANDEX_REDIRECT_URI не заданы' },
      { status: 500 }
    );
  }

  const authUrl = new URL('https://oauth.yandex.ru/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  // force_confirm показывает экран согласия каждый раз — полезно на этапе
  // разработки, чтобы видеть, какие данные реально запрашиваются.
  authUrl.searchParams.set('force_confirm', 'yes');

  return NextResponse.redirect(authUrl.toString());
}
