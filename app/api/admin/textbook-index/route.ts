import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getTextbookIndexEnabled } from '@/lib/aiProvider';

// Тумблер пилота "индекс учебника" (см. lib/textbookIndex.ts,
// lib/openai.ts → tryTextbookIndexCheck) — тот же паттерн, что
// app/api/admin/ai-provider/route.ts.

export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const enabled = await getTextbookIndexEnabled();
  return NextResponse.json({ enabled });
}

export async function PUT(request: NextRequest) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Некорректное значение' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('app_settings')
    .upsert(
      { key: 'textbook_index_enabled', value: String(body.enabled), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) {
    console.error('Ошибка сохранения тумблера индекса учебника:', error);
    return NextResponse.json({ error: 'Не удалось сохранить' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
