import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseServer } from '@/lib/supabaseServer';

// Настройка родителем напоминания "пора делать уроки" — по будним дням,
// одно время на весь аккаунт (см. supabase/schema.sql: reminder_settings).

const VALID_WEEKDAYS = [1, 2, 3, 4, 5];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const { data } = await supabaseServer
    .from('reminder_settings')
    .select('enabled, weekdays, time_of_day')
    .eq('user_id', session.userId)
    .maybeSingle();

  return NextResponse.json({
    enabled: data?.enabled || false,
    weekdays: data?.weekdays || [],
    time: (data?.time_of_day || '17:00:00').slice(0, 5)
  });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const enabled = Boolean(body?.enabled);
  const weekdays = Array.isArray(body?.weekdays) ? body.weekdays : [];
  const time = body?.time;

  if (!weekdays.every((d: unknown) => typeof d === 'number' && VALID_WEEKDAYS.includes(d))) {
    return NextResponse.json({ error: 'Некорректные дни недели' }, { status: 400 });
  }
  if (typeof time !== 'string' || !TIME_RE.test(time)) {
    return NextResponse.json({ error: 'Некорректное время' }, { status: 400 });
  }

  const uniqueWeekdays = [...new Set(weekdays)] as number[];

  // last_sent_date сбрасываем при каждом сохранении: иначе правка времени/дней
  // в тот же день, когда напоминание уже сработало (или сработало по старым,
  // ещё не изменённым настройкам), навсегда блокирует повторную отправку до
  // завтра — родитель меняет время, ждёт, а cron молча пропускает строку.
  const { error } = await supabaseServer.from('reminder_settings').upsert(
    {
      user_id: session.userId,
      enabled,
      weekdays: uniqueWeekdays,
      time_of_day: `${time}:00`,
      last_sent_date: null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('Ошибка сохранения настроек напоминания:', error);
    return NextResponse.json({ error: 'Не удалось сохранить' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
