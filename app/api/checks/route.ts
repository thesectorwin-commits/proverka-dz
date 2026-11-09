import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSession } from '@/lib/session';
import { supabaseServer } from '@/lib/supabaseServer';
import { cropImageByPercent, createDetailCropsFromImage, ImageInput } from '@/lib/claude';
import { getAiProvider } from '@/lib/aiProvider';
import { runCheck } from '@/lib/runCheck';
import { sendPushToUser } from '@/lib/webPush';
import { getPushTemplate, renderTemplate } from '@/lib/pushTemplates';

// По умолчанию у serverless-функции Vercel лимит выполнения — единицы секунд,
// а checkHomeworkPhoto() может делать до 3 последовательных запросов к
// Anthropic (предпроверка needs_task_photo + основная проверка + возможная
// перепроверка спорных заданий) — без явного увеличения лимита запрос может
// оборваться раньше, чем модель успеет ответить, и клиент увидит "Load failed".
export const maxDuration = 60;

const FREE_CHECKS_PER_MONTH = 5;

const VALID_SUBJECTS = ['math', 'russian', 'english', 'world'];

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Математика',
  russian: 'Русский язык',
  english: 'Английский язык',
  world: 'Окружающий мир'
};

// Модель обычно возвращает subject верно, но на всякий случай (неожиданное
// значение, пустая строка) подстраховываемся дефолтом — иначе upsert в БД
// упадёт на check-constraint колонки checks.subject.
function normalizeSubject(subject: unknown): string {
  if (typeof subject === 'string' && VALID_SUBJECTS.includes(subject)) {
    return subject;
  }
  console.warn('Модель не вернула валидный subject, используется fallback "math":', subject);
  return 'math';
}

// Без авторизации проверка тоже работает (как в исходном прототипе), но
// результат нигде не сохраняется — истории у гостя нет. Чтобы открытый
// анонимный доступ к платному Claude API нельзя было накрутить, отдельно
// ограничиваем анонимные запросы по IP.
const ANONYMOUS_CHECKS_PER_DAY = 3;

