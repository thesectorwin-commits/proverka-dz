import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { detectTasksForHint, ImageInput } from '@/lib/claude';
import { detectTasksOnTaskPhoto } from '@/lib/openai';
import { getAiProvider } from '@/lib/aiProvider';

export const maxDuration = 60;

// POST /api/hint/detect — раздел "Подсказать" (сценарий 3, см. CLAUDE.md),
// шаг 1 из 2. Принимает "photo" (задание, которое ребёнок ещё НЕ решил),
// возвращает список найденных на фото заданий с приблизительным
// положением (yStartPercent/yEndPercent) — чтобы на клиенте показать
// кликабельные области поверх фото. Ничего не сохраняется — фото читается
// в память, кодируется в base64, уходит в Anthropic/OpenAI API и выходит
// из области видимости, как и везде в проекте.
//
// 19.08.2026: раньше раздел «Подсказать» был жёстко привязан к Claude
// независимо от переключателя провайдера в админке (lib/aiProvider.ts) —
// по прямому запросу владельца переключатель теперь распространяется и
// сюда. detectTasksOnTaskPhoto (lib/openai.ts) — уже существующая
// функция (та же роль для «Выбор задания на фото учебника»), переиспользуем
// как есть — промпт (DETECT_TASKS_PROMPT) общий с detectTasksForHint.

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const formData = await request.formData();
  const photo = formData.get('photo');

  if (!(photo instanceof Blob)) {
    return NextResponse.json({ error: 'Фото не передано' }, { status: 400 });
  }
  if (photo.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'Фото слишком большое (максимум 8 МБ)' }, { status: 400 });
  }

  const arrayBuffer = await photo.arrayBuffer();
  const image: ImageInput = {
    base64: Buffer.from(arrayBuffer).toString('base64'),
    mediaType: photo.type || 'image/jpeg'
  };

  try {
    const provider = await getAiProvider();
    const { subject, tasks } = provider === 'openai' ? await detectTasksOnTaskPhoto(image) : await detectTasksForHint(image);
    if (tasks.length === 0) {
      return NextResponse.json(
        { error: 'Не удалось найти задания на фото — попробуйте более чёткое фото' },
        { status: 422 }
      );
    }
    return NextResponse.json({ subject, tasks });
  } catch (err: any) {
    console.error('Ошибка распознавания заданий для подсказки:', err?.message);
    return NextResponse.json({ error: err?.message || 'Не удалось обработать фото' }, { status: 502 });
  }
}
