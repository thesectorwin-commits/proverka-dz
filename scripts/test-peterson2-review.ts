// Детерминированная проверка расширенного пилота Петерсон 2 класс, часть 2
// (02-03.09.2026) — файл ЕЩЁ НЕ подключён к lib/textbookIndex.ts -> BOOKS
// (по прямому запросу владельца, "добавь в артефакты", не в прод), поэтому
// читает JSON напрямую, а не через getAllIndexEntries(). Минует
// нестабильный детект фото — проверяет именно логику сравнения
// нетипичных пунктов (однобуквенные ответы-переменные, "56" как
// fill_blank_word, геометрические термины, "нет" для задачи-шутки).
//
// НЕ подключён ни к одному API-роуту — безопасен для запуска.
//
// Запуск: npx --yes tsx scripts/test-peterson2-review.ts

import { readFileSync } from 'fs';
import { buildNarrowItems, buildIndexCheckTask } from '../lib/openai';
import type { IndexEntry, IndexTask, IndexPage } from '../lib/textbookIndex';

const raw = JSON.parse(readFileSync(new URL('../textbook-index/peterson-2klass-tetrad2-p1-9.json', import.meta.url), 'utf8'));

const entries: IndexEntry[] = [];
for (const page of raw.pages as IndexPage[]) {
  for (const task of page.tasks as IndexTask[]) {
    entries.push({ page, task });
  }
}

console.log(`Всего task-объектов в файле: ${entries.length}\n`);

let pass = 0;
let fail = 0;

function check(label: string, item: ReturnType<typeof buildNarrowItems>[number], written: string | null, expectedStatus: string) {
  const tasks = buildIndexCheckTask(item, written, undefined, undefined);
  const status = tasks[0]?.status;
  const ok = status === expectedStatus;
  console.log(`    ${ok ? '✓' : '✗'} ${label}: written=${JSON.stringify(written)} -> [${status}] (ожидалось [${expectedStatus}])`);
  if (ok) pass++;
  else fail++;
}

for (const entry of entries) {
  if (entry.task.answerType !== 'fill_blank_word') continue;
  const items = buildNarrowItems(entry);
  for (const item of items) {
    if (item.knownWordAnswer === undefined) continue;
    console.log(`Задача №${entry.task.number} — "${item.displayCondition}" (ожидаемый ответ: "${item.knownWordAnswer}")`);
    check('точный ответ', item, item.knownWordAnswer, 'correct');
    check('неверный ответ', item, item.knownWordAnswer + 'ЖЖЖ', 'incorrect');
    check('не распознано', item, null, 'unclear');
    console.log();
  }
}

console.log(`\nИтого: ${pass} верно, ${fail} неверно из ${pass + fail} проверок.`);
if (fail > 0) process.exit(1);
