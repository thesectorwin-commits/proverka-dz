import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const VALID_TIERS = ['299', '599', '899'];

// POST /api/pricing-vote
// Body: { tier: "299" | "599" | "899" | null, choice: "ok" | "no" }
//
// Анонимный опрос про приемлемую цену подписки (тестовый режим сервиса).
// Ничего личного не собираем — только сам голос, без привязки к
// пользователю или IP.

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || (body.choice !== 'ok' && body.choice !== 'no')) {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
  }

  const tier = body.choice === 'ok' ? body.tier : null;
  if (body.choice === 'ok' && !VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: 'Некорректный тариф' }, { status: 400 });
  }

  const { error } = await supabaseServer.from('pricing_votes').insert({
    tier,
    choice: body.choice
  });

  if (error) {
    console.error('Ошибка сохранения голоса по тарифу:', error);
    return NextResponse.json({ error: 'Не удалось сохранить голос' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
