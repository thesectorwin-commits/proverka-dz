import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseServer } from '@/lib/supabaseServer';

// Список подписанных устройств текущего пользователя + возможность
// пометить каждое как "родитель"/"ребёнок" — чтобы потом фильтровать,
// на какие устройства уходит конкретный тип пуша.

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from('push_subscriptions')
    .select('id, device_type, device_label, user_agent, created_at')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Не удалось получить список устройств' }, { status: 500 });
  }

  return NextResponse.json({ devices: data || [] });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const deviceType = body?.deviceType;
  const deviceLabel = body?.deviceLabel;

  if (typeof id !== 'string') {
    return NextResponse.json({ error: 'Не указан id устройства' }, { status: 400 });
  }
  if (deviceType !== null && deviceType !== 'parent' && deviceType !== 'child') {
    return NextResponse.json({ error: 'Некорректный тип устройства' }, { status: 400 });
  }
  if (deviceLabel !== null && typeof deviceLabel !== 'string') {
    return NextResponse.json({ error: 'Некорректная метка устройства' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('push_subscriptions')
    .update({ device_type: deviceType, device_label: deviceLabel })
    .eq('id', id)
    .eq('user_id', session.userId); // нельзя редактировать чужие подписки

  if (error) {
    return NextResponse.json({ error: 'Не удалось сохранить' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Ручное удаление устройства из списка — например, старой подписки-дубля
// (см. CLAUDE.md про client_device_id) или телефона, которым уже не
// пользуются. Само устройство просто перестаёт получать пуши.
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== 'string') {
    return NextResponse.json({ error: 'Не указан id устройства' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('push_subscriptions')
    .delete()
    .eq('id', id)
    .eq('user_id', session.userId); // нельзя удалить чужую подписку

  if (error) {
    return NextResponse.json({ error: 'Не удалось удалить' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
