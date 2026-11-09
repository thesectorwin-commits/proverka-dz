// 20.08.2026: типизированный доступ к вручную построенным индексам
// учебников/рабочих тетрадей (textbook-index/*.json) — пилотная фича,
// см. CLAUDE.md, раздел про индекс учебника.
//
// 21.08.2026: расширено до НЕСКОЛЬКИХ файлов индекса (BOOKS ниже) — второй
// учебник появился (moro-3klass-uchebnik-p58.json, по прямому запросу
// владельца, чтобы протестировать на реальном фото решения многошаговой
// текстовой задачи "Было-Вышли-Сели-Стало"). Прямой import каждого файла
// по отдельности (не обобщённый загрузчик директории) — их пока мало,
// обобщать loader смысла нет. tsconfig.json уже включает resolveJsonModule,
// дополнительная настройка не нужна.

import type { Subject } from './claude';
import moroTetradRaw from '../textbook-index/moro-3klass-tetrad1-kremneva.json';
import moroUchebnikP58Raw from '../textbook-index/moro-3klass-uchebnik-p58.json';
import russianP89P91Raw from '../textbook-index/russian-2klass-p89-p91.json';
// 28.08.2026: по прямому запросу владельца подключён пилотный разбор
// Петерсон (был собран 25-27.08.2026 только для артефакта-обзора, см.
// meta.pilotNote внутри файла) — три answerType из него ("number_sequence",
// "function_table", "word_formation") были новыми, компараторов для них
// не было, добавлены ниже вместе с этим подключением.
import petersonTetrad1Raw from '../textbook-index/peterson-2klass-tetrad1-p1-11.json';
// 01.09.2026: первый предмет "english" в индексе, по прямому запросу
// владельца — сначала собран как изолированный пилот (см. meta.pilotNote
// внутри файла), но реализован сразу в коде (8 новых answerType ниже) и
// подключён в BOOKS по явному запросу "давай реализовывать в коде и
// выкатывать в прод".
import bykovaSbornikRaw from '../textbook-index/bykova-3klass-sbornik-uprazhnenii.json';
// 02.09.2026: русский язык, Канакина 3 класс, часть 1 — по прямому запросу
// владельца. Всего 6 страниц вводной главы ("Наша речь и наш язык"),
// содержательно почти целиком открытые вопросы/обсуждения — единственный
// объективно проверяемый паттерн: "Спишите [заданный текст]" (новый
// answerType 'copy_text', см. выше).
import kanakina3klassChast1Raw from '../textbook-index/kanakina-3klass-chast1-p6-10.json';
// 04.09.2026: Математика 3 класс, часть 1, Моро — по прямому запросу
// владельца сразу "в индекс" (не в артефакты, как предыдущие пилоты).
// Все answerType уже существовали (computation_list, word_problem,
// equations, fill_blank_word, function_table, compare) — новый
// компаратор не понадобился.
import moroUchebnikChast1Raw from '../textbook-index/moro-3klass-uchebnik-chast1-p4-9.json';

export type AnswerType =
  | 'computation_list'
  | 'word_problems'
  | 'word_problem'
  | 'unit_conversion'
  | 'compare_and_solve'
  | 'fill_operators'
  | 'fill_blank_equation'
  | 'open_creative'
  | 'open_creative_verified'
  | 'requires_measurement'
  | 'requires_drawing'
  | 'logic_puzzle'
  | 'equations'
  | 'chain'
  | 'addition_table'
  | 'sum_to_product'
  | 'compare'
  | 'fact_family'
  // 22.08.2026: первый предмет кроме математики — русский язык.
  | 'fill_blank_word'
  | 'copy_and_mark_grammar'
  // 28.08.2026: три новых типа из пилота Петерсон (см. подключение BOOKS
  // ниже) — компараторы в lib/openai.ts.
  | 'number_sequence'
  | 'function_table'
  | 'word_formation'
  // 01.09.2026: первый предмет "english" — 8 новых типов, см. соответствующие
  // Task-типы и компараторы в lib/openai.ts (buildNarrowItems).
  | 'word_categorization'
  | 'pluralize_nouns'
  | 'pronoun_replacement'
  | 'multiple_choice'
  | 'verb_form_fill'
  | 'sentence_from_cue'
  | 'question_response_matching'
  | 'odd_one_out'
  // 02.09.2026: русский язык, Канакина 3 класс — "Спишите [заданный текст]".
  // Компаратор в lib/openai.ts переиспользует уже существующий механизм
  // sentence_from_cue (лояльный word-diff), новый код не понадобился.
  | 'copy_text';

