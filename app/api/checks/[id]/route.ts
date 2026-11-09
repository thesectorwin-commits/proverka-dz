import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const { data: check, error } = await supabaseServer
    .from('checks')
    .select('id, subject, grade, general_comment, created_at, check_tasks(*)')
    .eq('id', params.id)
    .eq('user_id', session.userId) // защита от чтения чужих проверок
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: 'Ошибка чтения данных' }, { status: 500 });
  }
  if (!check) {
    return NextResponse.json({ error: 'Проверка не найдена' }, { status: 404 });
  }

  return NextResponse.json(check);
}
