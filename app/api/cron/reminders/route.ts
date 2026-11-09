import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { sendPushToUser } from '@/lib/webPush';
import { getPushTemplate } from '@/lib/pushTemplates';

// Дёргается расписанием pg_cron/pg_net из самой Supabase-базы
// (см. supabase/cron.sql, CLAUDE.md — раздел про напоминания) примерно
// раз в минуту. Не завязан на Vercel Cron специально, чтобы работать и на
// бесплатном тарифе (там cron не чаще раза в день).
//
// Окно допуска (TOLERANCE_MINUTES) — на случай, если планировщик дёрнет
// эндпоинт на пару минут позже целевого времени: не хотим, чтобы
// напоминание тихо пропало из-за дребезга таймера. last_sent_date в
// reminder_settings защищает от повторной отправки в тот же день, даже
// если пинг за это окно прилетит несколько раз.

const TOLERANCE_MINUTES = 9;

function getMoscowNow() {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Moscow',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );

  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  return {
    weekday: weekdayMap[parts.weekday as string],
    minutesSinceMidnight: Number(parts.hour) * 60 + Number(parts.minute),
    dateStr: `${parts.year}-${parts.month}-${parts.day}`
  };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET не настроен' }, { status: 500 });
  }

  const provided =
    request.nextUrl.searchParams.get('secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const { weekday, minutesSinceMidnight, dateStr } = getMoscowNow();

  // last_sent_date.is.null покрывает ещё ни разу не сработавшие напоминания —
  // обычный .neq() в Postgres не матчит NULL, поэтому нужен явный .or().
  const { data: candidates, error } = await supabaseServer
    .from('reminder_settings')
    .select('user_id, weekdays, time_of_day, last_sent_date')
    .eq('enabled', true)
    .contains('weekdays', [weekday])
    .or(`last_sent_date.is.null,last_sent_date.neq.${dateStr}`);

  if (error) {
    console.error('Ошибка чтения расписания напоминаний:', error);
    return NextResponse.json({ error: 'Не удалось прочитать расписание' }, { status: 500 });
  }

  let sent = 0;
  let template: { title: string; body: string } | null = null;

  for (const row of candidates || []) {
    const [h, m] = String(row.time_of_day).split(':').map(Number);
    const targetMinutes = h * 60 + m;
    const diff = minutesSinceMidnight - targetMinutes;

    if (diff < 0 || diff > TOLERANCE_MINUTES) continue;

    if (!template) {
      template = await getPushTemplate('reminder');
    }

    const result = await sendPushToUser(
      row.user_id,
      {
        title: template.title,
        body: template.body,
        url: '/dashboard'
      },
      'child'
    );
    if (result.total > 0) sent++;

    await supabaseServer.from('reminder_settings').update({ last_sent_date: dateStr }).eq('user_id', row.user_id);
  }

  return NextResponse.json({ checked: (candidates || []).length, sent });
}
