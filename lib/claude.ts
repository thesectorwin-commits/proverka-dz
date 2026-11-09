// Логика проверки домашнего задания — перенесена из клиентского прототипа.
// Ключевое отличие: ANTHROPIC_API_KEY живёт только здесь, на сервере,
// и никогда не попадает в браузер.

import sharp from 'sharp';

// Базовый адрес Anthropic API. На Vercel переменная не задана и используется прямой адрес; при самохостинге в РФ
// (где api.anthropic.com закрыт) задаётся ANTHROPIC_BASE_URL — адрес прокси вида https://relay/<secret>/anthropic.
const ANTHROPIC_MESSAGES_URL = `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`;

export type CheckTask = {
  number: string;
  condition: string;
  // Приблизительная вертикальная область задания на ПЕРВОМ фото, в
  // процентах от высоты страницы (0-100) — нужно, чтобы при точечной
  // перепроверке (см. callFocusedRecheck/cropImageByPercent ниже) можно
  // было physически обрезать фото до ЭТОГО задания, а не отправлять всю
  // страницу целиком (грубое деление верх/половина/низ оказалось
  // недостаточно точным — соседние задания попадали в тот же кроп).
  yStartPercent?: number;
  yEndPercent?: number;
  reasoning?: string;
  status: 'correct' | 'incorrect' | 'unclear';
  explanation: string;
  correct_solution: string;
};

export type Subject = 'math' | 'russian' | 'english' | 'world';

export type CheckResult = {
  subject_reasoning?: string;
  subject: Subject;
  task_photo_reasoning?: string;
  needs_task_photo?: boolean;
  // 18.08.2026: реальный прод-кейс — владелец намеренно приложил фото
  // решения одного задания и фото условия СОВСЕМ ДРУГОГО задания
  // (проверял, заметит ли сервис). Не заметил — модель молча пыталась
  // сопоставить их и вернула бессмысленную ошибку вместо явного
  // предупреждения. Только для двухфотового сценария (см.
  // buildSystemPrompt, singleImage=false) — при одном фото этот сигнал
  // не заполняется (там за это отвечает needs_task_photo).
  photo_mismatch?: boolean;
  tasks: CheckTask[];
  grade: number | null;
  general_comment: string;
};

export type ImageInput = { base64: string; mediaType: string };

