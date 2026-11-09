// Детерминированная проверка индекса Математика 3 класс, часть 1, Моро
// (04.09.2026) — минует нестабильный детект фото, напрямую находит
// записи в индексе и подаёт синтетический "written" ответ, как если бы
// OCR распознал его идеально (плюс неверный и нераспознанный варианты).
// Все answerType уже существовали в проекте — новый код сравнения не
// понадобился, этот тест лишь подтверждает, что данные согласованы с
// уже готовыми компараторами.
//
// НЕ подключён ни к одному API-роуту — безопасен для запуска.
//
// Запуск: npx --yes tsx scripts/test-moro-uchebnik-chast1.ts

import { getAllIndexEntries } from '../lib/textbookIndex';
import { buildNarrowItems, buildIndexCheckTask } from '../lib/openai';

// Фильтр по характерным секциям этого пособия (файл не даёт прямой ссылки
// на исходный JSON после уплощения в ALL_ENTRIES).
const targetSections = new Set([
  'Повторение: устные и письменные приёмы сложения и вычитания',
  'Повторение: уравнения, подбор числа',
  'Решение уравнений (неизвестное слагаемое)',
  'Решение уравнений (неизвестное уменьшаемое)',
  'Решение уравнений (неизвестное вычитаемое)'
]);
const moroEntries = getAllIndexEntries().filter((e) => targetSections.has(e.page.section));

console.log(`Найдено записей: ${moroEntries.length}\n`);

let pass = 0;
let fail = 0;

function check(label: string, item: ReturnType<typeof buildNarrowItems>[number], written: string | null, writtenWords: (string | null)[] | undefined, expectedStatus: string) {
  const tasks = buildIndexCheckTask(item, written, undefined, writtenWords);
  const status = tasks[0]?.status;
  const ok = status === expectedStatus;
  console.log(`    ${ok ? '✓' : '✗'} ${label}: written=${JSON.stringify(written)} -> [${status}] (ожидалось [${expectedStatus}])`);
  if (ok) pass++;
  else fail++;
}

for (const entry of moroEntries) {
  const items = buildNarrowItems(entry);
  for (const item of items) {
    if (item.knownAnswer !== undefined) {
      console.log(`Стр.${entry.page.printedPage} №${entry.task.number} — "${item.displayCondition}" (ожидаемый ответ: ${item.knownAnswer})`);
      check('точный ответ', item, String(item.knownAnswer), undefined, 'correct');
      check('неверный ответ', item, String(item.knownAnswer + 1000), undefined, 'incorrect');
      check('не распознано', item, null, undefined, 'unclear');
      console.log();
    } else if (item.knownWordAnswer !== undefined) {
      console.log(`Стр.${entry.page.printedPage} №${entry.task.number} — "${item.displayCondition}" (ожидаемый ответ: "${item.knownWordAnswer}")`);
      check('точный ответ', item, item.knownWordAnswer, undefined, 'correct');
      check('неверный ответ', item, item.knownWordAnswer + 'ЖЖЖ', undefined, 'incorrect');
      check('не распознано', item, null, undefined, 'unclear');
      console.log();
    }
  }
}

console.log(`\nИтого: ${pass} верно, ${fail} неверно из ${pass + fail} проверок.`);
if (fail > 0) process.exit(1);
