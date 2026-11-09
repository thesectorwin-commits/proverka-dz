// Диагностика реального бага (02.09.2026): задание №5 на фото 9.jpg (4
// группы взаимообратных равенств, 12 равенств всего) теряет часть или все
// написанные примеры в результате основного пайплайна. Вызывает РЕАЛЬНУЮ
// прод-функцию checkHomeworkPhotoOpenAI (lib/openai.ts) с теми же
// detailCrops (верх/низ страницы), что реально отправляет клиент — не
// упрощённую переимплементацию, как в старом scripts/test-gpt56-luna.ts.
//
// НЕ подключён ни к одному API-роуту/компоненту — безопасен для запуска.
//
// Запуск: npx --yes tsx scripts/test-task5-family-diag.ts "путь/к/9.jpg"
//
// Требует OPENAI_API_KEY в .env.local.

import { readFileSync } from 'fs';
import { extname } from 'path';
import sharp from 'sharp';
import { checkHomeworkPhotoOpenAI } from '../lib/openai';
import type { ImageInput } from '../lib/claude';

function loadEnvLocal(): void {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

// Повторяет lib/normalizeImage.ts → createDetailCrops (браузерная функция,
// недоступна в Node) — верх/низ страницы с 12% нахлёстом посередине.
async function createDetailCropsNode(buffer: Buffer): Promise<ImageInput[]> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) return [];

  const overlapFraction = 0.12;
  const cropHeight = Math.round(height * (0.5 + overlapFraction / 2));

  const top = await sharp(buffer)
    .extract({ left: 0, top: 0, width, height: cropHeight })
    .jpeg({ quality: 90 })
    .toBuffer();
  const bottom = await sharp(buffer)
    .extract({ left: 0, top: height - cropHeight, width, height: cropHeight })
    .jpeg({ quality: 90 })
    .toBuffer();

  return [
    { base64: top.toString('base64'), mediaType: 'image/jpeg' },
    { base64: bottom.toString('base64'), mediaType: 'image/jpeg' }
  ];
}

async function main() {
  loadEnvLocal();
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Использование: npx --yes tsx scripts/test-task5-family-diag.ts путь/к/фото.jpg');
    process.exit(1);
  }

  const buffer = readFileSync(imagePath);
  const ext = extname(imagePath).toLowerCase();
  const mediaType = MEDIA_TYPES[ext] || 'image/jpeg';
  const image: ImageInput = { base64: buffer.toString('base64'), mediaType };

  const detailCrops = await createDetailCropsNode(buffer);
  console.log(`detailCrops: ${detailCrops.length}`);

  const { result, tokensInput, tokensOutput } = await checkHomeworkPhotoOpenAI([image], detailCrops);

  console.log(`\nsubject: ${result.subject}  grade: ${result.grade}`);
  console.log(`needs_task_photo: ${result.needs_task_photo}  photo_mismatch: ${result.photo_mismatch}`);
  console.log(`tokensInput: ${tokensInput}  tokensOutput: ${tokensOutput}`);
  console.log(`\nЗадания (${result.tasks.length}):`);
  for (const t of result.tasks) {
    console.log(`  [${t.status}] №${t.number}: ${t.condition}`);
    if (t.explanation) console.log(`      -> ${t.explanation}`);
  }
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
