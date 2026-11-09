import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// Простая сессия: подписанный JWT в httpOnly-cookie. Никаких персональных
// данных внутри токена — только внутренний user_id (uuid), который ничего
// не говорит о личности сам по себе.

const COOKIE_NAME = 'session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 дней

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET должен быть задан и быть не короче 32 символов (сгенерируйте: openssl rand -base64 32)'
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ userId: payload.userId })
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

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== 'string') return null;
    return { userId: payload.userId };
  } catch {
    return null; // истёк, подделан или повреждён — считаем что сессии нет
  }
}

export function destroySession() {
  cookies().delete(COOKIE_NAME);
}
