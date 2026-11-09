import type { NextRequest } from 'next/server';

// Абсолютный адрес на этом же сайте для NextResponse.redirect.
//
// `new URL(path, request.url)` строит адрес от внутреннего хоста сервера. За reverse-proxy (самохостинг: nginx → Next
// standalone на 127.0.0.1:3001) это даёт https://localhost:3001/..., и после входа через Яндекс браузер уходит на
// localhost. Берём реальный хост и протокол обращения из заголовков, которые выставляет прокси (на Vercel они тоже
// верные). Если заголовков нет — прежнее поведение.
export function publicUrl(path: string, request: NextRequest): URL {
  const first = (v: string | null) => (v ? v.split(',')[0].trim() : '');
  const host = first(request.headers.get('x-forwarded-host')) || first(request.headers.get('host'));
  if (!host || !/^[A-Za-z0-9.\-:\[\]]+$/.test(host)) return new URL(path, request.url);
  const proto = first(request.headers.get('x-forwarded-proto'));
  return new URL(path, `${proto === 'http' ? 'http' : 'https'}://${host}`);
}
