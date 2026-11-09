import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseServer } from '@/lib/supabaseServer';
import { moscowDayBounds } from '@/lib/moscowDate';
import { isPhotoStillAvailable } from '@/lib/photoTtl';

// Два режима:
//   ?date=YYYY-MM-DD              — проверки за один день (история, до 50)
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD — диапазон для мини-календаря (to не
//                                    включается, обычно первое число
//                                    следующего месяца), до 1000 записей
// Без параметров — последние 50 проверок (как было изначально).

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabaseServer
    .from('checks')
    .select('id, subject, grade, general_comment, created_at, incorrect_count, unclear_count, photo_path')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false });

  if (date) {
    const { gte, lt } = moscowDayBounds(date);
    query = query.gte('created_at', gte).lt('created_at', lt).limit(50);
  } else if (from && to) {
    const { gte } = moscowDayBounds(from);
    const { gte: upperBound } = moscowDayBounds(to);
    query = query.gte('created_at', gte).lt('created_at', upperBound).limit(1000);
  } else {
    query = query.limit(50);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return NextResponse.json({ error: 'Ошибка чтения данных' }, { status: 500 });
  }

  // Наружу отдаём только флаг "есть ли ещё доступное фото" — не сам путь
  // в Storage (внутренняя деталь, к тому же фото после 48 часов удаляются,
  // а запись в checks может почистить photo_path не мгновенно).
  const checks = (data || []).map(({ photo_path, ...rest }) => ({
    ...rest,
    has_photo: isPhotoStillAvailable(photo_path, rest.created_at)
  }));

  return NextResponse.json({ checks });
}
