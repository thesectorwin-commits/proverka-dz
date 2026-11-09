import { NextRequest, NextResponse } from 'next/server';
import { ImageInput } from '@/lib/claude';
import { detectSolutionTaskNumber } from '@/lib/openai';

export const maxDuration = 60;

// POST /api/checks/verify-task-number — механическая (кодовая) сверка
// номера задания, дополнительная защита к «Выбор задания на фото
// учебника» (см. CLAUDE.md). Реальный прод-кейс: пользователь может
// подтвердить уже неверно выбранное задание, и дальше единственной
// защитой оставался ненадёжный photo_mismatch внутри основного вызова
// (0 из 3 в контрольном тесте). Номер с фото учебника уже известен
// (передаётся клиентом — печатный текст, читается надёжно), здесь
// читаем ТОЛЬКО номер, который ребёнок мог написать в начале решения, и
// сравниваем в коде — не полагаемся на суждение модели о "похожести".
//
// Принимает "photo" (решение) и "taskNumber" (номер выбранного задания
// с фото учебника). Возвращает {matches, solutionNumber}:
// - matches: true — номера совпали;
// - matches: false — номера явно разошлись;
// - matches: null — сравнить не удалось (номер в решении не написан или
//   не читается, или сбой) — клиент в этом случае тоже показывает
//   предупреждение (не различаем "точно не то" и "не смогли проверить" —
//   оба случая требуют подтверждения пользователя).
// Без сессии — работает и для анонимных проверок, как и /api/checks.
// Фото не сохраняется — читается в буфер, кодируется в base64, уходит в
// OpenAI API и выходит из области видимости.

function normalizeNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const photo = formData.get('photo');
  const taskNumber = formData.get('taskNumber')?.toString() || '';
  const normalizedTask = normalizeNumber(taskNumber);

  if (!(photo instanceof Blob) || photo.size > 8 * 1024 * 1024 || !normalizedTask) {
    return NextResponse.json({ matches: null, solutionNumber: null });
  }

  try {
    const arrayBuffer = await photo.arrayBuffer();
    const image: ImageInput = {
      base64: Buffer.from(arrayBuffer).toString('base64'),
      mediaType: photo.type || 'image/jpeg'
    };
    const { number } = await detectSolutionTaskNumber(image);

    if (!number) {
      return NextResponse.json({ matches: null, solutionNumber: null });
    }

    const normalizedSolution = normalizeNumber(number);
    const matches = normalizedSolution.length > 0 && normalizedSolution === normalizedTask;
    return NextResponse.json({ matches, solutionNumber: number });
  } catch (err: any) {
    console.error('Ошибка сверки номера задания:', err?.message);
    return NextResponse.json({ matches: null, solutionNumber: null });
  }
}
