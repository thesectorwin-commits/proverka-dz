import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabaseServer } from '@/lib/supabaseServer';
import { isPhotoStillAvailable } from '@/lib/photoTtl';

// Отдаёт фото решения конкретной проверки — ТОЛЬКО владельцу (по сессии)
// и ТОЛЬКО в течение 48 часов после проверки (см. CLAUDE.md, раздел про
// хранение фото). Бакет check-photos приватный — прямых публичных ссылок
// на файлы нет, единственный путь получить фото — этот эндпоинт.

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const { data: check, error } = await supabaseServer
    .from('checks')
    .select('photo_path, created_at')
    .eq('id', params.id)
    .eq('user_id', session.userId) // защита от чтения чужих фото
    .maybeSingle();

  if (error) {
    console.error('Ошибка чтения проверки для фото:', error);
    return NextResponse.json({ error: 'Ошибка чтения данных' }, { status: 500 });
  }
  if (!check || !isPhotoStillAvailable(check.photo_path, check.created_at)) {
    return NextResponse.json({ error: 'Фото не найдено' }, { status: 404 });
  }

  const { data: file, error: downloadError } = await supabaseServer.storage
    .from('check-photos')
    .download(check.photo_path);

  if (downloadError || !file) {
    console.error('Ошибка загрузки фото из Storage:', downloadError);
    return NextResponse.json({ error: 'Фото не найдено' }, { status: 404 });
  }

  return new NextResponse(file, {
    headers: {
      'Content-Type': file.type || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600'
    }
  });
}
