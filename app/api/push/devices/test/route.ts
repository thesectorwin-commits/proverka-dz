import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sendTestPush } from '@/lib/webPush';

// Отправляет тестовый пуш на одно конкретное устройство пользователя —
// помогает понять, какая карточка в списке "Устройства для уведомлений"
// соответствует какому физическому телефону.

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== 'string') {
    return NextResponse.json({ error: 'Не указан id устройства' }, { status: 400 });
  }

  const result = await sendTestPush(id, session.userId, {
    title: 'Тестовое уведомление',
    body: 'Если это уведомление пришло сюда — это то самое устройство в списке.',
    url: '/dashboard'
  });

  if (result.total === 0) {
    return NextResponse.json({ error: 'Устройство не найдено' }, { status: 404 });
  }

  return NextResponse.json(result);
}