// export — только чтобы переиспользовать тот же промпт в одноразовых
// сравнительных скриптах (scripts/test-*.mjs), не для использования в API-роутах
// напрямую (checkHomeworkPhoto остаётся единственной точкой входа для приложения).
// 18.08.2026: "knownSubject" — опциональный параметр, НЕ меняет
// поведение по умолчанию (Claude-путь как вызывал buildSystemPrompt(x)
// без второго аргумента, так и продолжает получать identical prompt —
// нулевой риск регрессии для уже отлаженного пути). Нужен только
// OpenAI-пути: там предмет уже надёжно определён отдельным вызовом ДО
// основного (см. CLASSIFY_AND_BANK_DETECT_PROMPT в lib/openai.ts) — не
// имеет смысла заново тратить ~1600 симв. промпта и отдельное
// output-поле "subject_reasoning" на повторное определение того, что
// уже известно. ВАЖНО: сам механизм рассуждения-перед-ответом (CoT) не
// убирается вообще — он просто переехал в изолированный вызов раньше по
// пайплайну (тот вызов сам получил своё собственное поле-рассуждение,
// см. bank_reasoning в CLASSIFY_AND_BANK_DETECT_PROMPT), а не убран как
// класс механизма. Прямая классификация БЕЗ рассуждения дважды
// проваливалась на реальных тестах этого проекта — просто теперь
// рассуждение происходит один раз, а не дважды за одну проверку.
export function buildSystemPrompt(singleImage: boolean, knownSubject?: Subject): string {
  const subjectBlock = knownSubject
    ? `Предмет всего задания на фото уже определён заранее (отдельным шагом до этого вызова): "${knownSubject}". Впиши именно это значение в поле "subject" на ВЕРХНЕМ уровне JSON-ответа — определять предмет заново не нужно. Поле "subject_reasoning" оставь пустой строкой "".`
    : `ОБЯЗАТЕЛЬНО первым делом определи предмет всего задания на фото. Сначала в поле "subject_reasoning" (1 предложение, служебное, не показывается пользователю) опиши конкретные признаки, которые ты видишь на фото и на основании которых определяешь предмет (например: "на странице русские слова с вопросами к ним про часть речи и подбором окончаний прилагательных" → russian). Только ПОСЛЕ этого заполни "subject" на ВЕРХНЕМ уровне JSON-ответа (не внутри task) — строго одно из четырёх значений, по признакам:
- "math" — арифметические примеры и вычисления (+, -, ×, ÷, =), геометрические фигуры, счёт, измерения, задачи с числами.
- "russian" — слова и предложения на русском языке: разбор по составу, определение частей речи (существительное/прилагательное/глагол), постановка вопроса к слову ("какой?", "какая?"), подбор проверочных слов, окончаний, орфографические правила, разбор предложения.
- "english" — слова, фразы, тексты на английском языке.
- "world" (окружающий мир) — природа, животные, растения, части тела человека, явления природы, география, ОБЖ.
ВАЖНО: номера и буквы-подпункты заданий (1, 2а, 2б, 10a...) — это просто нумерация в тетради, они НИЧЕГО не говорят о предмете. Не выбирай "math" по умолчанию — ориентируйся только на язык и содержание самих слов/примеров на фото.`;

  const taskPhotoStep = singleImage
    ? `ВТОРОЙ ОБЯЗАТЕЛЬНЫЙ ШАГ, ещё до разбора заданий, простой визуальный тест по ПЕРВОМУ фото целиком: это страница ОБЫЧНОЙ ТЕТРАДИ (клетка/линейка) с ТОЛЬКО рукописным текстом ребёнка — то есть НИГДЕ на фото нет напечатанного типографским шрифтом текста учебника? Если да — заполни "needs_task_photo" = true и НЕ пытайся читать/оценивать рукописный текст условия, даже если он кажется разборчивым. Если на фото есть хотя бы немного печатного текста (страница учебника/рабочей тетради) — "needs_task_photo" = false, работай как обычно.
Единственное исключение: если ВСЕ БЕЗ ИСКЛЮЧЕНИЯ задания на странице — короткие арифметические примеры из одних цифр и знаков (+, -, ×, ÷, =, без единого слова, например "76 + 18 = ?"), можно читать и проверять их как обычно — "needs_task_photo" = false. Но если хотя бы ОДНО задание на странице сформулировано словами — это текстовая задача (например "Было 75 п., вышли 25 п. Стало ? п."), а не голый пример, и здесь это исключение НЕ действует, даже если внутри этой же текстовой задачи есть арифметические под-действия вида "75 - 25 = ?". В этом случае "needs_task_photo" = true для ВСЕЙ страницы целиком, включая соседние голые примеры — не дели решение по одному фото на "часть с фото, часть без".
Опиши в служебном поле "task_photo_reasoning" (1 предложение, не показывается пользователю): что видно на фото — печатный учебник, обычная тетрадь с текстом, или тетрадь с короткими числовыми примерами. Если "needs_task_photo" = true — "tasks" пустой массив, "grade" = null, а в "general_comment" вежливо объясни родителю понятным языком, что нужно приложить ещё одно фото — страничку учебника с условием задания, без упоминания технических полей JSON.

`
    : `Тебе даны ДВА фото: первое — решение ученика в тетради (обычно рукописное), второе — условие задания из учебника.

ВТОРОЙ ОБЯЗАТЕЛЬНЫЙ ШАГ, ещё до сопоставления заданий: сначала независимо опиши себе, что реально написано на ПЕРВОМ фото (какая тема, какой номер задания, если виден), и отдельно — что за задание на ВТОРОМ фото (тема, номер). Только после этого сравни — совпадают ли они? Не подгоняй описание первого фото под содержание второго и наоборот — они должны быть независимыми наблюдениями. Если получившиеся темы/номера ЯВНО разные — заполни "photo_mismatch" = true, "tasks" пустой массив, "grade" = null, а в "general_comment" вежливо объясни родителю понятным языком, что второе фото не относится к решению на первом и нужно приложить именно ту страничку учебника, где дано решённое задание. В этом случае "needs_task_photo" всегда false (это отдельный сигнал).

Если темы/номера совпадают (или совпадение не опровергнуто — не отклоняй из-за мелких несовпадений формулировок или ракурса съёмки) — "photo_mismatch" = false. Условие уже предоставлено вторым фото, поэтому "needs_task_photo" тоже всегда false в этом случае — не оценивай первое фото само по себе на этот счёт, даже если оно целиком рукописное.

`;
  return `Ты — опытный учитель начальной школы (1-5 класс), проверяющий домашнее задание ученика по фото страницы тетради или учебника. Задание может быть по ЛЮБОМУ из следующих предметов: математика, русский язык, английский язык, окружающий мир — определи это САМ по содержанию фото, не спрашивая уточнений у пользователя. Также самостоятельно оцени примерный класс (1-5) по сложности материала — для собственного понимания уровня, не выводи её отдельно.

${subjectBlock}

${taskPhotoStep}ВАЖНО про структуру заданий: если под одним номером на странице дано НЕСКОЛЬКО отдельных примеров/вопросов/под-пунктов, НЕ объединяй их в один task. Разбей на отдельные task-элементы с номером вида "10a", "10b", "10c" (латинские строчные буквы по порядку следования на фото), и заполни для каждого свои condition/reasoning/status/explanation.
ИСКЛЮЧЕНИЕ из этого правила: если несколько строк — это последовательные пронумерованные ДЕЙСТВИЯ (вида "1) ...", "2) ...") одной и той же текстовой задачи, ведущие к одному общему вопросу и одной строке "Ответ:" (часто перед ними идёт краткая запись условия вида "Было — ..., Стало — ?") — это ОДНА задача с одним общим условием, а НЕ несколько отдельных примеров. Не разбивай её действия на отдельные task, даже если по отдельности они выглядят как голые арифметические примеры (например "75 - 25 = ?") — в "condition" пиши полный текст условия задачи (включая краткую запись, если она есть), а не выражение одного действия.

ВАЖНО про составные задания ВНУТРИ одного task: если само задание требует НЕСКОЛЬКО разных действий от ученика (например, "впиши пропущенную букву И придумай предложение с этим словом", "реши пример И запиши ответ словами") — это не повод разбивать на отдельные task (это одно задание, а не несколько), но оцени ВСЕ требуемые части, а не только первую. В "reasoning" разбери каждую часть по отдельности. Если хотя бы одна часть не выполнена или выполнена с ошибкой — status "incorrect" (или "unclear", если эта часть не видна на фото), а в "explanation" укажи, какая именно часть требует внимания. Не игнорируй молча часть задания только потому что первая часть оказалась верной.

Твоя задача — для КАЖДОГО task заполнить поля в СТРОГО следующем порядке:

1. "condition" — краткое условие/пример как на фото, в НЕРЕШЁННОМ виде (например, "76 + 18 = ?", а не уже решённое выражение).
2. "yStartPercent"/"yEndPercent" — служебные поля, НИКОГДА не показываются пользователю: приблизительная вертикальная область ЭТОГО задания на ПЕРВОМ фото, в процентах от общей высоты страницы (0 — самый верх фото, 100 — самый низ). Например, если задание занимает примерно среднюю треть страницы — "yStartPercent": 30, "yEndPercent": 60. Не нужна пиксельная точность, но области РАЗНЫХ заданий не должны заметно перекрываться.
3. "reasoning" — служебное поле, НИКОГДА не показывается пользователю. Определи предмет, самостоятельно вычисли/определи правильный ответ, сравни с тем, что написал ученик.
4. "status" — "correct" (полностью совпадает, запись читается однозначно), "incorrect" (читается уверенно, но не совпадает), "unclear" (нельзя уверенно прочитать).

Правило про почерк: неаккуратный, но читаемый почерк — не повод для "unclear". Используй "unclear" только при реальной невозможности прочитать.

Правило про точность подсказки при вычислениях: сравнивай поразрядно (единицы, десятки, сотни) справа налево и указывай только тот разряд, где реальное расхождение.

Правило про компактные схемы и направления (стрелки, лево/право): разбирай каждый элемент отдельно, по ориентирам на картинке. Один наконечник стрелки — треугольный кончик, а не изогнутый хвост. При реальной неоднозначности — "unclear", а не рискованное "incorrect".

Отдельный случай — задания "куда посмотреть перед переходом дороги" (ОБЖ, стрелки на картинке с пешеходом): "налево"/"направо" в правиле дорожного движения — это лево/право САМОГО ПЕШЕХОДА, стоящего лицом по направлению перехода, а НЕ абсолютное лево/право на рисунке. Сначала определи, в какую сторону рисунка "смотрит"/идёт пешеход, и только потом переведи его "налево"/"направо" в конкретную сторону рисунка (если пешеход по рисунку идёт "вниз" — его лево соответствует ПРАВОЙ стороне рисунка, а его право — ЛЕВОЙ стороне рисунка, как в зеркале; если идёт "вверх" — наоборот). Для дороги с двусторонним движением и "островком безопасности" посередине (два отдельных проезда, между ними разделительная полоса): на БЛИЖНЕЙ (первой от пешехода) проезжей части сначала смотрят налево (пешехода), на ДАЛЬНЕЙ (второй, за островком) — направо (пешехода). Эта пространственная задача сложнее обычной — при любой неуверенности в переводе "лево/право пешехода" в сторону рисунка используй "unclear", а не рискованное "incorrect".

5. "explanation" — короткая подсказка для ребёнка, БЕЗ итогового правильного ответа:
   - "correct" → пустая строка "".
   - "incorrect" → укажи, что именно написал/отметил ученик и в каком месте вероятная ошибка, без называния правильного ответа. Без фраз "попробуй ещё раз" — это показывается в интерфейсе отдельно.
   - "unclear" → что именно не удалось разобрать, без итогового ответа.
6. "correct_solution" — заполняется ТОЛЬКО если status = "correct". Иначе пустая строка "".

Выстави общую оценку "grade" по 5-балльной шкале: 5 — всё верно; 4 — одна ошибка; 3 — несколько ошибок; 2 — большинство с ошибками.
Дай короткий "general_comment" без конкретных правильных ответов.
Если на фото нет школьного задания — пустой массив tasks, general_comment объясни это, grade = null.

Отвечай СТРОГО в формате JSON, без markdown и пояснений, поля в указанном порядке:
{
  "subject_reasoning": "...",
  "subject": "math|russian|english|world",
  "task_photo_reasoning": "...",
  "needs_task_photo": true|false,
  "photo_mismatch": true|false,
  "tasks": [{"number": "10a", "condition": "...", "yStartPercent": 0, "yEndPercent": 100, "reasoning": "...", "status": "correct|incorrect|unclear", "explanation": "...", "correct_solution": "..."}],
  "grade": 1-5 или null,
  "general_comment": "..."
}

Будь краток в каждом поле (1-2 предложения), чтобы не тратить лишние токены.`;
}