// Фаза 1 узкой проверки (см. план) — только чисто числовые типы, где
// "правильный ответ" это одно число на один пункт задания. Каждый такой
// тип ниже типизирован точно (какие поля есть в items), остальные —
// через OtherTask (мы их пока не читаем предметно, только исключаем).
export type ComputationListTask = {
  number: string;
  prompt: string;
  answerType: 'computation_list';
  items: { expression: string; answer: number }[];
  // 21.08.2026: некоторые задания формата "Вычисли И ПРОВЕРЬ решение" —
  // ребёнок обязан не только посчитать пример, но и приписать 1-2
  // проверочных равенства (для a+b=c: c-a=b и c-b=a; для a-b=c: a-c=b и
  // c+b=a — оба случая сводятся к тому же множеству чисел {a,b}, что и
  // так уже даны в expression). НЕ путать с обычным "Вычисли." (без
  // "проверь") — там requiresCheck не ставится, лишняя проверка не
  // ожидается. См. lib/openai.ts (buildNarrowItems, computeCheckOperands) —
  // ожидаемые проверочные равенства считаются в коде, ребёнку не нужно
  // ничего решать за него, только сверяются уже написанные им числа.
  requiresCheck?: boolean;
};

export type EquationsTask = {
  number: string;
  prompt: string;
  answerType: 'equations';
  items: { equation: string; answer: number; check?: string }[];
};

export type FillBlankEquationTask = {
  number: string;
  prompt: string;
  answerType: 'fill_blank_equation';
  items: { expression_template: string; answer: number }[];
};

export type ChainTask = {
  number: string;
  prompt: string;
  answerType: 'chain';
  items: { start: number; steps: string[]; intermediates?: number[]; answer: number }[];
};

export type IndexStep = { description: string; expression: string; result: number };

// 21.08.2026: две РАЗНЫЕ формы одного и того же типа в исходных данных —
// "word_problem" (в единственном числе) означает, что весь task — это ОДНА
// задача (условие = prompt, steps/answer прямо на task), а "word_problems"
// (во множественном) — что под одним номером несколько отдельных задач
// (каждая внутри items[], со своим condition/answer/steps). Не унифицируем
// в один формат заранее — так исходный JSON были распарсен изначально
// (см. moro-3klass-tetrad1-kremneva.json), переразметка задним числом
// рискованнее, чем поддержать оба варианта в типах.
export type WordProblemTask = {
  number: string;
  prompt: string;
  answerType: 'word_problem';
  steps?: IndexStep[];
  answer: number;
};

export type WordProblemsTask = {
  number: string;
  prompt: string;
  answerType: 'word_problems';
  items: { condition: string; answer: number; steps?: IndexStep[] }[];
};

// 22.08.2026: первый тип для русского языка — пропуски с ОДНИМ известным
// верным словом каждый (взято дословно из печатного текста задания, не
// требует падежного/машинного анализа — то же самое, что fill_blank_equation
// в математике, только сравнивается слово, а не число). См. lib/openai.ts
// (buildNarrowItems, case 'fill_blank_word') — сравнение регистронезависимое,
// с нормализацией ё→е (частая орфографическая замена при письме от руки).
export type FillBlankWordTask = {
  number: string;
  prompt: string;
  answerType: 'fill_blank_word';
  items: { noun: string; question: string; answer: string }[];
};

