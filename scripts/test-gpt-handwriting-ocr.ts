// Одноразовый тест распознавания ПОЛНОСТЬЮ рукописного русского текста
// моделью gpt-5.4-mini — отдельно от основного test-gpt56-luna.ts, потому
// что там логика "нужно фото учебника" (унаследована из buildSystemPrompt)
// заблокировала бы саму проверку на этом фото (страница целиком рукописная).
// Здесь цель другая и более узкая: просто оценить точность распознавания
// почерка, без какой-либо оценки правильности/полноты задания.
//
// НЕ подключён ни к одному API-роуту/компоненту приложения.
//
// Запуск: node scripts/test-gpt-handwriting-ocr.ts путь/к/фото.jpg

import { readFileSync } from 'fs';
import { extname } from 'path';

const MODEL = 'gpt-5.4-mini';

function loadEnvLocal(): Record<string, string> {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

const MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

const OCR_PROMPT = `Посмотри на фото страницы школьной тетради — рукописный текст по русскому языку (синяя шариковая ручка), написанный от руки.

Дословно перепиши ВЕСЬ рукописный текст ИМЕННО ТАК, как он написан — сохрани все слова, порядок, знаки препинания, перенос строк не важен (пиши сплошным текстом). Не исправляй орфографические ошибки ученика, если они есть — перепиши как есть.

Отдельно от основного текста на странице карандашом (более бледным, чем основной текст) подписаны пометки НАД некоторыми словами — обычно "ед.ч" или "мн.ч" (число прилагательного). Перечисли КАЖДУЮ такую пометку — над каким именно словом она стоит (то слово из основного текста, прямо под которым/над которым написана пометка) и что именно написано (посимвольно, как есть).

НЕ оценивай, правильно ли расставлены пометки, не проверяй грамматику — только распознай и перепиши.

Ответь строго JSON, без markdown:
{"text": "полный дословный текст всей страницы", "pencil_labels": [{"word": "слово из текста", "label": "как написано над ним"}]}`;

async function main() {
  const photoPath = process.argv[2];
  if (!photoPath) {
    console.error('Использование: node scripts/test-gpt-handwriting-ocr.ts путь/к/фото.jpg');
    process.exit(1);
  }

  const env = loadEnvLocal();
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY не задан в .env.local');
    process.exit(1);
  }

  const ext = extname(photoPath).toLowerCase();
  const mediaType = MEDIA_TYPES[ext];
  if (!mediaType) {
    console.error(`Неизвестное расширение: ${ext}`);
    process.exit(1);
  }

  const base64 = readFileSync(photoPath).toString('base64');
  const imageBlock = {
    type: 'input_image',
    image_url: `data:${mediaType};base64,${base64}`,
    detail: 'original' as const
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'none' },
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: OCR_PROMPT }, imageBlock]
        }
      ]
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    console.error(`--- Ошибка API (${response.status}) ---`);
    console.error(bodyText);
    process.exit(1);
  }

  const data = JSON.parse(bodyText);
  const messageItem = (data.output || []).find((o: any) => o.type === 'message');
  const outputText: string | undefined = messageItem?.content?.find((c: any) => c.type === 'output_text')?.text;

  console.log('--- Метаданные ---');
  console.log(JSON.stringify({ id: data.id, model: data.model, usage: data.usage }, null, 2));

  if (!outputText) {
    console.log('(не нашли output_text, сырой output ниже)');
    console.log(JSON.stringify(data.output, null, 2));
    return;
  }

  console.log('\n--- Результат распознавания ---');
  let cleaned = outputText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    console.log(JSON.stringify(JSON.parse(cleaned), null, 2));
  } catch {
    console.log(outputText);
  }
}

main().catch((err) => {
  console.error('Ошибка скрипта:', err);
  process.exit(1);
});
