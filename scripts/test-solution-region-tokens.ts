// Разовая проверка: реально ли выделение области экономит токены (вопрос
// владельца, 02.09.2026). Повторяет СЕРВЕРНУЮ логику app/api/checks/route.ts
// для solutionRegion (cropImageByPercent + createDetailCropsFromImage) на
// том же тестовом фото 9.jpg, и вызывает ту же checkHomeworkPhotoOpenAI —
// для честного сравнения с уже измеренными ранее токенами полной страницы
// (см. scripts/test-task5-family-diag.ts, ~31000-31150 токенов вх.).
//
// НЕ подключён ни к одному API-роуту — безопасен для запуска.
//
// Запуск: npx --yes tsx scripts/test-solution-region-tokens.ts "путь/к/9.jpg" yStart yEnd

import { readFileSync } from 'fs';
import { extname } from 'path';
import { checkHomeworkPhotoOpenAI } from '../lib/openai';
import { cropImageByPercent, createDetailCropsFromImage } from '../lib/claude';
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

async function main() {
  loadEnvLocal();
  const imagePath = process.argv[2];
  const yStart = Number(process.argv[3] ?? '45');
  const yEnd = Number(process.argv[4] ?? '100');
  if (!imagePath) {
    console.error('Использование: npx --yes tsx scripts/test-solution-region-tokens.ts путь/к/фото.jpg [yStart] [yEnd]');
    process.exit(1);
  }

  const buffer = readFileSync(imagePath);
  const ext = extname(imagePath).toLowerCase();
  const mediaType = MEDIA_TYPES[ext] || 'image/jpeg';
  const original: ImageInput = { base64: buffer.toString('base64'), mediaType };

  console.log(`Область: ${yStart}%–${yEnd}% (та же логика, что app/api/checks/route.ts)`);

  const cropped = await cropImageByPercent(original, yStart, yEnd, undefined, undefined, 2);
  if (!cropped) {
    console.error('Обрезка не удалась');
    process.exit(1);
  }
  const detailCrops = await createDetailCropsFromImage(cropped);

  console.log(`Исходное фото: ${Math.round(original.base64.length / 1024)} КБ (base64)`);
  console.log(`Обрезанная область: ${Math.round(cropped.base64.length / 1024)} КБ (base64)`);
  console.log(`Детализирующих кропов: ${detailCrops.length}`);

  const { result, tokensInput, tokensOutput } = await checkHomeworkPhotoOpenAI([cropped], detailCrops);

  console.log(`\ntokensInput: ${tokensInput}  tokensOutput: ${tokensOutput}  (всего ${tokensInput + tokensOutput})`);
  console.log(`\nЗадания (${result.tasks.length}):`);
  for (const t of result.tasks) {
    console.log(`  [${t.status}] №${t.number}: ${t.condition}`);
  }
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
