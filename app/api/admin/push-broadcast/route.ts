import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { sendPushToAll } from '@/lib/webPush';

// POST — рассылка произвольного push-уведомления всем подписанным
// пользователям. Доступно только из админки, текст вводится вручную при
// каждой отправке — не путать с components/AdminPushTemplates.tsx, где
// редактируются тексты уже существующих автоматических триггеров
// (готовая проверка, напоминание о домашке).

export async function POST(request: NextRequest) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const title = body?.title;
  const text = body?.body;
  const target = body?.target;

  if (typeof title !== 'string' || !title.trim() || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Укажите заголовок и текст уведомления' }, { status: 400 });
  }
  if (target !== undefined && target !== 'all' && target !== 'parent' && target !== 'child') {
    return NextResponse.json({ error: 'Некорректный получатель' }, { status: 400 });
  }

  const result = await sendPushToAll(
    {
      title: title.trim(),
      body: text.trim(),
      url: typeof body?.url === 'string' && body.url ? body.url : '/dashboard'
    },
    target === 'parent' || target === 'child' ? target : undefined
  );

  return NextResponse.json(result);
}