// 22.08.2026: второй нечисловой тип (русский язык) — "спиши текст И
// разметь грамматическое число над прилагательными". Текст известен
// заранее ЦЕЛИКОМ (напечатан в учебнике), поэтому и правильные метки
// (ед.ч./мн.ч.) для каждого прилагательного посчитаны заранее и зашиты в
// индекс — код НЕ доверяет модели знание грамматики, только сравнивает с
// уже известным списком. НО дословность списывания текста сравнить одним
// числом/словом нельзя (рукописный текст всегда немного "шумит") — эта
// часть остаётся на калиброванном суждении модели (см. lib/openai.ts,
// buildCopyAndMarkCheckTask: "требуй конкретную цитату расхождения" +
// "при неуверенности считать переписанным верно" — та же формулировка,
// что уже стабилизировала это в изолированном тесте раньше в этой сессии).
export type CopyAndMarkGrammarTask = {
  number: string;
  prompt: string;
  answerType: 'copy_and_mark_grammar';
  text: string;
  adjectives: { word: string; number: string }[];
};

// 02.09.2026: "Спишите [заданный текст]" — очень частый тип задания в
// русском языке (в отличие от copy_and_mark_grammar, здесь НЕ требуется
// грамматическая разметка, только дословное копирование). Компаратор
// (lib/openai.ts, buildNarrowItems) переиспользует уже существующий
// knownSentence/buildSentenceCheckTask (лояльный word-diff LCS, изначально
// сделан для английского sentence_from_cue, но сам механизм языконезависим)
// — статус считается ПОЛНОСТЬЮ в коде, без калиброванного суждения модели,
// в отличие от copy_and_mark_grammar выше.
export type CopyTextTask = {
  number: string;
  prompt: string;
  answerType: 'copy_text';
  // 03.09.2026: массив — когда задание даёт ребёнку выбор из НЕСКОЛЬКИХ
  // печатных текстов ("спишите ЛЮБОЕ четверостишие" — 2 варианта в
  // источнике), а не открытый выбор без ограничений. Верным считается
  // совпадение ХОТЯ БЫ с одним вариантом (см. buildSentenceCheckTask в
  // lib/openai.ts). Обычная строка (единственный текст) продолжает
  // работать как раньше.
  text: string | string[];
};

// 28.08.2026: продолжение числового ряда — ребёнок дописывает 2 (иногда
// больше) числа после данного ряда, сохраняя закономерность (шаг ряда,
// "step", нужен только человеку для чтения индекса — код его не использует,
// сверяется напрямую с готовым item.answer). См. lib/openai.ts
// (buildNarrowItems case 'number_sequence', NarrowItem.knownNumberSequence).
export type NumberSequenceTask = {
  number: string;
  prompt: string;
  answerType: 'number_sequence';
  // 05.09.2026: displayRow — необязательное поле для случая, когда
  // известные числа НЕ идут подряд в начале ряда, а разбросаны по всей
  // строке с пропусками между ними (например "2,4,x,8,x,x,14,x,x,20") —
  // обычный шаблон "given.join(', ') + '...'" в buildNarrowItems исказил
  // бы условие (не показал бы анкерные числа 8/14/20 в середине и конце).
  // Если задано — используется вместо автогенерации, "given"/"step"
  // остаются как есть для остальной логики (answer — по-прежнему массив
  // ИМЕННО скрытых чисел по порядку слева направо, что и сравнивается
  // с распознанным ответом). Существующие записи без этого поля работают
  // как раньше.
  items: { given: number[]; step: string; answer: number[]; displayRow?: string }[];
};

