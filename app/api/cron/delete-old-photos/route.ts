import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { PHOTO_TTL_HOURS } from '@/lib/photoTtl';

// Реально удаляет фото решений старше 48 часов из Supabase Storage и
// чистит checks.photo_path — без этого lib/photoTtl.ts просто перестаёт
// СЧИТАТЬ фото доступным по TTL (защита на уровне API), но сам файл
// продолжал бы бессрочно занимать место в Storage. Дёргается расписанием
// pg_cron/pg_net (см. supabase/cron.sql), защищено тем же CRON_SECRET,
// что и /api/cron/reminders — тот же паттерн секрета в query или заголовке.

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

  const cutoff = new Date(Date.now() - PHOTO_TTL_HOURS * 60 * 60 * 1000).toISOString();

  // Порциями по 500 — если вдруг накопится большой бэклог, крон бьёт
  // достаточно часто, чтобы разгрести его за несколько запусков.
  const { data: expired, error } = await supabaseServer
    .from('checks')
    .select('id, photo_path')
    .not('photo_path', 'is', null)
    .lt('created_at', cutoff)
    .limit(500);

  if (error) {
    console.error('Ошибка чтения старых фото для удаления:', error);
    return NextResponse.json({ error: 'Не удалось прочитать список' }, { status: 500 });
  }

  let deleted = 0;
  if (expired && expired.length > 0) {
    const paths = expired.map((c) => c.photo_path as string);
    const { error: removeError } = await supabaseServer.storage.from('check-photos').remove(paths);

    if (removeError) {
      // Не чистим photo_path в БД, если файл реально не удалился — иначе
      // потеряем ссылку на него, и он останется в Storage навсегда.
      // Просто попробуем ещё раз при следующем запуске крона.
      console.error('Ошибка удаления фото из Storage, повторим при следующем запуске:', removeError);
    } else {
      deleted = paths.length;
      await supabaseServer
        .from('checks')
        .update({ photo_path: null })
        .in(
          'id',
          expired.map((c) => c.id)
        );
    }
  }

  return NextResponse.json({ checked: expired?.length || 0, deleted });
}
