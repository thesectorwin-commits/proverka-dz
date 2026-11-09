import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabaseServer';
import { PUSH_TEMPLATE_DEFAULTS, PUSH_TEMPLATE_KEYS, PushTemplateKey } from '@/lib/pushTemplates';

// Редактирование текстов автоматических push-уведомлений (готовая проверка,
// напоминание о домашке). Только из админки — сами триггеры отправки
// живут в app/api/checks/route.ts и app/api/cron/reminders/route.ts.

export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const { data } = await supabaseServer.from('push_templates').select('key, title, body');
  const byKey = Object.fromEntries((data || []).map((row) => [row.key, row]));

  const templates = PUSH_TEMPLATE_KEYS.map((key) => ({
    key,
    title: byKey[key]?.title || PUSH_TEMPLATE_DEFAULTS[key].title,
    body: byKey[key]?.body || PUSH_TEMPLATE_DEFAULTS[key].body,
    isCustomized: Boolean(byKey[key])
  }));

  return NextResponse.json({ templates });
}

export async function PUT(request: NextRequest) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const key = body?.key;
  const title = body?.title;
  const text = body?.body;

  if (!PUSH_TEMPLATE_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Некорректный ключ шаблона' }, { status: 400 });
  }
  if (typeof title !== 'string' || !title.trim() || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Укажите заголовок и текст' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('push_templates')
    .upsert(
      { key, title: title.trim(), body: text.trim(), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) {
    console.error('Ошибка сохранения шаблона push:', error);
    return NextResponse.json({ error: 'Не удалось сохранить' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Сброс к дефолтному тексту из кода — просто удаляет переопределение.
export async function DELETE(request: NextRequest) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const key: PushTemplateKey = body?.key;

  if (!PUSH_TEMPLATE_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Некорректный ключ шаблона' }, { status: 400 });
  }

  await supabaseServer.from('push_templates').delete().eq('key', key);

  return NextResponse.json({
    ok: true,
    title: PUSH_TEMPLATE_DEFAULTS[key].title,
    body: PUSH_TEMPLATE_DEFAULTS[key].body
  });
}