type ClaudeApiResponse = {
  content?: Array<{ text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
  error?: { message?: string };
  type?: string;
};

async function callVisionAPI(
  images: ImageInput[],
  temperature: number,
  detailCrops: ImageInput[] = []
): Promise<{ result: CheckResult; usage?: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY не задан в переменных окружения сервера');
  }

  const instructionText =
    images.length > 1
      ? 'Первое фото — решение ученика (тетрадь), второе фото — условие задания из учебника. Сопоставь задания между фото по номеру/содержанию и проверь решение относительно условия со второго фото. Верни результат строго в формате JSON согласно схеме.'
      : 'Проверь домашнее задание на этом фото и верни результат строго в формате JSON согласно схеме. Если условие задания не видно на фото (например, в тетради только рукописный ответ без вопроса) — верни needs_task_photo=true, как описано в системной инструкции.';

  // Увеличенные фрагменты (верх/низ) первого фото — та же страница, просто
  // крупнее относительно себя, чем на общем фото. Причина: на реальном
  // тесте одна и та же рукописная цифра стабильно читалась верно на
  // плотном кропе именно этой строки и стабильно неверно на полном фото
  // страницы — крупные фото Anthropic API всё равно ужимает до одного
  // размера, и мелкий почерк на полной странице теряет детализацию.
  const cropsText =
    detailCrops.length > 0
      ? 'Дополнительно приложены увеличенные фрагменты (верх и низ) первого фото — та же страница, просто крупнее и детальнее. Используй их, если на общем фото не удаётся уверенно прочитать мелкий почерк — это не отдельные задания, а более чёткий вид того же самого решения.'
      : '';

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 6144,
      temperature,
      system: buildSystemPrompt(images.length === 1),
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image',
              source: { type: 'base64', media_type: img.mediaType, data: img.base64 }
            })),
            ...detailCrops.map((img) => ({
              type: 'image',
              source: { type: 'base64', media_type: img.mediaType, data: img.base64 }
            })),
            { type: 'text', text: [instructionText, cropsText].filter(Boolean).join(' ') }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    console.error('Anthropic API error:', response.status, bodyText);
    throw new Error(`Ошибка сервиса проверки (${response.status})`);
  }

  const data: ClaudeApiResponse = await response.json();

  if (data.type === 'error' || data.error) {
    // Сырое сообщение об ошибке от Anthropic API (например, валидация
    // формата фото) не должно попадать напрямую родителю/ребёнку в
    // интерфейс — только в лог для отладки.
    console.error('Anthropic API вернул ошибку:', data.error);
    throw new Error('Сервис проверки временно недоступен, попробуйте ещё раз через минуту');
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('Ответ модели был обрезан по длине — попробуйте фото с меньшим числом заданий');
  }

  const textBlock = (data.content || []).map((b) => b.text || '').join('\n').trim();
  let cleaned = textBlock.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let parsed: CheckResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('JSON parse error, raw response:', textBlock);
    throw new Error('Не удалось разобрать ответ модели — попробуйте более чёткое фото');
  }

  return { result: parsed, usage: data.usage };
}

async function callWithRetry(images: ImageInput[], temperature: number, detailCrops: ImageInput[] = []) {
  const RETRIABLE = ['Ошибка сервиса проверки', 'fetch failed', 'network'];
  try {
    return await callVisionAPI(images, temperature, detailCrops);
  } catch (err: any) {
    const msg = err?.message || '';
    if (RETRIABLE.some((marker) => msg.includes(marker))) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return await callVisionAPI(images, temperature, detailCrops);
    }
    throw err;
  }
}

// Перепроверка спорных заданий раньше заново гоняла ВЕСЬ промпт (определение
// предмета, разбор КАЖДОГО задания на фото, полная JSON-схема) — по логам
// это занимало почти столько же времени, сколько основной вызов (~30с), и
// вместе с ним стабильно превышало лимит Vercel в 60с. Спорных заданий
// обычно 1-2 из десятка — незачем пересчитывать все остальные заново.
// Теперь перепроверка получает только список конкретных спорных заданий
// (номер+условие) и намного более короткую задачу/схему ответа — должно
// быть в разы быстрее основного вызова, а не сопоставимо с ним.
async function callFocusedRecheck(
  images: ImageInput[],
  tasksToRecheck: CheckTask[]
): Promise<{
  results: Map<string, { status: string; explanation: string; correct_solution: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY не задан в переменных окружения сервера');
  }

  const tasksList = tasksToRecheck.map((t) => `- №${t.number}: "${t.condition}"`).join('\n');
  const promptText = `Это ТОЧЕЧНАЯ повторная проверка конкретных заданий из домашнего задания на фото — она идёт ОТДЕЛЬНЫМ вызовом, без отвлечения на остальные задания страницы. Реальный случай: при разборе ВСЕХ заданий на фото сразу модель иногда упускает ошибку в одном из промежуточных действий многошаговой текстовой задачи, а при разборе этого же задания в одиночку — замечает её. Не полагайся на то, что определил предыдущий проход по всей странице — он мог ошибиться в любую сторону (и посчитать неверное решение верным, и наоборот).

Разбери ЗАНОВО, внимательно и с нуля, следующие задания (остальные задания на фото не трогай):
${tasksList}

Если задание состоит из нескольких действий (текстовая задача) — проверь КАЖДОЕ действие отдельно против исходных чисел из условия, а не только логическую связность шагов между собой: ошибка в первом действии не становится "верной", даже если следующее действие арифметически правильно продолжает уже неверный промежуточный результат.

Для КАЖДОГО определи статус: "correct" (решение ученика верное), "incorrect" (решение неверное), "unclear" (нельзя уверенно прочитать запись).

Ответь строго JSON-массивом в том же порядке, без пояснений и markdown:
[{"number": "...", "status": "correct|incorrect|unclear", "explanation": "короткая подсказка ребёнку без итогового правильного ответа: для correct пустая строка, для incorrect — что и где вероятная ошибка без называния верного ответа, для unclear — что не удалось разобрать", "correct_solution": "правильный ответ, ТОЛЬКО если status=correct, иначе пустая строка"}]`;

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1536,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image',
              source: { type: 'base64', media_type: img.mediaType, data: img.base64 }
            })),
            { type: 'text', text: promptText }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    console.error('Anthropic API error (focused recheck):', response.status, bodyText);
    throw new Error(`Ошибка сервиса проверки (${response.status})`);
  }

  const data: ClaudeApiResponse = await response.json();
  if (data.type === 'error' || data.error) {
    console.error('Anthropic API вернул ошибку (focused recheck):', data.error);
    throw new Error('Сервис проверки временно недоступен, попробуйте ещё раз через минуту');
  }

  const textBlock = (data.content || []).map((b) => b.text || '').join('\n').trim();
  let cleaned = textBlock.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }

  const parsed = JSON.parse(cleaned) as Array<{
    number?: string;
    status?: string;
    explanation?: string;
    correct_solution?: string;
  }>;
  const results = new Map<string, { status: string; explanation: string; correct_solution: string }>();
  parsed.forEach((item) => {
    if (item.number) {
      results.set(item.number, {
        status: item.status || '',
        explanation: item.explanation || '',
        correct_solution: item.correct_solution || ''
      });
    }
  });

  return { results, usage: data.usage };
}

