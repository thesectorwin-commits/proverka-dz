import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAiProvider } from '@/lib/aiProvider';
import { runCheck } from '@/lib/runCheck';
import { ImageInput } from '@/lib/claude';

// Та же причина, что и у maxDuration в app/api/checks/route.ts — проверка
// может делать несколько последовательных запросов к модели.
export const maxDuration = 60;

// Демо-фото — заранее выбранная владельцем страница учебника, лежит прямо
// в репозитории (public/demo/). Это НЕ исключение из принципа "фото не
// хранятся" (см. CLAUDE.md) — тот принцип про реальные фото учеников,
// которые уходят в Anthropic/OpenAI API и выбрасываются из памяти; это же
// фото — намеренно публичный демонстрационный материал, который и так
// виден всем на главной странице.
const DEMO_PHOTO_PATH = path.join(process.cwd(), 'public', 'demo', 'demo-photo.jpg');
// Для показа клиенту отдаём облегчённую копию; проверка читает полноразмерный DEMO_PHOTO_PATH выше.
const DEMO_PHOTO_URL = '/demo/demo-photo-web.jpg';

// Отдельный (не anonymous_usage) суточный лимит по IP — кнопка не требует
// ни выбора файла, ни сессии, её тривиально закликать скриптом, прогоняя
// платный API вхолостую. Сам IP не хранится — только его хеш с солью.
const DEMO_CHECKS_PER_DAY = 10;

function hashIp(ip: string): string {
  const salt = process.env.SESSION_SECRET || '';
  return createHash('sha256').update(`demo:${ip}:${salt}`).digest('hex');
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// POST /api/checks/demo — живая демо-проверка на главной странице
// (components/DemoCheckSection.tsx). Без тела запроса: фото уже лежит на
// сервере, пользователю достаточно нажать кнопку. Использует тот же
// пайплайн (runCheck — индекс учебника → Claude/OpenAI), что и обычная
// проверка, с тем же переключателем провайдера из админки — честная
// демонстрация того, что сервис реально делает сейчас, а не статичный
// пример.
export async function POST(request: NextRequest) {
  const ipHash = hashIp(getClientIp(request));
  const periodStartStr = new Date().toISOString().slice(0, 10);

  const { data: usageRow } = await supabaseServer
    .from('demo_usage')
    .select('checks_used')
    .eq('ip_hash', ipHash)
    .eq('period_start', periodStartStr)
    .maybeSingle();

  const checksUsed = usageRow?.checks_used || 0;
  if (checksUsed >= DEMO_CHECKS_PER_DAY) {
    return NextResponse.json(
      {
        error: `Демо-проверку можно запускать не чаще ${DEMO_CHECKS_PER_DAY} раз в день с одного устройства — попробуйте завтра.`
      },
      { status: 429 }
    );
  }

  let photoBuffer: Buffer;
  try {
    photoBuffer = await fs.readFile(DEMO_PHOTO_PATH);
  } catch (err) {
    console.error('Демо-фото не найдено на сервере:', err);
    return NextResponse.json({ error: 'Демо временно недоступно' }, { status: 500 });
  }

  const images: ImageInput[] = [{ base64: photoBuffer.toString('base64'), mediaType: 'image/jpeg' }];
  const provider = await getAiProvider();

  let checkResult;
  try {
    checkResult = await runCheck(provider, images, []);
  } catch (err: any) {
    console.error('Ошибка демо-проверки:', err?.message);
    return NextResponse.json({ error: err?.message || 'Не удалось выполнить демо-проверку' }, { status: 502 });
  }

  const { result } = checkResult;

  // Демо-фото заранее подобрано и проверено вручную — эти случаи не должны
  // происходить в норме, но на всякий случай (нестабильность модели, см.
  // CLAUDE.md) не отдаём пользователю бессмысленный пустой результат.
  if (result.needs_task_photo || result.photo_mismatch || !result.tasks || result.tasks.length === 0) {
    console.error('Демо-проверка вернула неожиданный результат:', {
      needsTaskPhoto: result.needs_task_photo,
      photoMismatch: result.photo_mismatch,
      tasksCount: result.tasks?.length
    });
    return NextResponse.json({ error: 'Демо-проверка сейчас не отвечает как надо — попробуйте ещё раз' }, { status: 502 });
  }

  await supabaseServer.from('demo_usage').upsert(
    { ip_hash: ipHash, period_start: periodStartStr, checks_used: checksUsed + 1 },
    { onConflict: 'ip_hash,period_start' }
  );

  return NextResponse.json({
    grade: result.grade,
    generalComment: result.general_comment,
    tasks: result.tasks,
    photoUrl: DEMO_PHOTO_URL
  });
}
