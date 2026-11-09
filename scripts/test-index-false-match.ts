// Диагностика реального прод-бага (02.09.2026): фото с 12 равенствами
// (задание №5, ни разу не связанное с индексом учебников) ложно совпало с
// чужим заданием из индекса через numericFingerprintScore (однонаправленная
// проверка "все числа задания найдены у кандидата" почти не отсеивает,
// когда у кандидата чисел на порядок больше). Проверяет tryTextbookIndexCheck
// напрямую на том же кропе, что дал сбой в проде — до фикса ожидался ложный
// "успех", после фикса ожидается null (честный откат на обычный пайплайн).
//
// НЕ подключён ни к одному API-роуту — безопасен для запуска.
//
// Запуск: npx --yes tsx scripts/test-index-false-match.ts "путь/к/9.jpg" yStart yEnd

import { readFileSync } from 'fs';
import { extname } from 'path';
import { tryTextbookIndexCheck } from '../lib/openai';
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
    console.error('Использование: npx --yes tsx scripts/test-index-false-match.ts путь/к/фото.jpg [yStart] [yEnd]');
    process.exit(1);
  }

  const buffer = readFileSync(imagePath);
  const ext = extname(imagePath).toLowerCase();
  const mediaType = MEDIA_TYPES[ext] || 'image/jpeg';
  const original: ImageInput = { base64: buffer.toString('base64'), mediaType };

  const cropped = await cropImageByPercent(original, yStart, yEnd, undefined, undefined, 2);
  if (!cropped) {
    console.error('Обрезка не удалась');
    process.exit(1);
  }
  const detailCrops = await createDetailCropsFromImage(cropped);

  const indexResult = await tryTextbookIndexCheck(cropped, detailCrops);

  if (!indexResult) {
    console.log('\nРЕЗУЛЬТАТ: null (индекс не сопоставился — честный откат на обычный пайплайн, как и должно быть)');
  } else {
    console.log('\nРЕЗУЛЬТАТ: индекс СОПОСТАВИЛСЯ (это плохо для этого теста, если равенства не из индекса)');
    console.log(`subject: ${indexResult.result.subject}, grade: ${indexResult.result.grade}`);
    for (const t of indexResult.result.tasks) {
      console.log(`  [${t.status}] №${t.number}: ${t.condition}`);
    }
  }
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