// Реальный кейс: многошаговая текстовая задача с ошибкой в первом действии
// (14+18=22 вместо 32) при разборе ВМЕСТЕ с другими заданиями страницы
// получала "correct" от основного вызова — а при разборе В ОДИНОЧКУ (то же
// самое задание отдельным фото/вызовом) та же модель ошибку ловила верно.
// Похоже, дело не в почерке и не в промпте, а в том, что среди других
// заданий на странице внимание к поразрядной проверке одного конкретного
// действия теряется. Простая эвристика по ТЕКСТУ (не ещё один ИИ-вызов —
// используем то, что модель уже вернула в condition) находит такие
// задания, чтобы перепроверить их отдельным изолированным вызовом ВСЕГДА,
// а не только если первый проход уже помечал их "incorrect" (иначе не
// защищает именно от этого случая — ложного "correct" с первого раза).
// export — переиспользуется в lib/openai.ts (та же эвристика запуска
// точечной перепроверки, чтобы не дублировать её в двух местах).
export function looksLikeMultiStepWordProblem(condition: string): boolean {
  const text = (condition || '').toLowerCase();
  if (/действие\s*\d/.test(text)) return true;
  const equalsCount = (text.match(/=/g) || []).length;
  if (equalsCount >= 2) return true;
  const digitGroups = text.match(/\d+/g) || [];
  const wordProblemMarkers = /(было|стало|осталось|всего|купил|потратил|решением|задач)/;
  return digitGroups.length >= 3 && wordProblemMarkers.test(text);
}

// Грубое деление на верх/низ страницы (см. историю в CLAUDE.md) физически
// не изолировало задание от соседей — на одной половине могло остаться
// сразу несколько заданий. Точная обрезка по процентным координатам,
// которые вернула модель для КОНКРЕТНОГО задания (yStartPercent/yEndPercent),
// действительно убирает соседние задания из кадра. Небольшой отступ
// (padding) добавлен на случай, если модель оценила границы чуть неточно —
// лучше немного лишнего пространства вокруг, чем обрезать часть самого
// задания.
// export — переиспользуется в scripts/test-*.ts для тестов изоляции кропом
// на других моделях (та же причина, что и у export buildSystemPrompt выше).
// 27.08.2026: расширено xStartPercent/xEndPercent (необязательные,
// по умолчанию 0/100 — вся ширина, как и раньше) — изначально для ручной
// рамки в разделе "Подсказать" (см. CLAUDE.md), которая тогда сужала
// область по горизонтали. Позже (тот же день) по фидбэку владельца ось
// поменяли местами — на большинстве страниц задания идут друг под другом,
// то есть отличаются по ВЕРТИКАЛИ, а не по горизонтали, и ребёнок теперь
// двигает/тянет именно yStartPercent/yEndPercent, а X всегда шлётся
// как 0/100 (вся ширина). Параметр xStartPercent/xEndPercent оставлен —
// вдруг понадобится для другого случая — но сейчас Hint его фактически не
// использует. Паддинг по X (2%) меньше, чем по Y (6%) — это исторически
// осталось от старой (горизонтальной) версии, сейчас не критично, раз
// ручной выбор снова по Y и получает те же 6%, что и авто-детект. Все
// существующие вызовы (7+ мест в этом файле и в lib/openai.ts) не
// передают x-параметры и получают байт-в-байт то же поведение, что и
// раньше — это чисто аддитивное расширение.
export async function cropImageByPercent(
  image: ImageInput,
  yStartPercent: number,
  yEndPercent: number,
  xStartPercent: number = 0,
  xEndPercent: number = 100,
  yPaddingPercent: number = 6,
  xPaddingPercent: number = 2
): Promise<ImageInput | null> {
  try {
    const buffer = Buffer.from(image.base64, 'base64');
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width;
    const height = metadata.height;
    if (!width || !height) return null;

    const paddingPercent = yPaddingPercent;
    const startPercent = Math.max(0, Math.min(yStartPercent, yEndPercent) - paddingPercent);
    const endPercent = Math.min(100, Math.max(yStartPercent, yEndPercent) + paddingPercent);
    if (endPercent - startPercent < 5) return null; // подозрительно узкая область — не доверяем

    const xStart = Math.max(0, Math.min(xStartPercent, xEndPercent) - xPaddingPercent);
    const xEnd = Math.min(100, Math.max(xStartPercent, xEndPercent) + xPaddingPercent);
    if (xEnd - xStart < 5) return null; // подозрительно узкая область — не доверяем

    const top = Math.round((startPercent / 100) * height);
    const cropHeight = Math.max(1, Math.round(((endPercent - startPercent) / 100) * height));
    const left = Math.round((xStart / 100) * width);
    const cropWidth = Math.max(1, Math.round(((xEnd - xStart) / 100) * width));

    const cropped = await sharp(buffer)
      .extract({
        left,
        top,
        width: Math.min(cropWidth, width - left),
        height: Math.min(cropHeight, height - top)
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    return { base64: cropped.toString('base64'), mediaType: 'image/jpeg' };
  } catch (err) {
    console.error('Ошибка обрезки фото по координатам задания:', err);
    return null;
  }
}

// Серверный аналог lib/normalizeImage.ts → createDetailCrops (браузерная
// canvas-функция, недоступна в Node) — те же верх/низ с 12% нахлёстом.
// Нужен для ручного выделения области в разделе "Проверить" (см. CLAUDE.md,
// «Выделение области задания при проверке»): после того как сервер обрезал
// фото до выбранной пользователем области, детализация должна считаться ОТ
// ЭТОЙ ОБЛАСТИ, а не от всей страницы — иначе кропы верх/низ снова принесли
// бы в кадр соседние задания, которые пользователь как раз хотел исключить
// (тот же класс проблемы, что чинили в explainTask/explainTaskOpenAI фиксом
// паддинга cropImageByPercent днём ранее).
export async function createDetailCropsFromImage(image: ImageInput): Promise<ImageInput[]> {
  try {
    const buffer = Buffer.from(image.base64, 'base64');
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
  } catch (err) {
    console.error('Ошибка построения детализированных кропов из области:', err);
    return [];
  }
}

// Пять формулировок правила needs_task_photo внутри общего промпта проверки
// (см. CLAUDE.md) не дали стабильного результата — модель, уверенно прочитав
// почерк, предпочитала сразу оценить задание, а не остановиться и попросить
// второе фото: у неё в том же вызове была конкурирующая цель "быть полезным
// и дать полный ответ". Вынесли решение в отдельный, маленький вызов дешёвой
// модели, у которой ВООБЩЕ нет возможности оценивать задание — только
// классифицировать фото. Экономия по деньгам: путь "нужно фото учебника"
// теперь обходится дешёвым вызовом вместо дорогого sonnet-вызова.
// Раньше модель отдельно писала "reasoning" текстом и отдельно заполняла
// независимое булево поле "needs_task_photo" — в реальном тесте они разошлись
// (reasoning: "виден печатный текст учебника", needs_task_photo: true) —
// модель, видимо, не сверяла второе поле с первым. Убрали саму возможность
// такого расхождения: теперь ЕДИНСТВЕННОЕ решение модели — выбор одной из
// трёх категорий (photo_type), а needs_task_photo вычисляется из неё в коде
// (см. ниже), а не спрашивается у модели напрямую вторым полем.
const NEEDS_TASK_PHOTO_PROMPT = `Посмотри на фото страницы тетради ребёнка. Классифицируй фото ЦЕЛИКОМ строго в одну из трёх категорий:

- "printed" — на фото есть хотя бы немного напечатанного типографским шрифтом текста (страница учебника или рабочей тетради с готовыми печатными заданиями) — даже если рядом есть рукописные пометки/ответы ребёнка.
- "handwritten_words" — фото страницы ОБЫЧНОЙ тетради (клетка/линейка), где ВСЁ рукописное (нет ни одного печатного слова учебника), и хотя бы одно задание сформулировано словами, а не только цифрами и знаками — например текстовая задача вида "Было 75 п., вышли 25 п. Стало ? п.".
- "handwritten_numbers_only" — фото страницы обычной тетради, где ВСЁ рукописное, но ВСЕ задания без исключения — короткие арифметические примеры из одних цифр и знаков (+, -, ×, ÷, =), без единого слова (например "76 + 18 = ?").

НЕ пытайся читать почерк подробно и НЕ оценивай правильность решения — это не твоя задача сейчас, только классификация фото целиком.

Ответь строго в формате JSON, без пояснений вокруг:
{"reasoning": "1 предложение — что конкретно видно на фото и почему выбрана эта категория", "photo_type": "printed|handwritten_words|handwritten_numbers_only"}`;

async function checkNeedsTaskPhoto(
  image: ImageInput
): Promise<{ needsTaskPhoto: boolean; reason: string; usage?: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY не задан в переменных окружения сервера');
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
            { type: 'text', text: NEEDS_TASK_PHOTO_PROMPT }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    console.error('Anthropic API error (needs_task_photo precheck):', response.status, bodyText);
    throw new Error(`Ошибка сервиса проверки (${response.status})`);
  }

  const data: ClaudeApiResponse = await response.json();
  if (data.type === 'error' || data.error) {
    console.error('Anthropic API вернул ошибку (needs_task_photo precheck):', data.error);
    throw new Error('Сервис проверки временно недоступен, попробуйте ещё раз через минуту');
  }

  const textBlock = (data.content || []).map((b) => b.text || '').join('\n').trim();
  let cleaned = textBlock.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleaned) as { photo_type?: string; reasoning?: string };
  return {
    needsTaskPhoto: parsed.photo_type === 'handwritten_words',
    reason: parsed.reasoning || '',
    usage: data.usage
  };
}

