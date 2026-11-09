import { NextResponse } from 'next/server';
import { getSession, destroySession } from '@/lib/session';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const { data: user } = await supabaseServer
    .from('users')
    .select('id, is_admin, created_at')
    .eq('id', session.userId)
    .maybeSingle();

  return NextResponse.json({ user });
}

// Удаление аккаунта и всех связанных данных — обязательный пункт по 152-ФЗ.
// children/checks/check_tasks удалятся каскадно благодаря "on delete cascade"
// в схеме БД.
export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const { error } = await supabaseServer.from('users').delete().eq('id', session.userId);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: 'Не удалось удалить аккаунт' }, { status: 500 });
  }

  destroySession();
  return NextResponse.json({ ok: true });
}