// Сам IP-адрес нигде не сохраняется — только его хеш с солью из
// SESSION_SECRET, этого достаточно для суточного счётчика.
function hashIp(ip: string): string {
  const salt = process.env.SESSION_SECRET || '';
  return createHash('sha256').update(`${ip}:${salt}`).digest('hex');
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

async function blobToImage(blob: Blob): Promise<ImageInput> {
  const arrayBuffer = await blob.arrayBuffer();
  return { base64: Buffer.from(arrayBuffer).toString('base64'), mediaType: blob.type || 'image/jpeg' };
}

// Провайдер проверки переключается из админки (см. lib/aiProvider.ts) —
// 'claude' (Haiku 4.5 + Sonnet 4.6, по умолчанию) или 'openai'
// (gpt-5.4-mini, эксперимент, см. lib/openai.ts и CLAUDE.md). При сбое
// OpenAI API — без автоматического fallback на Claude, просто ошибка
// пользователю (осознанное решение, см. план фичи).
//
// 20.08.2026: перед обычным пайплайном — попытка узкой проверки по индексу
// учебника (пилот, см. lib/textbookIndex.ts и lib/openai.ts →
// tryTextbookIndexCheck), только для одного фото и только если включён
// отдельный тумблер в админке (по умолчанию выключен — поведение не
// меняется, пока админ явно не включит). При null (индекс не подошёл —
// не математика/не сопоставилось/неподдерживаемый тип задания) — обычный
// путь, как раньше. providerUsed попадает в checks.ai_provider
// ('index'/'claude'/'openai') — видно в админке, какой путь реально
// обработал проверку.
//
// 09.10.2026: сама функция вынесена в lib/runCheck.ts — переиспользуется
// и здесь (анонимная/авторизованная ветки), и в app/api/checks/demo/route.ts
// (живая демо-проверка на главной).

// POST /api/checks
// Body: multipart/form-data с полем "photo" (решение ученика), опциональным
// "taskPhoto" (условие задания из учебника — если модель не смогла понять
// условие по одному фото, см. needs_task_photo) и опциональным "childId".
//
// ВАЖНО: фото прочитываются в буфер в памяти, кодируются в base64, уходят
// в Anthropic API и после ответа выбрасываются сборщиком мусора. Они НЕ
// записываются на диск, НЕ логируются, НЕ попадают в бэкапы — в базе
// остаётся только структурированный текстовый результат (и то только для
// авторизованных пользователей).

export async function POST(request: NextRequest) {
  const session = await getSession();

  const formData = await request.formData();
  const photo = formData.get('photo');
  const taskPhoto = formData.get('taskPhoto');
  const childId = formData.get('childId')?.toString() || null;
  // Координаты конкретного задания, выбранного пользователем на фото
  // учебника (см. CLAUDE.md, «Выбор задания на фото учебника») — вместо
  // того чтобы заставлять модель самой искать нужное задание среди
  // нескольких на развороте (ненадёжно, см. историю про photo_mismatch),
  // пользователь указывает его сам, а сервер обрезает фото по координатам
  // ниже. Необязательное поле — если не передано (старое поведение или
  // детект не нашёл заданий), taskPhoto используется целиком, как раньше.
  const taskRegionRaw = formData.get('taskRegion')?.toString();
  let taskRegion: { yStartPercent: number; yEndPercent: number } | null = null;
  if (taskRegionRaw) {
    try {
      const parsed = JSON.parse(taskRegionRaw);
      if (typeof parsed.yStartPercent === 'number' && typeof parsed.yEndPercent === 'number') {
        taskRegion = parsed;
      }
    } catch {
      // Игнорируем некорректный JSON — используем фото учебника целиком.
    }
  }
  // Область самого фото РЕШЕНИЯ, выделенная пользователем вручную полосой
  // (см. CLAUDE.md, «Выделение области задания при проверке») — на странице
  // тетради может быть несколько заданий, и не все из них нужно проверять
  // сейчас (часть могла быть уже проверена раньше). Необязательное поле —
  // если не передано, фото решения используется целиком, как раньше.
  const solutionRegionRaw = formData.get('solutionRegion')?.toString();
  let solutionRegion: { yStartPercent: number; yEndPercent: number } | null = null;
  if (solutionRegionRaw) {
    try {
      const parsed = JSON.parse(solutionRegionRaw);
      if (typeof parsed.yStartPercent === 'number' && typeof parsed.yEndPercent === 'number') {
        solutionRegion = parsed;
      }
    } catch {
      // Игнорируем некорректный JSON — используем фото решения целиком.
    }
  }

  if (!(photo instanceof Blob)) {
    return NextResponse.json({ error: 'Фото не передано' }, { status: 400 });
  }
  if (photo.size > 8 * 1024 * 1024 || (taskPhoto instanceof Blob && taskPhoto.size > 8 * 1024 * 1024)) {
    return NextResponse.json({ error: 'Фото слишком большое (максимум 8 МБ)' }, { status: 400 });
  }

  const images: ImageInput[] = [await blobToImage(photo)];
  // Ручная полоса точна сама по себе (её выставил человек) — небольшой
  // паддинг 2%, а не дефолтные 6% (рассчитанные на грубую AI-оценку
  // границ), тот же принцип, что и в explainTask/explainTaskOpenAI.
  if (solutionRegion) {
    const cropped = await cropImageByPercent(
      images[0],
      solutionRegion.yStartPercent,
      solutionRegion.yEndPercent,
      undefined,
      undefined,
      2
    );
    if (cropped) images[0] = cropped;
  }
  if (taskPhoto instanceof Blob) {
    let taskImage = await blobToImage(taskPhoto);
    if (taskRegion) {
      // 02.09.2026: taskRegion тоже стал ручной полосой (см. CLAUDE.md,
      // «Выбор задания на фото учебника: тоже ручная полоса») — тот же
      // принцип, что и у solutionRegion выше: рамку уже точно выставил
      // человек, дефолтный паддинг 6% (рассчитан на грубую AI-оценку)
      // здесь не нужен и может случайно затянуть в кадр соседние строки
      // (реальный прод-кейс — под текстом задания попали пункты
      // "Докажите..."/"Запишите..." следующего абзаца).
      const cropped = await cropImageByPercent(taskImage, taskRegion.yStartPercent, taskRegion.yEndPercent, undefined, undefined, 2);
      if (cropped) taskImage = cropped;
    }
    images.push(taskImage);
  }
  // Детализация (верх/низ с нахлёстом, см. CLAUDE.md про многошаговую
  // арифметику) теперь считается СЕРВЕРОМ от уже обрезанной по выбранной
  // области картинки — если считать её от исходной страницы целиком, кропы
  // снова принесли бы в кадр соседние задания, которые пользователь как раз
  // исключил выделением полосы. Без выделенной области (solutionRegion не
  // передан) — детализации нет, как и в самой первой версии проверки.
  const detailCrops: ImageInput[] = solutionRegion ? await createDetailCropsFromImage(images[0]) : [];
  // base64 дальше не используется и не сохраняется — images/detailCrops
  // выходят из области видимости после ответа и будут собраны сборщиком мусора.

  const provider = await getAiProvider();

  // --- Анонимная проверка: без сохранения, с лимитом по IP ---
  if (!session) {
    const ipHash = hashIp(getClientIp(request));
    const periodStartStr = new Date().toISOString().slice(0, 10);

    const { data: anonRow } = await supabaseServer
      .from('anonymous_usage')
      .select('checks_used')
      .eq('ip_hash', ipHash)
      .eq('period_start', periodStartStr)
      .maybeSingle();

    const anonChecksUsed = anonRow?.checks_used || 0;

    // 19.08.2026: ВРЕМЕННО ОТКЛЮЧЕНО по просьбе владельца — продукт ещё
    // не в проде, лимит только мешает тестировать. Счётчик checks_used
    // по-прежнему обновляется ниже (тот же паттерн, что и у лимита
    // авторизованных проверок FREE_CHECKS_PER_MONTH). Чтобы вернуть
    // ограничение, раскомментируйте блок ниже.
    //
    // if (anonChecksUsed >= ANONYMOUS_CHECKS_PER_DAY) {
    //   return NextResponse.json(
    //     {
    //       error: `Бесплатный лимит анонимных проверок (${ANONYMOUS_CHECKS_PER_DAY} в день) исчерпан. Войдите через Яндекс ID, чтобы продолжить.`
    //     },
    //     { status: 429 }
    //   );
    // }

    let checkResult;
    try {
      checkResult = await runCheck(provider, images, detailCrops);
    } catch (err: any) {
      console.error('Ошибка анонимной проверки фото:', err?.message);
      return NextResponse.json({ error: err?.message || 'Не удалось проверить фото' }, { status: 502 });
    }

    const { result } = checkResult;

    // Модель не смогла понять условие задания по фото — просим приложить
    // ещё одно фото странички учебника, вместо ошибки. Не считаем это
    // попыткой — счётчик анонимного лимита не трогаем (как и для "нет
    // задания на фото" ниже).
    if (result.needs_task_photo) {
      return NextResponse.json({ needsTaskPhoto: true, reason: result.general_comment || '' });
    }

    // Второе фото (условие) не относится к решению на первом — реальный
    // прод-кейс, владелец приложил заведомо не то фото условия и проверил,
    // заметит ли сервис (не заметил, выдал бессмысленную ошибку). Как и
    // needs_task_photo — не считаем попыткой, лимит не трогаем.
    if (result.photo_mismatch) {
      return NextResponse.json({ photoMismatch: true, reason: result.general_comment || '' });
    }

    if (!result.tasks || result.tasks.length === 0) {
      return NextResponse.json({ error: result.general_comment || 'Не удалось найти задания на фото' }, { status: 422 });
    }

    await supabaseServer.from('anonymous_usage').upsert(
      { ip_hash: ipHash, period_start: periodStartStr, checks_used: anonChecksUsed + 1 },
      { onConflict: 'ip_hash,period_start' }
    );

    return NextResponse.json({
      id: null,
      createdAt: new Date().toISOString(),
      subject: normalizeSubject(result.subject),
      grade: result.grade,
      generalComment: result.general_comment,
      tasks: result.tasks
    });
  }

  // --- Проверка лимита бесплатных проверок (авторизованные) ---
  const periodStart = new Date();
  periodStart.setDate(1);
  const periodStartStr = periodStart.toISOString().slice(0, 10);

  const { data: usageRow } = await supabaseServer
    .from('usage_counters')
    .select('checks_used')
    .eq('user_id', session.userId)
    .eq('period_start', periodStartStr)
    .maybeSingle();

  const { data: subscriptionRow } = await supabaseServer
    .from('subscriptions')
    .select('status')
    .eq('user_id', session.userId)
    .eq('status', 'active')
    .maybeSingle();

  const hasActiveSubscription = Boolean(subscriptionRow);
  const checksUsed = usageRow?.checks_used || 0;

  // ВРЕМЕННО ОТКЛЮЧЕНО для тестирования — лимит не блокирует запросы,
  // но счётчик checks_used по-прежнему обновляется ниже. Чтобы вернуть
  // ограничение, раскомментируйте блок ниже.
  //
  // if (!hasActiveSubscription && checksUsed >= FREE_CHECKS_PER_MONTH) {
  //   return NextResponse.json(
  //     { error: `Бесплатный лимит (${FREE_CHECKS_PER_MONTH} проверок в месяц) исчерпан. Оформите подписку, чтобы продолжить.` },
  //     { status: 402 }
  //   );
  // }

  let checkResult;
  try {
    checkResult = await runCheck(provider, images, detailCrops);
  } catch (err: any) {
    console.error('Ошибка проверки фото:', err?.message);
    return NextResponse.json({ error: err?.message || 'Не удалось проверить фото' }, { status: 502 });
  }

  const { result, tokensInput, tokensOutput, providerUsed } = checkResult;

  if (result.needs_task_photo) {
    return NextResponse.json({ needsTaskPhoto: true, reason: result.general_comment || '' });
  }

  // Второе фото (условие) не относится к решению на первом — см. комментарий
  // в анонимной ветке выше. Не тратим лимит бесплатных проверок.
  if (result.photo_mismatch) {
    return NextResponse.json({ photoMismatch: true, reason: result.general_comment || '' });
  }

  if (!result.tasks || result.tasks.length === 0) {
    return NextResponse.json({ error: result.general_comment || 'Не удалось найти задания на фото' }, { status: 422 });
  }

  const subject = normalizeSubject(result.subject);
  const incorrectCount = result.tasks.filter((t) => t.status === 'incorrect').length;
  const unclearCount = result.tasks.filter((t) => t.status === 'unclear').length;

  const { data: check, error: insertError } = await supabaseServer
    .from('checks')
    .insert({
      user_id: session.userId,
      child_id: childId,
      subject,
      grade: result.grade,
      general_comment: result.general_comment,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      incorrect_count: incorrectCount,
      unclear_count: unclearCount,
      ai_provider: providerUsed
    })
    .select('id, created_at')
    .single();

  if (insertError || !check) {
    console.error('Ошибка сохранения проверки:', insertError);
    return NextResponse.json({ error: 'Не удалось сохранить результат' }, { status: 500 });
  }

  const taskRows = result.tasks.map((t) => ({
    check_id: check.id,
    number: t.number,
    condition: t.condition,
    status: t.status,
    explanation: t.explanation,
    correct_solution: t.correct_solution
  }));

  const { error: tasksError } = await supabaseServer.from('check_tasks').insert(taskRows);
  if (tasksError) {
    console.error('Ошибка сохранения заданий:', tasksError);
  }

  // Фото решения (единственное осознанное исключение из "фото не хранятся
  // вообще", см. CLAUDE.md) — заливаем ПОСЛЕ сохранения проверки, чтобы
  // знать check.id для пути. Только фото решения (images[0]), не фото
  // учебника — оно не показывает, как ребёнок выполнил задание. Best-effort:
  // ошибка загрузки не должна ломать уже сохранённый результат проверки,
  // просто не будет превью в истории.
  try {
    const photoBuffer = Buffer.from(images[0].base64, 'base64');
    const photoPath = `${session.userId}/${check.id}.jpg`;
    const { error: uploadError } = await supabaseServer.storage
      .from('check-photos')
      .upload(photoPath, photoBuffer, { contentType: images[0].mediaType || 'image/jpeg', upsert: false });

    if (uploadError) {
      console.error('Ошибка загрузки фото решения в Storage:', uploadError);
    } else {
      await supabaseServer.from('checks').update({ photo_path: photoPath }).eq('id', check.id);
    }
  } catch (err: any) {
    console.error('Ошибка загрузки фото решения:', err?.message);
  }

  // Обновляем счётчик использования бесплатного лимита.
  await supabaseServer.from('usage_counters').upsert(
    {
      user_id: session.userId,
      period_start: periodStartStr,
      checks_used: checksUsed + 1
    },
    { onConflict: 'user_id,period_start' }
  );

  // Уведомляем устройства родителя, что проверка готова — ведёт сразу на
  // развёрнутый результат в истории. Отправку дожидаемся (не fire-and-forget) —
  // serverless-функция может быть убита сразу после ответа, до фактической
  // отправки. Сама ошибка отправки не должна ломать ответ пользователю.
  const gradeLabel = result.grade ? `оценка ${result.grade}` : 'есть ошибки, нужно посмотреть';
  try {
    const tplVars = { subject: SUBJECT_LABELS[subject] || subject, grade: gradeLabel };
    const tpl = await getPushTemplate('check_ready');
    await sendPushToUser(
      session.userId,
      {
        title: renderTemplate(tpl.title, tplVars),
        body: renderTemplate(tpl.body, tplVars),
        url: `/dashboard?tab=history&checkId=${check.id}`
      },
      'parent'
    );
  } catch (err: any) {
    console.error('Ошибка отправки push о готовой проверке:', err?.message);
  }

  return NextResponse.json({
    id: check.id,
    createdAt: check.created_at,
    subject,
    grade: result.grade,
    generalComment: result.general_comment,
    tasks: result.tasks
  });
}