// 20.08.2026: вынесено из checkHomeworkPhoto (этот файл) и
// checkHomeworkPhotoOpenAI (lib/openai.ts) — оба места содержали
// идентичный код расчёта grade/general_comment по итоговым статусам
// заданий. Чистый рефакторинг (поведение не меняется), плюс переиспользуется
// новым индекс-путём (lib/openai.ts, tryTextbookIndexCheck).
export function computeGradeAndComment(tasks: CheckTask[]): { grade: number | null; general_comment: string } {
  const total = tasks.length;
  const correctCount = tasks.filter((t) => t.status === 'correct').length;
  const problemCount = total - correctCount;

  const grade =
    total === 0 ? null : problemCount === 0 ? 5 : problemCount === 1 ? 4 : problemCount <= Math.ceil(total / 2) ? 3 : 2;

  const general_comment =
    problemCount === 0
      ? 'Молодец, всё выполнено верно!'
      : problemCount === total
      ? 'Пока не получилось подтвердить ни одно задание как выполненное верно — попробуй решить их ещё раз.'
      : `Большинство заданий выполнено верно! Есть ${problemCount} ${problemCount === 1 ? 'задание' : 'задание/я'}, которое стоит попробовать ещё раз.`;

  return { grade, general_comment };
}

/**
 * Полная проверка фото домашнего задания с перепроверкой спорных заданий.
 * Принимает одно фото (решение) или два (решение + условие из учебника —
 * см. needs_task_photo). Фото передаются только как base64 в памяти —
 * нигде не пишутся на диск.
 */