// 28.08.2026: таблица "значение → значение+N/-N" — ОДНА операция
// применяется ко всей строке inputs, ребёнок заполняет строку outputs.
// НЕ путать с уже существующим addition_table (там сетка строка×столбец
// с двумя независимыми заголовками, сознательно исключённым из whitelist,
// см. KNOWN_EXCLUDED_ANSWER_TYPES ниже) — здесь одна операция и один ряд
// значений, каждая ячейка проверяется как отдельный числовой пункт (см.
// lib/openai.ts, buildNarrowItems case 'function_table' — переиспользует
// тот же knownAnswer, что и computation_list, отдельного компаратора не
// потребовалось).
export type FunctionTableTask = {
  number: string;
  prompt: string;
  answerType: 'function_table';
  tables: { operation: string; inputs: number[]; outputs: number[] }[];
};

// 28.08.2026: словесная головоломка (не число) — ребёнок дописывает НОВОЕ
// слово, вставив/заменив часть в данном базовом слове. Два разных
// подвида встречаются в данных: "insert" (вставить цепочку букв, например
// СЫН+ОЧЕК=сыночек) и "replace_from"/"replace_to" (заменить окончание,
// например СПЕЛЫЙ: ЫЙ→АЯ=спелая) — оба поля необязательные и взаимно
// исключающие, но для сравнения ответа важен только сам item.answer
// (готовое верное слово), остальное — только для чтения индекса
// человеком. См. lib/openai.ts (buildNarrowItems case 'word_formation' —
// переиспользует knownWordAnswer/normalizeWordAnswer из fill_blank_word,
// отдельного компаратора не потребовалось).
export type WordFormationTask = {
  number: string;
  prompt: string;
  answerType: 'word_formation';
  items: { base: string; insert?: string; replace_from?: string; replace_to?: string; answer: string }[];
};

// 01.09.2026: первый предмет "english" (Быкова, 3 класс) — 8 новых типов.
// Большинство сводится по сути сравнения к уже проверенным механизмам
// (одно известное слово/буква, массив слов по позициям, набор допустимых
// слов, свободное предложение с лояльным сравнением) — см. подробный
// разбор в lib/openai.ts (buildNarrowItems, комментарий там же).

// Распредели слова из общего списка по именованным категориям (дан один
// пример на категорию). Ребёнок сам решает, сколько слов дописать в
// каждую категорию — компаратор проверяет МНОЖЕСТВО (каждое написанное
// слово должно принадлежать словам этой категории), а не точное
// количество/порядок. См. lib/openai.ts, buildCategoryCheckTask.
export type WordCategorizationTask = {
  number: string;
  prompt: string;
  answerType: 'word_categorization';
  categories: { name: string; given: string; words: string[] }[];
};

// "число/существительное" → "число словом + существительное во мн.ч."
// (например "2/table" → "two tables"). По сути сравнения — одно известное
// слово(-сочетание), тот же компаратор, что и fill_blank_word/word_formation
// (buildWordCheckTask), просто answer — целая фраза, а не одно слово.
export type PluralizeNounsTask = {
  number: string;
  prompt: string;
  answerType: 'pluralize_nouns';
  items: { count: number; noun: string; answer: string }[];
};

// Существительное → местоимение (he/she/it/they). Один известный ответ —
// тот же компаратор, что и fill_blank_word.
export type PronounReplacementTask = {
  number: string;
  prompt: string;
  answerType: 'pronoun_replacement';
  items: { noun: string; answer: string }[];
};

// Выбор буквы правильного варианта (a/b/c...) — ребёнок обычно обводит
// букву или переписывает фразу целиком, но известный верный ответ — одна
// буква. Тот же компаратор, что и fill_blank_word (сравнение одного слова/
// буквы, регистронезависимо).
export type MultipleChoiceTask = {
  number: string;
  prompt: string;
  answerType: 'multiple_choice';
  items: { question: string; options: Record<string, string>; answer: string }[];
};

// Впиши в предложение 1-2 пропущенных слова из общего банка (am/is/are/
// can/has и т.п.). answer — МАССИВ слов по порядку пропусков в этом
// предложении (обычно 1, иногда 2). Компаратор сравнивает позиционно
// (buildWordSequenceCheckTask в lib/openai.ts) — по духу тот же принцип,
// что number_sequence у Петерсон, только для слов, а не чисел.
export type VerbFormFillTask = {
  number: string;
  prompt: string;
  answerType: 'verb_form_fill';
  items: { sentence: string; answer: string[] }[];
};

