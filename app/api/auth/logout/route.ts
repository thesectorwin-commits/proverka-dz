import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';
import { publicUrl } from '@/lib/publicUrl';

// Вызывается через обычный HTML-form POST (components/ProfileTab.tsx), а не
// fetch — значит браузер сам переходит на URL из ответа. JSON здесь раньше
// просто отображался как голая страница вместо возврата на главную.
export async function POST(request: NextRequest) {
  destroySession();
  return NextResponse.redirect(publicUrl('/', request), { status: 303 });
}
