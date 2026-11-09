import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/adminAuth';
import { createAdminSession } from '@/lib/adminSession';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUsername || !expectedHash) {
    return NextResponse.json({ error: 'Вход в админку не настроен на сервере' }, { status: 500 });
  }

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username !== expectedUsername ||
    !verifyPassword(password, expectedHash)
  ) {
    return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