// Собери ПОЛНОЕ предложение по краткой подсказке (например "I/a radio (✓)"
// → "I have got a radio."). Свободный текст — сравнение лояльное (LCS-diff
// по словам, лишние слова у ребёнка не считаются ошибкой, только
// пропущенные/заменённые ключевые слова эталона — тот же принцип
// асимметрии рисков, что и у copy_and_mark_grammar). См.
// buildSentenceCheckTask в lib/openai.ts.
export type SentenceFromCueTask = {
  number: string;
  prompt: string;
  answerType: 'sentence_from_cue';
  items: { cue: string; answer: string }[];
};

// Сопоставь пронумерованные реплики с летерованными ответами (a, b, c...).
// Ребёнок вписывает букву рядом с каждым номером — известный ответ на
// каждый вопрос это одна буква, тот же компаратор, что и fill_blank_word.
// options хранится для читаемости индекса человеком (не используется в
// самом сравнении — только item.answer).
export type QuestionResponseMatchingTask = {
  number: string;
  prompt: string;
  answerType: 'question_response_matching';
  items: { question: string; answer: string }[];
  options: Record<string, string>;
};

// Вычеркни лишнее слово из ряда. Известный ответ — само лишнее слово,
// тот же компаратор, что и fill_blank_word.
export type OddOneOutTask = {
  number: string;
  prompt: string;
  answerType: 'odd_one_out';
  items: { words: string[]; answer: string }[];
};

export type OtherTask = {
  number: string;
  prompt: string;
  answerType: Exclude<
    AnswerType,
    | 'computation_list'
    | 'equations'
    | 'fill_blank_equation'
    | 'chain'
    | 'word_problem'
    | 'word_problems'
    | 'fill_blank_word'
    | 'copy_and_mark_grammar'
    | 'number_sequence'
    | 'function_table'
    | 'word_formation'
    | 'word_categorization'
    | 'pluralize_nouns'
    | 'pronoun_replacement'
    | 'multiple_choice'
    | 'verb_form_fill'
    | 'sentence_from_cue'
    | 'question_response_matching'
    | 'odd_one_out'
    | 'copy_text'
  >;
  [key: string]: unknown;
};

export type IndexTask =
  | ComputationListTask
  | EquationsTask
  | FillBlankEquationTask
  | ChainTask
  | WordProblemTask
  | WordProblemsTask
  | CopyAndMarkGrammarTask
  | FillBlankWordTask
  | NumberSequenceTask
  | FunctionTableTask
  | WordFormationTask
  | WordCategorizationTask
  | PluralizeNounsTask
  | PronounReplacementTask
  | MultipleChoiceTask
  | VerbFormFillTask
  | SentenceFromCueTask
  | QuestionResponseMatchingTask
  | OddOneOutTask
  | CopyTextTask
  | OtherTask;

export type IndexPage = {
  printedPage: number;
  section: string;
  tasks: IndexTask[];
};

export type TextbookIndexFile = {
  meta: {
    title: string;
    author: string;
    grade: number;
    subject: Subject;
    [key: string]: unknown;
  };
  pages: IndexPage[];
};

// JSON-модуль типизируется структурно по литералам самого файла — нам
// нужен более широкий тип (answerType как string-union, а не как literal
// конкретного файла), поэтому безопасное приведение через unknown.
const BOOKS: TextbookIndexFile[] = [
  moroTetradRaw as unknown as TextbookIndexFile,
  moroUchebnikP58Raw as unknown as TextbookIndexFile,
  russianP89P91Raw as unknown as TextbookIndexFile,
  petersonTetrad1Raw as unknown as TextbookIndexFile,
  bykovaSbornikRaw as unknown as TextbookIndexFile,
  kanakina3klassChast1Raw as unknown as TextbookIndexFile,
  moroUchebnikChast1Raw as unknown as TextbookIndexFile
];

