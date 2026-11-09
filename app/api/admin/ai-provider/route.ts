import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabaseServer';
import { AI_PROVIDER_DEFAULT, type AiProvider } from '@/lib/aiProvider';

// Переключатель провайдера проверки (Claude ↔ GPT-5.4-mini), тот же
// паттерн, что app/api/admin/push-templates/route.ts — только из админки.

const VALID_PROVIDERS: AiProvider[] = ['claude', 'openai'];

export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const { data } = await supabaseServer.from('app_settings').select('value').eq('key', 'ai_provider').maybeSingle();
  const provider: AiProvider = data?.value === 'openai' ? 'openai' : AI_PROVIDER_DEFAULT;

  return NextResponse.json({ provider, isCustomized: Boolean(data) });
}

export async function PUT(request: NextRequest) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const value = body?.provider;

  if (!VALID_PROVIDERS.includes(value)) {
    return NextResponse.json({ error: 'Некорректное значение провайдера' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('app_settings')
    .upsert({ key: 'ai_provider', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) {
    console.error('Ошибка сохранения провайдера проверки:', error);
    return NextResponse.json({ error: 'Не удалось сохранить' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
