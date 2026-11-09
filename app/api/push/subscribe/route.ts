import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  const clientDeviceId = typeof body?.clientDeviceId === 'string' ? body.clientDeviceId : null;

  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return NextResponse.json({ error: 'Некорректная подписка' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent') || null;

  // Первое устройство, которое пользователь когда-либо подписал на этом
  // аккаунте, по умолчанию считается устройством родителя (см. CLAUDE.md).
  // Дальше владелец аккаунта размечает устройства вручную в личном кабинете —
  // здесь мы не трогаем device_type для уже существующих подписок (upsert
  // ниже просто не включает это поле в payload, если устройство не первое).
  const { count } = await supabaseServer
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.userId);

  const upsertPayload: Record<string, unknown> = {
    user_id: session.userId,
    endpoint,
    p256dh,
    auth,
    user_agent: userAgent,
    client_device_id: clientDeviceId
  };
  if (!count) {
    upsertPayload.device_type = 'parent';
  }

  // Тот же физический телефон мог раньше подписаться с другим endpoint
  // (переподписка, сброс разрешений, особенности iOS) — тогда старая
  // запись остаётся в базе как "призрак" и дублирует устройство в списке
  // (см. CLAUDE.md). Раз мы узнали это устройство по client_device_id,
  // переносим его пометку "родитель/ребёнок" и название на новую запись,
  // а старые (другой endpoint, тот же client_device_id) удаляем.
  if (clientDeviceId) {
    const { data: staleRows } = await supabaseServer
      .from('push_subscriptions')
      .select('id, device_type, device_label')
      .eq('user_id', session.userId)
      .eq('client_device_id', clientDeviceId)
      .neq('endpoint', endpoint);

    const carryOver = staleRows?.find((r) => r.device_type || r.device_label);
    if (carryOver) {
      upsertPayload.device_type = carryOver.device_type;
      upsertPayload.device_label = carryOver.device_label;
    }

    if (staleRows && staleRows.length > 0) {
      await supabaseServer
        .from('push_subscriptions')
        .delete()
        .eq('user_id', session.userId)
        .eq('client_device_id', clientDeviceId)
        .neq('endpoint', endpoint);
    }
  }

  const { error } = await supabaseServer
    .from('push_subscriptions')
    .upsert(upsertPayload, { onConflict: 'endpoint' });

  if (error) {
    console.error('Ошибка сохранения push-подписки:', error);
    return NextResponse.json({ error: 'Не удалось сохранить подписку' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