// 03.09.2026: subject добавлен после реального прод-бага — фото решения
// на русском ("Упр.12 Соловей") ложно сопоставилось с английским заданием
// Быковой ("12/glass") просто потому, что оба совпали по числу "12" в
// numericFingerprintScore, а сопоставление шло по ВСЕМУ индексу сразу, без
// разделения по предмету/книге (subject раньше был только в meta.subject
// каждой книги и терялся при "уплощении" в ALL_ENTRIES). Теперь subject
// хранится на каждой записи — matchCandidatesToIndex/findEntryByTextContent/
// tryDirectNumberMatch в lib/openai.ts фильтруют по нему ДО скоринга, чтобы
// кандидат с одного предмета не мог совпасть с записью другого предмета.
export type IndexEntry = { page: IndexPage; task: IndexTask; subject: Subject };

const ALL_ENTRIES: IndexEntry[] = BOOKS.flatMap((book) =>
  book.pages.flatMap((page) => page.tasks.map((task) => ({ page, task, subject: book.meta.subject })))
);

// Номера заданий НЕ уникальны глобально — нумерация начинается заново на
// границе раздела ("Умножение и деление" на стр. 9 снова начинается с "1")
// И между разными учебниками (у второго учебника тоже есть номера "4"/"5"),
// поэтому один и тот же number может указывать на разные задания —
// сопоставление по фото должно учитывать это (см. matchCandidatesToIndex
// в lib/openai.ts), здесь просто отдаём список всех кандидатов.
const BY_NUMBER = new Map<string, IndexEntry[]>();
for (const entry of ALL_ENTRIES) {
  const list = BY_NUMBER.get(entry.task.number) || [];
  list.push(entry);
  BY_NUMBER.set(entry.task.number, list);
}

export function findIndexEntriesByNumber(number: string): IndexEntry[] {
  return BY_NUMBER.get(number) || [];
}

// 23.08.2026: реальный прод-кейс — рукописный номер задания ("Упр. 159")
// часто читается неверно (то "1", то "150", то вообще не находится) —
// сопоставление по номеру в принципе ненадёжно для страниц без печатной
// нумерации. Прямой поиск по СОДЕРЖАНИЮ (см. findEntryByTextContent в
// lib/openai.ts) не привязан к номеру вообще — отдаём полный список всех
// записей индекса, чтобы искать среди них по тексту, а не только среди
// записей с угаданным номером.
export function getAllIndexEntries(): IndexEntry[] {
  return ALL_ENTRIES;
}

export const WHITELISTED_ANSWER_TYPES: ReadonlySet<AnswerType> = new Set([
  'computation_list',
  'equations',
  'fill_blank_equation',
  'chain',
  // 21.08.2026: перенесено из исключённых — компаратор появился в
  // lib/openai.ts (buildNarrowItems, case 'word_problem'/'word_problems').
  // Подсказка при ошибке НЕ называет верный ответ — только перечисляет
  // шаги задачи текстом (buildStepsHint), без чисел.
  'word_problem',
  'word_problems',
  // 22.08.2026: первый предмет кроме математики. Компаратор — сравнение
  // ОДНОГО слова с известным верным (нормализация регистра + ё→е), не
  // требует падежного/грамматического анализа — то же по духу, что и
  // числовые типы выше.
  'fill_blank_word',
  // 22.08.2026: перенесено из исключённых по прямому запросу владельца —
  // грамматическая разметка (ед.ч./мн.ч.) сравнивается в коде с заранее
  // известными метками (см. CopyAndMarkGrammarTask выше), а дословность
  // списывания текста — на калиброванном суждении модели ("требуй цитату
  // расхождения" + "при неуверенности считать верным"), см.
  // buildCopyAndMarkCheckTask в lib/openai.ts. Единственный тип в
  // whitelist, где статус НЕ считается целиком в коде — осознанное,
  // явно обсуждённое исключение из общего инварианта архитектуры.
  'copy_and_mark_grammar',
  // 28.08.2026: три новых типа из пилота Петерсон — все три сводятся к
  // уже проверенным механизмам сравнения (число/массив чисел/слово),
  // статус целиком считается в коде, как и у остальных типов выше
  // (кроме copy_and_mark_grammar). См. lib/openai.ts.
  'number_sequence',
  'function_table',
  'word_formation',
  // 01.09.2026: 8 новых типов для english (Быкова) — все сводятся к уже
  // проверенным механизмам сравнения (слово/массив слов по позициям/
  // множество допустимых слов/лояльное сравнение предложения), статус
  // целиком считается в коде. См. lib/openai.ts.
  'word_categorization',
  'pluralize_nouns',
  'pronoun_replacement',
  'multiple_choice',
  'verb_form_fill',
  'sentence_from_cue',
  'question_response_matching',
  'odd_one_out',
  // 02.09.2026: русский язык, Канакина — "Спишите [заданный текст]",
  // статус считается полностью в коде (переиспользует sentence_from_cue).
  'copy_text'
]);

