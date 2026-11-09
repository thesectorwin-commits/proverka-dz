// Диагностика: что именно detectTasksOnTaskPhoto находит на странице
// английского учебника (сырой вывод, без сопоставления с индексом).
// Одноразовый, не подключён к приложению.
//
// Запуск: node scripts/test-english-detect-diag.ts путь/к/фото.png

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
    console.error('Использование: node scripts/test-english-detect-diag.ts путь/к/фото.png');
    process.exit(1);
  }
  const { detectTasksOnTaskPhoto } = await import('../lib/openai.ts');
  const buffer = readFileSync(path);
  const image = { base64: buffer.toString('base64'), mediaType: MEDIA_TYPES[extname(path).toLowerCase()] || 'image/png' };

  const detect = await detectTasksOnTaskPhoto(image as any);
  console.log('subject:', detect.subject);
  console.log('tasks found:', detect.tasks.length);
  for (const t of detect.tasks) {
    console.log(JSON.stringify(t, null, 1));
  }
}

main().catch((e) => {
  console.error('ОШИБКА:', e);
  process.exit(1);
});
