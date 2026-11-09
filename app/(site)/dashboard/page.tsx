import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseServer } from '@/lib/supabaseServer';
import { getMoscowDateStr, moscowDayBounds } from '@/lib/moscowDate';
import { isPhotoStillAvailable } from '@/lib/photoTtl';
import DashboardShell from '@/components/DashboardShell';
import { themeColorViewport } from '@/lib/themeColor';

// 06.09.2026: та же правка, что и на главной (app/(site)/page.tsx) — по
// умолчанию theme-color сайта белый (#FFFEFB, app/layout.tsx), Safari
// красит им свой статус-бар/адресную строку, а личный кабинет бежевый
// (#F4F1E9, DashboardShell.tsx) — без этого над шапкой был виден белый шов.
// 09.09.2026: см. lib/themeColor.ts — доп. митигация нестабильности Safari
// (два тега с media вместо одного); переустановка на клиенте — в самом
// DashboardShell.tsx (<ThemeColorSync>), так как эта страница серверная.
export const viewport = themeColorViewport('#F4F1E9');

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  // История теперь построена вокруг календаря — по умолчанию открывается
  // сегодняшний день, поэтому сразу грузим проверки за сегодня (а не
  // просто "последние N" без учёта дат), до 50 (см. HistoryTab.tsx).
  const { gte, lt } = moscowDayBounds(getMoscowDateStr());
  const { data: todayChecksRaw } = await supabaseServer
    .from('checks')
    .select('id, subject, grade, general_comment, created_at, incorrect_count, unclear_count, photo_path')
    .eq('user_id', session!.userId)
    .gte('created_at', gte)
    .lt('created_at', lt)
    .order('created_at', { ascending: false })
    .limit(50);

  const todayChecks = (todayChecksRaw || []).map(({ photo_path, ...rest }) => ({
    ...rest,
    has_photo: isPhotoStillAvailable(photo_path, rest.created_at)
  }));

  return (
    <Suspense>
      <DashboardShell initialTodayChecks={todayChecks} />
    </Suspense>
  );
}