export async function checkHomeworkPhoto(
  images: ImageInput[],
  detailCrops: ImageInput[] = []
): Promise<{ result: CheckResult; tokensInput: number; tokensOutput: number }> {
  let tokensInput = 0;
  let tokensOutput = 0;
  // Временные замеры для диагностики таймаутов на Vercel (Hobby, лимит 60с
  // на весь запрос) — до трёх последовательных вызовов Anthropic в одном
  // запросе, логи покажут, какой именно шаг съедает время.
  const t0 = Date.now();

  // Предпроверка нужна только когда условия учебника ещё нет (одно фото) —
  // если второе фото уже приложено, вопрос "нужно ли второе фото" не стоит.
  if (images.length === 1) {
    try {
      const precheck = await checkNeedsTaskPhoto(images[0]);
      tokensInput += precheck.usage?.input_tokens || 0;
      tokensOutput += precheck.usage?.output_tokens || 0;
      console.log(`[checkHomeworkPhoto] precheck done за ${Date.now() - t0}мс, needsTaskPhoto=${precheck.needsTaskPhoto}`);

      if (precheck.needsTaskPhoto) {
        return {
          result: {
            subject: 'math',
            needs_task_photo: true,
            tasks: [],
            grade: null,
            general_comment:
              precheck.reason ||
              'Не получилось понять условие задания по этому фото. Приложите ещё одно фото — страничку учебника, где написано задание.'
          },
          tokensInput,
          tokensOutput
        };
      }
    } catch (err) {
      // Дешёвая предпроверка не должна блокировать проверку целиком — если
      // она упала, просто идём обычным путём (как было до её появления).
      console.error(`[checkHomeworkPhoto] ошибка предпроверки needs_task_photo за ${Date.now() - t0}мс, продолжаем обычной проверкой:`, err);
    }
  }

  const tBeforePrimary = Date.now();
  const primary = await callWithRetry(images, 0, detailCrops);
  console.log(`[checkHomeworkPhoto] основной вызов done за ${Date.now() - tBeforePrimary}мс (всего ${Date.now() - t0}мс)`);
  tokensInput += primary.usage?.input_tokens || 0;
  tokensOutput += primary.usage?.output_tokens || 0;

  // 18.08.2026: реальный прод-кейс — владелец намеренно приложил фото
  // условия от СОВСЕМ ДРУГОГО задания, сервис молча пытался сопоставить
  // и выдал бессмысленную ошибку вместо предупреждения. См. комментарий
  // у CheckResult.photo_mismatch и второй шаг двухфотовой ветки
  // buildSystemPrompt выше.
  if (images.length > 1 && primary.result.photo_mismatch) {
    return { result: primary.result, tokensInput, tokensOutput };
  }

  const tasks = Array.isArray(primary.result.tasks) ? primary.result.tasks : [];
  const hasIncorrect = tasks.some((t) => t.status === 'incorrect');
  // Многошаговые текстовые задачи перепроверяем ВСЕГДА, независимо от
  // вердикта основного прохода (см. комментарий у looksLikeMultiStepWordProblem) —
  // не только когда он уже сказал "incorrect".
  const riskyNumbers = new Set(
    tasks.filter((t) => looksLikeMultiStepWordProblem(t.condition)).map((t) => t.number)
  );

  if (hasIncorrect || riskyNumbers.size > 0) {
    const tasksToRecheck = tasks.filter((t) => t.status === 'incorrect' || riskyNumbers.has(t.number));

    if (tasksToRecheck.length > 0) {
      // Точная обрезка по координатам, которые вернула модель для КАЖДОГО
      // задания (yStartPercent/yEndPercent, см. cropImageByPercent выше) —
      // грубое деление верх/низ (предыдущая попытка) оказалось недостаточно
      // точным: соседние задания всё равно попадали в тот же кроп, и баг
      // воспроизводился. У каждого задания теперь СВОЙ кроп, остальные
      // задания страницы физически не видны на этом вызове. Если координат
      // нет или обрезка не удалась — fallback на полное фото, как раньше.
      const groups: Array<{ tasks: CheckTask[]; images: ImageInput[] }> = [];
      for (const task of tasksToRecheck) {
        let crop: ImageInput | null = null;
        if (task.yStartPercent != null && task.yEndPercent != null) {
          crop = await cropImageByPercent(images[0], task.yStartPercent, task.yEndPercent);
        }
        groups.push({ tasks: [task], images: crop ? [crop] : images });
      }

      const tBeforeRetry = Date.now();
      // Promise.allSettled, а не Promise.all — группы независимы, и падение
      // одной (например, верхнего кропа) не должно терять результат другой.
      const settled = await Promise.allSettled(groups.map((g) => callFocusedRecheck(g.images, g.tasks)));
      console.log(
        `[checkHomeworkPhoto] перепроверка (${tasksToRecheck.length} зад. в ${groups.length} групп(е/ах), многошаговых ${riskyNumbers.size}) done за ${Date.now() - tBeforeRetry}мс (всего ${Date.now() - t0}мс)`
      );

      settled.forEach((res) => {
        if (res.status !== 'fulfilled') {
          console.error('Ошибка при повторной проверке (одна из групп):', res.reason);
          return; // Показываем результат первой проверки для этой группы — не блокируем пользователя.
        }
        tokensInput += res.value.usage?.input_tokens || 0;
        tokensOutput += res.value.usage?.output_tokens || 0;

        tasks.forEach((t) => {
          if (t.status !== 'incorrect' && !riskyNumbers.has(t.number)) return;
          const match = res.value.results.get(t.number);
          if (!match || !match.status) return;
          t.status = match.status as CheckTask['status'];
          t.explanation = match.status === 'correct' ? '' : match.explanation;
          t.correct_solution = match.status === 'correct' ? match.correct_solution || '' : '';
        });
      });
    }

    // Пересчитываем grade/general_comment по финальным (уже слитым) статусам —
    // иначе они могут разойтись с реальными вердиктами после перепроверки.
    const { grade, general_comment } = computeGradeAndComment(tasks);
    primary.result.grade = grade;
    primary.result.general_comment = general_comment;
  }

  console.log(`[checkHomeworkPhoto] итого ${Date.now() - t0}мс`);
  return { result: primary.result, tokensInput, tokensOutput };
}

// ---------------------------------------------------------------------
// Раздел "Подсказать" (сценарий 3 из CLAUDE.md) — ребёнок фотографирует
// ЕЩЁ НЕ решённое задание и просит объяснить, что делать, БЕЗ готового
// ответа. Отдельный от проверки поток: два вызова вместо одного — тот же
// принцип, что уже проверен на needs_task_photo (дешёвая классификация
// отдельно от содержательного вызова) и на точечной перепроверке
// (yStartPercent/yEndPercent + cropImageByPercent — физическая изоляция
// одного задания от соседей на насыщенной странице, без чего модель
// путает задания между собой). Ничего не сохраняется в БД — это не
// проверка с оценкой, а разовая подсказка.
// ---------------------------------------------------------------------

export type HintTaskCandidate = {
  number: string;
  condition: string;
  yStartPercent: number;
  yEndPercent: number;
};

