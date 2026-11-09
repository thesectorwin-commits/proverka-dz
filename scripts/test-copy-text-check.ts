// Детерминированная проверка нового answerType 'copy_text' (Канакина,
// русский язык 3 класс) — минует нестабильный детект фото, напрямую
// находит записи в индексе и подаёт синтетический "written" текст, как
// если бы OCR распознал его идеально (и с реалистичными мелкими
// отличиями — лишний пробел, другая буква ё/е, пропущенное слово).
//
// НЕ подключён ни к одному API-роуту — безопасен для запуска.
//
// Запуск: npx --yes tsx scripts/test-copy-text-check.ts

import { getAllIndexEntries } from '../lib/textbookIndex';
import { buildNarrowItems, buildIndexCheckTask } from '../lib/openai';

const entries = getAllIndexEntries().filter((e) => e.task.answerType === 'copy_text');
console.log(`Найдено ${entries.length} записей copy_text (ожидается 4)\n`);

for (const entry of entries) {
  const items = buildNarrowItems(entry);
  if (items.length !== 1) {
    console.log(`  №${entry.task.number}: НЕОЖИДАННО ${items.length} items (ожидался 1)`);
    continue;
  }
  const item = items[0];
  const known = item.knownSentence || '';

  // Сценарий 1: ребёнок списал точно верно.
  const exact = buildIndexCheckTask(item, known, undefined, undefined)[0];
  // Сценарий 2: пропущено одно слово (реальная ошибка списывания).
  const withMissingWord = known.split(' ').filter((_, i) => i !== 2).join(' ');
  const missing = buildIndexCheckTask(item, withMissingWord, undefined, undefined)[0];
  // Сценарий 3: не удалось распознать вообще.
  const unclear = buildIndexCheckTask(item, null, undefined, undefined)[0];

  console.log(`№${entry.task.number}: "${known.slice(0, 40)}..."`);
  console.log(`  точная копия      -> [${exact.status}]`);
  console.log(`  пропущено слово   -> [${missing.status}]`);
  console.log(`  не распознано     -> [${unclear.status}]`);
  console.log();
}
