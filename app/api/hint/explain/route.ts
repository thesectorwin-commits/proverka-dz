import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { explainTask, ImageInput } from '@/lib/claude';
import { explainTaskOpenAI } from '@/lib/openai';
import { getAiProvider } from '@/lib/aiProvider';

export const maxDuration = 60;

// POST /api/hint/explain — раздел "Подсказать", шаг 2 из 2 (единственный
// шаг с 27.08.2026 — см. ниже). Принимает "photo" и "task" (JSON-строка).
// Объясняет метод решения, не называя ответ (см. lib/claude.ts →
// explainTask / lib/openai.ts → explainTaskOpenAI). Ничего не сохраняется —
// это не проверка с оценкой.
//
// 19.08.2026: переключатель провайдера (lib/aiProvider.ts) теперь
// действует и здесь, а не только на /api/checks — по прямому запросу
// владельца.
//
// 27.08.2026: раздел "Подсказать" перешёл на ручную рамку — ребёнок сам
// выделяет полосу на фото (двигает и сужает по вертикали; по горизонтали
// всегда вся ширина страницы, см. components/CropSelector.tsx), без
// отдельного шага авто-детекта заданий моделью. Старая форма "task"
// (number+condition, найденные через /api/hint/detect) по-прежнему
// принимается — эндпоинт для отката не менялся, изменения только в
// explainTask/explainTaskOpenAI (условие стало необязательным) — поэтому
// валидация ниже принимает ЛИБО старую форму (condition есть), ЛИБО
// новую (все 4 процента координат — числа).

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const formData = await request.formData();
  const photo = formData.get('photo');
  const taskRaw = formData.get('task');

  if (!(photo instanceof Blob)) {
    return NextResponse.json({ error: 'Фото не передано' }, { status: 400 });
  }
  if (photo.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'Фото слишком большое (максимум 8 МБ)' }, { status: 400 });
  }
  if (typeof taskRaw !== 'string') {
    return NextResponse.json({ error: 'Не передано задание' }, { status: 400 });
  }

  let task: {
    number?: string;
    condition?: string;
    yStartPercent?: number;
    yEndPercent?: number;
    xStartPercent?: number;
    xEndPercent?: number;
  };
  try {
    task = JSON.parse(taskRaw);
  } catch {
    return NextResponse.json({ error: 'Некорректные данные задания' }, { status: 400 });
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const hasManualRegion =
    typeof task.xStartPercent === 'number' &&
    typeof task.xEndPercent === 'number' &&
    typeof task.yStartPercent === 'number' &&
    typeof task.yEndPercent === 'number';

  if (!task.condition && !hasManualRegion) {
    return NextResponse.json({ error: 'Некорректные данные задания' }, { status: 400 });
  }
  // Не доверяем процентам от клиента буквально — клэмпим в 0..100 (та же
  // предосторожность, что cropImageByPercent уже применяет по Y).
  if (hasManualRegion) {
    task.xStartPercent = clamp(task.xStartPercent!);
    task.xEndPercent = clamp(task.xEndPercent!);
    task.yStartPercent = clamp(task.yStartPercent!);
    task.yEndPercent = clamp(task.yEndPercent!);
  }

  const arrayBuffer = await photo.arrayBuffer();
  const image: ImageInput = {
    base64: Buffer.from(arrayBuffer).toString('base64'),
    mediaType: photo.type || 'image/jpeg'
  };

  try {
    const provider = await getAiProvider();
    const result = provider === 'openai' ? await explainTaskOpenAI(image, task) : await explainTask(image, task);
    return NextResponse.json({
      number: task.number || '',
      condition: result.condition ?? task.condition ?? '',
      explanation: result.explanation || 'Не получилось составить подсказку — попробуйте ещё раз.'
    });
  } catch (err: any) {
    console.error('Ошибка составления подсказки:', err?.message);
    return NextResponse.json({ error: err?.message || 'Не удалось составить подсказку' }, { status: 502 });
  }
}