// export — переиспользуется в lib/openai.ts (detectTasksOnTaskPhoto) для
// того же поиска заданий+координат, но через OpenAI Responses API вместо
// Anthropic — см. комментарий там.
export const DETECT_TASKS_PROMPT = `Посмотри на фото страницы школьной тетради или учебника (1-5 класс). Перечисли ВСЕ отдельные задания/примеры/вопросы, которые видишь на странице — НЕ решай их и НЕ оценивай, верно ли они уже решены (даже если рядом есть чей-то рукописный ответ) — сейчас твоя единственная задача найти и перечислить сами задания.

Для КАЖДОГО задания укажи:
- "number" — номер, как подписано в тетради/учебнике (если явного номера нет — придумай порядковый: "1", "2"...);
- "condition" — краткое условие ОДНИМ предложением, как оно сформулировано (например "37 + 42 = ?" или "Раздели слова на слоги");
- "yStartPercent"/"yEndPercent" — вертикальная область ЭТОГО задания на фото, в процентах от общей высоты страницы (0 — самый верх, 100 — самый низ).

Про yStartPercent/yEndPercent — это самая важная и самая частая ошибка, будь внимателен:
- Главный ориентир — САМ НОМЕР задания (например "8.", "9.", "10." в начале строки). Найди на фото высоту, на которой начинается печатный/рукописный номер каждого задания — это и есть yStart. yEnd этого же задания — это высота ЧУТЬ ВЫШЕ той точки, где начинается номер СЛЕДУЮЩЕГО задания (не там, где заканчивается видимый текст самого задания — после последней строки обычно ещё есть место под ответ, которое тоже принадлежит этому заданию, вплоть до начала следующего номера). Для последнего задания на фото yEnd — низ страницы (100), если после него ничего больше нет.
- НЕ определяй границы приблизительно на глаз "поровну поделить страницу" — задания на реальной странице почти никогда не занимают одинаковую долю высоты; если на фото 5 заданий, НЕ дели 100% на 5 равных частей.
- Если у задания несколько строк (например таблица примеров в столбик, или список утверждений с несколькими галочками) — это всё равно ОДНО задание вплоть до номера следующего, не обрезай по первой строке.
- Перечисляй задания СВЕРХУ ВНИЗ, в порядке их расположения на странице.

Если под одним номером несколько отдельных подпунктов (а, б, в) — перечисляй их как отдельные задания с номером вида "3а", "3б".

Отдельный случай — упражнение начинается с ЖИРНОГО ЗАГОЛОВКА (номер + общая инструкция целиком, например "17. Подбери соответствующую реплику."), а под ним — список отдельных строк/вопросов СО СВОЕЙ нумерацией, которая начинается заново с 1 (не продолжает предыдущую последовательность вида 10, 11, 12…). В этом случае НЕ создавай отдельное задание для самого заголовка с общей инструкцией — вместо этого перечисли КАЖДУЮ строку вложенного списка как отдельное задание с номером вида "17.1", "17.2", "17.3"... (номер заголовка, точка, номер строки), а "condition" — это содержимое именно этой строки (например "I'm Larry."), а не текст общей инструкции.

Определи также предмет — "subject": одно из "math"/"russian"/"english"/"world".

Ответь строго JSON, без markdown и пояснений:
{"subject": "math|russian|english|world", "tasks": [{"number": "...", "condition": "...", "yStartPercent": 0, "yEndPercent": 100}]}`;

export async function detectTasksForHint(
  image: ImageInput
): Promise<{
  subject: Subject;
  tasks: HintTaskCandidate[];
  usage?: { input_tokens: number; output_tokens: number };
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY не задан в переменных окружения сервера');
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      // Раньше был claude-haiku-4-5 (по аналогии с checkNeedsTaskPhoto) — но
      // там модель отвечает на грубый бинарный вопрос (печатный/рукописный
      // текст), а здесь нужна точная оценка координат нескольких заданий на
      // насыщенной странице — это задача на пространственную точность, а не
      // на классификацию, и haiku стабильно давал слишком неточные/кривые
      // границы (задания наезжали друг на друга на реальных фото). Sonnet
      // здесь оправдан так же, как и для основного вызова проверки.
      model: 'claude-sonnet-4-6',
      max_tokens: 1536,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
            { type: 'text', text: DETECT_TASKS_PROMPT }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    console.error('Anthropic API error (detect tasks for hint):', response.status, bodyText);
    throw new Error(`Ошибка сервиса (${response.status})`);
  }

  const data: ClaudeApiResponse = await response.json();
  if (data.type === 'error' || data.error) {
    console.error('Anthropic API вернул ошибку (detect tasks for hint):', data.error);
    throw new Error('Сервис временно недоступен, попробуйте ещё раз через минуту');
  }

  const textBlock = (data.content || []).map((b) => b.text || '').join('\n').trim();
  let cleaned = textBlock.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleaned) as { subject?: Subject; tasks?: HintTaskCandidate[] };
  return {
    subject: parsed.subject || 'math',
    tasks: clampTaskBounds(Array.isArray(parsed.tasks) ? parsed.tasks : []),
    usage: data.usage
  };
}

// Модель по-прежнему может ошибиться в границах (перехлёст двух заданий) —
// подстраховка в коде, а не ещё одна просьба к модели "не перекрывай":
// сортируем по yStart и обрезаем yEnd каждого задания серединой зазора до
// начала следующего, если она меньше. Гарантирует, что кликабельные
// области на фото хотя бы визуально не наезжают друг на друга, даже если
// сама граница определена не идеально точно.
// export — переиспользуется в lib/openai.ts, та же причина, что и у
// DETECT_TASKS_PROMPT выше.
export function clampTaskBounds(tasks: HintTaskCandidate[]): HintTaskCandidate[] {
  const sorted = [...tasks].sort((a, b) => a.yStartPercent - b.yStartPercent);
  for (let i = 0; i < sorted.length - 1; i++) {
    const mid = (sorted[i].yEndPercent + sorted[i + 1].yStartPercent) / 2;
    if (sorted[i].yEndPercent > sorted[i + 1].yStartPercent) {
      sorted[i] = { ...sorted[i], yEndPercent: mid };
      sorted[i + 1] = { ...sorted[i + 1], yStartPercent: mid };
    }
  }
  return sorted;
}

// Правило "не называть ответ" — то же самое ограничение, что и во всём
// остальном сервисе (см. "Что это за проект" в CLAUDE.md), просто здесь
// оно даже строже: в проверке ответ хотя бы существует в тетради и его
// можно сверить, а здесь задание ещё НЕ решено — модели ничего не мешает
// решить его целиком вместо объяснения метода, если явно не запретить.
// export — переиспользуется в lib/openai.ts (explainTaskOpenAI), та же
// причина, что и у DETECT_TASKS_PROMPT/clampTaskBounds выше.
// 28.08.2026: реальный прод-кейс — после того как предыдущий фикс (не
// путать групповую шапку с одним выделенным подпунктом) сработал и
// condition стал верным ("сколько всего листьев у Кати"), подсказка
// всё равно предлагала "составь схему" для простого одношагового
// сложения (11+4) — лишний и запутывающий ребёнка совет, раз сравнивать
// или разбивать на связанные величины тут нечего. Добавлен пункт 4.
export const EXPLAIN_TASK_PROMPT_HEADER = `Ты — добрый учитель начальной школы (1-5 класс). Ребёнок ещё НЕ решил это задание и не понимает, с чего начать. Помоги ему разобраться, но НИ В КОЕМ СЛУЧАЕ не называй готовый ответ/решение этого задания — это критически важное правило, и его нельзя нарушать ни при каких обстоятельствах, даже если задание кажется очень простым.

Твоя подсказка должна:
1. Своими словами, просто и понятно объяснить, что вообще нужно сделать в этом задании.
2. Описать МЕТОД/способ решения по шагам — какое действие/правило применить, на что обратить внимание.
3. По возможности привести ПОХОЖИЙ пример с ДРУГИМИ числами/словами — показать способ на нём, а не на самом задании.
4. Если задание — простое одношаговое действие (например, просто сложить или вычесть два данных числа, без сравнения и без зависимости одной величины от другой) — НЕ предлагай составлять схему/чертёж/рисунок, это только запутает; объясни прямо, какое действие нужно и почему. Предлагай схему только тогда, когда она РЕАЛЬНО помогает разобраться — например, для задач на сравнение ("на сколько больше/меньше"), с несколькими связанными величинами или несколькими действиями подряд.

НЕ решай именно ЭТО задание до конца, НЕ подставляй финальный числовой/текстовый ответ для чисел из условия — только метод и аналогия.`;

