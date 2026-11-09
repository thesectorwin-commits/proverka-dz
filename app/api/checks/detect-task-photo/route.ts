import { NextRequest, NextResponse } from 'next/server';
import { ImageInput } from '@/lib/claude';
import { detectTasksOnTaskPhoto } from '@/lib/openai';

export const maxDuration = 60;

// POST /api/checks/detect-task-photo — вспомогательный шаг сценария
// needs_task_photo/photo_mismatch (см. CLAUDE.md, «Выбор задания на фото
// учебника»). Принимает "taskPhoto" (страничка учебника с условием),
// возвращает список найденных на фото заданий с координатами
// (yStartPercent/yEndPercent) — клиент показывает кликабельные области
// поверх фото, пользователь сам указывает нужное. Без сессии — работает
// и для анонимных проверок, как и /api/checks. Best-effort: любая ошибка
// (сеть, парсинг, 0 найденных заданий) возвращает пустой список —
// клиент в этом случае просто пропускает экран выбора и отправляет фото
// целиком, как раньше. Фото не сохраняется — читается в буфер,
// кодируется в base64, уходит в OpenAI API и выходит из области видимости.

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const taskPhoto = formData.get('taskPhoto');

  if (!(taskPhoto instanceof Blob) || taskPhoto.size > 8 * 1024 * 1024) {
    return NextResponse.json({ tasks: [] });
  }

  try {
    const arrayBuffer = await taskPhoto.arrayBuffer();
    const image: ImageInput = {
      base64: Buffer.from(arrayBuffer).toString('base64'),
      mediaType: taskPhoto.type || 'image/jpeg'
    };
    const { tasks } = await detectTasksOnTaskPhoto(image);
    return NextResponse.json({ tasks });
  } catch (err: any) {
    console.error('Ошибка распознавания заданий на фото учебника:', err?.message);
    return NextResponse.json({ tasks: [] });
  }
}