// Явно исключено из узкой проверки — НЕ переносить в WHITELISTED_ANSWER_TYPES
// без повторной ручной проверки условия для каждого случая ниже:
// - fill_operators: собственные "notes" задания admits "не проверялась
//   строгая единственность решения" — возможны другие верные комбинации
//   знаков, которых нет в индексе (та же причина, что и у open_creative*).
// - open_creative / open_creative_verified: несколько верных решений по
//   построению, exampleSolution — иллюстрация ОДНОГО варианта, не эталон
//   для сравнения "равно/не равно".
// - requires_measurement / requires_drawing: ответ зависит от физического
//   измерения линейкой или дорисовки — индекс в принципе не хранит
//   числового ответа для них.
// - logic_puzzle: в индексе всего 1 задание такого типа — отдельный
//   компаратор пока не оправдан.
// - addition_table: большая таблица-сетка — риск перепутать соседние
//   ячейки при OCR выше пользы на первой итерации.
// - compare / compare_and_solve / fact_family / sum_to_product /
//   unit_conversion: по сути числовые, но каждый требует своего
//   компаратора (строки с единицами, массивы, условный формат) — фаза 2.
// (copy_and_mark_grammar был здесь до 22.08.2026 — перенесён в
// WHITELISTED_ANSWER_TYPES выше по прямому запросу владельца, см.
// комментарий там).
export const KNOWN_EXCLUDED_ANSWER_TYPES: ReadonlySet<AnswerType> = new Set([
  'fill_operators',
  'open_creative',
  'open_creative_verified',
  'requires_measurement',
  'requires_drawing',
  'logic_puzzle',
  'addition_table',
  'compare',
  'compare_and_solve',
  'fact_family',
  'sum_to_product',
  'unit_conversion'
]);

// Разовая страховка при загрузке модуля — если в будущем индекс расширят
// (новый учебник/страницы) и случайно появится пара (number, prompt),
// совпадающая с уже существующей, сопоставление по фото (matchCandidatesToIndex)
// может стать неоднозначным. Не бросает — только предупреждает в лог,
// чтобы не уронить прод из-за проблемы в данных.
if (process.env.NODE_ENV !== 'production') {
  const normalize = (s: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const seen = new Map<string, string>();
  for (const entry of ALL_ENTRIES) {
    const key = `${entry.task.number}::${normalize(entry.task.prompt)}`;
    const prevSection = seen.get(key);
    if (prevSection) {
      console.warn(
        `[textbookIndex] Коллизия (number, prompt): "${key}" встречается и в разделе "${prevSection}", и в "${entry.page.section}" — сопоставление по фото может стать неоднозначным.`
      );
    }
    seen.set(key, entry.page.section);
  }
}
