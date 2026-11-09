// Одноразовый смоук-тест нового индекса english (Быкова) — проверяет
// весь пайплайн tryTextbookIndexCheck (детект → сопоставление с индексом →
// узкая проверка → сборка CheckResult) на реальном фото страницы учебника,
// без падений и с осмысленным результатом. НЕ подключён ни к одному
// API-роуту — безопасен для запуска.
//
// Запуск: node scripts/test-english-index-smoke.ts путь/к/фото.png

import { readFileSync } from 'fs';
import { extname } from 'path';

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
for (const [k, v] of Object.entries(loadEnvLocal())) {
  if (!process.env[k]) process.env[k] = v;
}

const MEDIA_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Использование: node scripts/test-english-index-smoke.ts путь/к/фото.png');
    process.exit(1);
  }
  const { tryTextbookIndexCheck } = await import('../lib/openai.ts');
  const buffer = readFileSync(path);
  const image = { base64: buffer.toString('base64'), mediaType: MEDIA_TYPES[extname(path).toLowerCase()] || 'image/png' };

  const result = await tryTextbookIndexCheck(image as any, []);
  if (!result) {
    console.log('РЕЗУЛЬТАТ: null (индекс не сопоставился — откат на обычный пайплайн)');
    return;
  }
  console.log('subject:', result.result.subject);
  console.log('grade:', result.result.grade);
  console.log('tokensInput:', result.tokensInput, 'tokensOutput:', result.tokensOutput);
  console.log('tasks:');
  for (const t of result.result.tasks) {
    console.log(`  [${t.status}] №${t.number}: ${t.condition.slice(0, 60)}`);
  }
}

main().catch((e) => {
  console.error('ОШИБКА:', e);
  process.exit(1);
});
