import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// Сессия админки — отдельный cookie от обычной пользовательской сессии
// (lib/session.ts). Намеренно не связана с таблицей users: вход по
// логину/паролю из переменных окружения, а не через Яндекс ID.

const COOKIE_NAME = 'admin_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 дней

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET должен быть задан и быть не короче 32 символов (сгенерируйте: openssl rand -base64 32)'
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createAdminSession() {
  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS
  });
}

export async function getAdminSession(): Promise<boolean> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.admin === true;
  } catch {
    return false; // истёк, подделан или повреждён — считаем что сессии нет
  }
}

export function destroyAdminSession() {
  cookies().delete(COOKIE_NAME);
}