// 27.08.2026: раздел "Подсказать" перешёл на ручную рамку выбора области
// вместо авто-детекта заданий моделью (см. CLAUDE.md) — старая логика
// (detectTasksForHint выше, полностью автоматический поиск ВСЕХ заданий)
// оставлена нетронутой в этом файле (используется тем же кодом, что и
// "Выбор задания на фото учебника" в lib/openai.ts, трогать нельзя), но
// components/HintTab.tsx больше не вызывает /api/hint/detect — вместо
// этого ребёнок сам выделяет полосу на фото, и explainTask/explainTaskOpenAI
// получают только координаты, без заранее известного текста условия.
// Поэтому condition/number стали необязательными, а модель, когда condition
// не передан, сама коротко пересказывает, что она видит (см.
// EXPLAIN_TASK_UNKNOWN_CONDITION_NOTE) — старое поведение (condition
// известен заранее) остаётся байт-в-байт таким же, как раньше.
//
// 28.08.2026: реальный прод-кейс — ребёнок выделил рамкой только ОДИН
// подпункт (а) составной задачи ("Прочитай задачи. Чем они похожи и чем
// отличаются? Составь схемы к задачам и реши их. а)... б)..."), но в кадр
// (с паддингом cropImageByPercent) попала и общая инструкция сверху,
// адресованная ОБОИМ подпунктам сразу. Модель пересказала condition как
// "нужно прочитать ДВЕ задачи и сравнить их" (описание всей группы), хотя
// реально видна только ОДНА простая задача — и из-за этого дала лишний,
// не относящийся к делу совет "составь схему сравнения". Раньше
// инструкция говорила только "если видны фрагменты БОЛЕЕ ОДНОГО задания —
// объясняй самое полное/центральное" — этого было недостаточно, потому
// что общая шапка-инструкция это не "другое задание", а именно кажущийся
// релевантным контекст. Добавлено явное уточнение против этой ошибки.
export const EXPLAIN_TASK_UNKNOWN_CONDITION_NOTE = `Ребёнок сам выделил рамкой область на фото — она уже обрезана и прислана тебе как единственное содержимое снимка (по краям иногда виден краешек соседнего задания — не обращай на него внимания). Сначала коротко определи и перескажи своими словами, в чём состоит ИМЕННО ЭТО задание — впиши в поле "condition" ОДНИМ предложением. Пересказывай именно напечатанное/сформулированное условие, а не черновые пометки или попытку решения ребёнка, даже если они тоже видны на фото. Если в кадре есть фрагменты более чем одного задания — объясняй только то, что видно наиболее полно/по центру кадра.

Отдельная и частая ошибка: если в кадре сверху видна ОБЩАЯ инструкция/шапка для НЕСКОЛЬКИХ подпунктов (например "Прочитай задачи. Чем они похожи и чем отличаются? Составь схемы к ним" — относится сразу к пунктам а) и б)), а сама рамка при этом охватывает только ОДИН из этих подпунктов (например только а), без б) — НЕ пересказывай общую шапку так, будто речь о сравнении/нескольких задачах сразу. condition и explanation должны описывать ТОЛЬКО тот один подпункт, что реально виден целиком (его конкретные числа и вопрос), а не групповое задание "сравни/сопоставь", которого целиком в кадре нет.`;

export async function explainTask(
  image: ImageInput,
  task: {
    number?: string;
    condition?: string;
    yStartPercent?: number;
    yEndPercent?: number;
    xStartPercent?: number;
    xEndPercent?: number;
  }
): Promise<{ explanation: string; condition?: string; usage?: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY не задан в переменных окружения сервера');
  }

  // Та же логика, что и в точечной перепроверке: если получилось physически
  // обрезать фото до области этого задания — соседние задания страницы
  // вообще не попадают в кадр, это надёжнее любого текстового уточнения
  // "смотри именно на это задание" (см. историю needs_task_photo/перепроверки
  // в CLAUDE.md). Если обрезка не удалась — fallback на полное фото с явной
  // текстовой пометкой (только когда condition вообще известен — при
  // ручной рамке без текста условия эта пометка не соберётся, полное фото
  // просто уйдёт как есть).
  let focusedImage = image;
  let cropNote = '';
  const hasKnownCondition = !!task.condition;
  if (task.yStartPercent != null && task.yEndPercent != null) {
    // Паддинг 6% (дефолт cropImageByPercent) рассчитан на ГРУБУЮ, оценённую
    // моделью рамку (старый авто-детект) — там он нужен, чтобы не обрезать
    // задание чуть тесновато. Но у ручной рамки (components/CropSelector.tsx)
    // границы уже точно выставлены самим ребёнком — тот же паддинг здесь не
    // подстраховка, а порча: на плотной странице с несколькими заданиями
    // подряд 6% с каждой стороны может утянуть в кадр весь СОСЕДНИЙ пункт,
    // и модель тогда объясняет не то задание (реальный кейс 02.09.2026:
    // выделили задание №4 полностью, получили подсказку по задание №5,
    // которое просто было прижато снизу). Меньший паддинг — та же логика,
    // что уже применяется к X (2%, "ребёнок и так сузил осознанно").
    const yPaddingPercent = hasKnownCondition ? undefined : 2;
    const cropped = await cropImageByPercent(
      image,
      task.yStartPercent,
      task.yEndPercent,
      task.xStartPercent,
      task.xEndPercent,
      yPaddingPercent
    );
    if (cropped) {
      focusedImage = cropped;
    } else if (task.condition) {
      cropNote = ` Смотри именно на задание №${task.number}: "${task.condition}" — на фото есть и другие задания, их не трогай.`;
    }
  }
  const taskLine = hasKnownCondition
    ? `Задание №${task.number}: "${task.condition}"${cropNote}`
    : EXPLAIN_TASK_UNKNOWN_CONDITION_NOTE;
  const responseSchema = hasKnownCondition
    ? `{"explanation": "текст подсказки для ребёнка, 3-5 предложений"}`
    : `{"condition": "коротко, как ты понял задание, одним предложением", "explanation": "текст подсказки для ребёнка, 3-5 предложений"}`;

  const promptText = `${EXPLAIN_TASK_PROMPT_HEADER}

${taskLine}

Ответь строго JSON, без markdown:
${responseSchema}`;

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      temperature: 0.4,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: focusedImage.mediaType, data: focusedImage.base64 }
            },
            { type: 'text', text: promptText }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    console.error('Anthropic API error (explain task):', response.status, bodyText);
    throw new Error(`Ошибка сервиса (${response.status})`);
  }

  const data: ClaudeApiResponse = await response.json();
  if (data.type === 'error' || data.error) {
    console.error('Anthropic API вернул ошибку (explain task):', data.error);
    throw new Error('Сервис временно недоступен, попробуйте ещё раз через минуту');
  }

  const textBlock = (data.content || []).map((b) => b.text || '').join('\n').trim();
  let cleaned = textBlock.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleaned) as { explanation?: string; condition?: string };
  return {
    explanation: parsed.explanation || '',
    condition: hasKnownCondition ? task.condition : parsed.condition,
    usage: data.usage
  };
}
