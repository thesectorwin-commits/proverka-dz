// Целенаправленная проверка (02.09.2026): requiresCheck-задание из индекса
// (moro-3klass-uchebnik-p58.json, задание №5, ровно то, что дало "4 пункта
// вместо 12" в проде) теперь должно возвращать 12 отдельных пунктов
// (4 основных примера + 8 проверочных равенств), а не 4.
//
// НЕ зависит от нестабильного detectHandwrittenTasksOnSolutionPhoto (он не
// вызывается) — напрямую находит нужную запись в индексе и подаёт СИНТЕТИЧЕСКИЕ
// "lines" (как если бы OCR распознал их идеально), чтобы детерминированно
// проверить именно логику разбиения на пункты (buildIndexCheckTask), а не
// надёжность распознавания.
//
// НЕ подключён ни к одному API-роуту — безопасен для запуска.
//
// Запуск: npx --yes tsx scripts/test-requires-check-split.ts

import { getAllIndexEntries } from '../lib/textbookIndex';
import { buildNarrowItems, buildIndexCheckTask } from '../lib/openai';

const entry = getAllIndexEntries().find(
  (e) => e.page.printedPage === 58 && e.task.number === '5' && e.task.answerType === 'computation_list'
);

if (!entry) {
  console.error('Запись не найдена в индексе — moro-3klass-uchebnik-p58.json могла измениться');
  process.exit(1);
}

const items = buildNarrowItems(entry);
console.log(`Найдено ${items.length} NarrowItem (ожидается 4 — по одному на пример)`);

// Реальные равенства с фото 9.jpg, как их должна дословно распознать
// модель (см. buildIndexNarrowVerificationPrompt → "lines").
const linesByItemId: Record<string, string[]> = {
  '5a': ['76+18=94', '94-18=76', '94-76=18'],
  '5b': ['76-18=58', '76-58=18', '58+18=76'],
  '5c': ['63-37=26', '26+37=63', '63-26=37'],
  '5d': ['51+45=96', '96-51=45', '96-45=51']
};

const allTasks = items.flatMap((item) => buildIndexCheckTask(item, undefined, linesByItemId[item.id], undefined));

console.log(`\nВсего пунктов результата: ${allTasks.length} (ожидается 12)\n`);
for (const t of allTasks) {
  console.log(`  [${t.status}] ${t.condition}`);
}
