'use client';

import { useEffect, useRef, useState } from 'react';
import CheckResultView, { CheckTask } from '@/components/CheckResultView';
import { normalizeImageToJpeg } from '@/lib/normalizeImage';
import CropSelector, { CropRange } from '@/components/CropSelector';

type CheckResponse = {
  id: string | null;
  subject: string;
  grade: number | null;
  generalComment: string;
  tasks: CheckTask[];
};

type View =
  | 'idle'
  | 'selecting_solution_region'
  | 'checking'
  | 'results'
  | 'error'
  | 'needs_task_photo'
  | 'photo_mismatch'
  | 'selecting_task_region';

// Диапазон по умолчанию для полосы выделения (см. CLAUDE.md, «Выделение
// области задания при проверке») — сужен, а не во всю страницу (0-100),
// по прямой просьбе владельца: заставляет каждый раз явно выбрать область,
// а не полагаться на то, что "по умолчанию проверится всё" (тот же паттерн,
// что и в components/HintTab.tsx → DEFAULT_CROP).
const DEFAULT_SOLUTION_CROP: CropRange = { yStart: 15, yEnd: 85 };

// 02.09.2026: тот же принцип — теперь и для фото УЧЕБНИКА (сценарий
// needs_task_photo/photo_mismatch), не только для фото решения выше.
// Раньше здесь была модель-детект + клик по подсвеченной области + доп.
// сверка номера (см. большой закомментированный блок в конце файла,
// оставлен нетронутым на случай отката, вместе с нетронутым серверным
// /api/checks/detect-task-photo и /api/checks/verify-task-number — по
// прямому запросу владельца, старый код не удалён). По прямому запросу
// владельца заменено на ручную полосу — тот же компонент CropSelector,
// что и для фото решения.
const DEFAULT_TASK_CROP: CropRange = { yStart: 15, yEnd: 85 };

const LOADING_MESSAGES = [
  'Проверяю примеры…',
  'Считаю в столбик…',
  'Сверяю ответы…',
  'Ищу помарки красной ручкой…'
];

function CheckAnotherZone({ onFile, className }: { onFile: (file: File) => void; className?: string }) {
  return (
    <label
      className={
        'block relative border-2 border-dashed border-[#B9C6D8] bg-accent/[0.07] hover:border-pencilOrange hover:bg-pencilOrange/[0.06] rounded-2xl px-5 py-4 text-center cursor-pointer transition-colors ' +
        (className || '')
      }
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <span className="text-2xl block mb-1">📷</span>
      <p className="font-bold text-base m-0">Проверить ещё одно фото</p>
    </label>
  );
}

export default function PhotoChecker({
  childId,
  header,
  title,
  resultsTitle,
  intro,
  beforeUpload,
  extra,
  nativeUpload,
  nativeUploadDashed,
  nativeUploadCompactSteps = true,
  onViewChange,
  onCheckSaved
}: {
  childId?: string;
  /** Контент шапки (например, eyebrow-строка) — виден во всех состояниях. */
  header?: React.ReactNode;
  /** Заголовок в состояниях idle/checking. */
  title?: string;
  /** Заголовок в состоянии results (если не задан, используется title). */
  resultsTitle?: string;
  /** Контент перед зоной загрузки (например, "как это работает") — виден только в состоянии idle. */
  intro?: React.ReactNode;
  /** Контент МЕЖДУ intro и самой зоной загрузки (например, демо-блок) —
   * виден только в состоянии idle, см. app/(site)/page.tsx. 09.10.2026:
   * по прямому запросу владельца — переставить "Посмотрите, как работает
   * проверка" и "Загрузить фото тетради" местами, но при этом НЕ трогать
   * позицию intro ("Как это работает") и extra ("Пример результата
   * проверки") — раньше это делалось переносом всего <PhotoChecker> ниже
   * демо-блока целиком, что заодно сдвинуло и intro (ошибка, которую
   * владелец заметил и попросил исправить). */
  beforeUpload?: React.ReactNode;
  /** Контент после зоны загрузки (примеры, преимущества и т.д.) — виден только в состоянии idle. */
  extra?: React.ReactNode;
  /** Нативный экран загрузки (круглая кнопка вместо пунктирной зоны) — см. личный кабинет,
   * вкладка «Проверить», и главную страницу (app/(site)/page.tsx). */
  nativeUpload?: boolean;
  /** Пунктирная (а не сплошная) обводка круглой кнопки — только для главной
   * страницы, см. app/(site)/page.tsx. Личный кабинет этот проп не передаёт,
   * обводка там остаётся сплошной зелёной, как и раньше. */
  nativeUploadDashed?: boolean;
  /** Компактный список "1-2-3" прямо над круглой кнопкой (по умолчанию
   * показан, как сегодня в личном кабинете). Главная страница отключает
   * его (`false`), потому что показывает свою, более крупную секцию "Как
   * это работает" через `intro` — иначе шаги дублировались бы дважды. */
  nativeUploadCompactSteps?: boolean;
  onViewChange?: (view: View) => void;
  /** Вызывается, когда проверка сохранена в истории (только для авторизованных — id не null). */
  onCheckSaved?: (check: {
    id: string;
    subject: string;
    grade: number | null;
    generalComment: string;
    createdAt: string;
    tasks: CheckTask[];
  }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [isDragging, setIsDragging] = useState(false);
  // Фото решения запоминаем на случай, если модель попросит второе фото
  // (условие из учебника) — чтобы переотправить оба вместе, не заставляя
  // пользователя загружать первое фото заново.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Полоса выделения области задания на фото решения (см. CLAUDE.md,
  // «Выделение области задания при проверке») — на странице тетради может
  // быть несколько заданий, не все из них нужно проверять сейчас (часть
  // могла быть уже проверена раньше). Обрезка происходит на сервере (см.
  // app/api/checks/route.ts), здесь только координаты полосы.
  const [selectingSolutionRegion, setSelectingSolutionRegion] = useState(false);
  const [solutionCropRange, setSolutionCropRange] = useState<CropRange>(DEFAULT_SOLUTION_CROP);
  const [solutionRegion, setSolutionRegion] = useState<{ yStartPercent: number; yEndPercent: number } | null>(
    null
  );
  const [needsTaskPhoto, setNeedsTaskPhoto] = useState(false);
  const [taskPhotoReason, setTaskPhotoReason] = useState('');
  // Реальный прод-кейс: приложенное фото условия оказалось от СОВСЕМ
  // другого задания — сервис теперь явно предупреждает вместо того, чтобы
  // молча пытаться сопоставить и выдать бессмысленную ошибку (см.
  // CheckResult.photo_mismatch в lib/claude.ts).
  const [photoMismatch, setPhotoMismatch] = useState(false);
  const [photoMismatchReason, setPhotoMismatchReason] = useState('');
  // Полоса выделения области задания на фото УЧЕБНИКА (см. CLAUDE.md,
  // «Выделение области задания при проверке») — тот же принцип, что и
  // solutionCropRange выше, просто для второго фото (условие).
  const [taskPhotoPreviewUrl, setTaskPhotoPreviewUrl] = useState<string | null>(null);
  const [pendingTaskFile, setPendingTaskFile] = useState<File | null>(null);
  const [selectingTaskRegion, setSelectingTaskRegion] = useState(false);
  const [taskCropRange, setTaskCropRange] = useState<CropRange>(DEFAULT_TASK_CROP);
  const inputRef = useRef<HTMLInputElement>(null);

  const view: View = loading
    ? 'checking'
    : selectingSolutionRegion
    ? 'selecting_solution_region'
    : selectingTaskRegion
    ? 'selecting_task_region'
    : error
    ? 'error'
    : needsTaskPhoto
    ? 'needs_task_photo'
    : photoMismatch
    ? 'photo_mismatch'
    : result
    ? 'results'
    : 'idle';

  useEffect(() => {
    onViewChange?.(view);
    // onViewChange намеренно не в зависимостях — иначе новый инлайн-колбэк
    // от родителя на каждый рендер вызывал бы этот эффект заново.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (!loading) return;
    let i = 0;
    setLoadingMessage(LOADING_MESSAGES[0]);
    const timer = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[i]);
    }, 1800);
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(
    mainFile: File,
    taskFile?: File,
    solutionRegionParam?: { yStartPercent: number; yEndPercent: number },
    taskRegion?: { yStartPercent: number; yEndPercent: number }
  ) {
    setLoading(true);
    setError(null);
    setResult(null);
    setNeedsTaskPhoto(false);
    setPhotoMismatch(false);

    const formData = new FormData();
    formData.append('photo', mainFile);
    if (taskFile) formData.append('taskPhoto', taskFile);
    if (solutionRegionParam) formData.append('solutionRegion', JSON.stringify(solutionRegionParam));
    if (taskRegion) formData.append('taskRegion', JSON.stringify(taskRegion));
    if (childId) formData.append('childId', childId);

    try {
      let res: Response;
      try {
        res = await fetch('/api/checks', { method: 'POST', body: formData });
      } catch (networkErr) {
        // Сам fetch() бросил исключение ДО получения ответа — обрыв сети,
        // потеря сигнала на мобильном интернете и т.п. Браузер (особенно
        // iOS Safari) даёт здесь сырое техническое сообщение ("Load
        // failed", "Failed to fetch") — ловим именно эту ошибку отдельно
        // и подменяем на дружелюбный текст, до того как она попадёт в
        // общий catch ниже и уйдёт в setError как есть.
        console.error('Сетевая ошибка при отправке фото на проверку:', networkErr);
        throw new Error('Не удалось отправить фото — проверьте интернет-соединение и попробуйте ещё раз');
      }
      const bodyText = await res.text();
      let data: any;
      try {
        data = JSON.parse(bodyText);
      } catch {
        // Не наш JSON-ответ — например, страница таймаута/ошибки от
        // хостинга при слишком долгой обработке. Не показываем сырой
        // текст пользователю, только дружелюбное сообщение.
        console.error('Не удалось разобрать ответ /api/checks:', bodyText.slice(0, 500));
        throw new Error('Проверка заняла слишком много времени, попробуйте ещё раз');
      }
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось проверить фото');
      }
      if (data.needsTaskPhoto) {
        setNeedsTaskPhoto(true);
        setTaskPhotoReason(data.reason || '');
        return;
      }
      if (data.photoMismatch) {
        setPhotoMismatch(true);
        setPhotoMismatchReason(data.reason || '');
        return;
      }
      setResult(data);
      if (data.id) {
        onCheckSaved?.({
          id: data.id,
          subject: data.subject,
          grade: data.grade,
          generalComment: data.generalComment,
          createdAt: data.createdAt,
          tasks: data.tasks || []
        });
      }
    } catch (err: any) {
      setError(err.message || 'Что-то пошло не так');
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setSelectingSolutionRegion(true); // сразу, до перекодировки — чтобы не мигало состояние idle
    const normalized = await normalizeImageToJpeg(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(normalized));
    setPendingFile(normalized);
    setSolutionCropRange(DEFAULT_SOLUTION_CROP);
  }

  async function confirmSolutionRegion() {
    if (!pendingFile) return;
    const region = {
      yStartPercent: Math.round(solutionCropRange.yStart),
      yEndPercent: Math.round(solutionCropRange.yEnd)
    };
    setSolutionRegion(region);
    setSelectingSolutionRegion(false);
    await submit(pendingFile, undefined, region);
  }

  async function handleTaskPhoto(file: File) {
    if (!pendingFile) return;
    setError(null);
    setSelectingTaskRegion(true); // сразу, до перекодировки — чтобы не мигало состояние
    const normalized = await normalizeImageToJpeg(file);
    if (taskPhotoPreviewUrl) URL.revokeObjectURL(taskPhotoPreviewUrl);
    setTaskPhotoPreviewUrl(URL.createObjectURL(normalized));
    setPendingTaskFile(normalized);
    setTaskCropRange(DEFAULT_TASK_CROP);
  }

  async function confirmTaskRegion() {
    if (!pendingFile || !pendingTaskFile) return;
    const region = {
      yStartPercent: Math.round(taskCropRange.yStart),
      yEndPercent: Math.round(taskCropRange.yEnd)
    };
    setSelectingTaskRegion(false);
    await submit(pendingFile, pendingTaskFile, solutionRegion || undefined, region);
  }

  // Возврат к загрузке ДРУГОГО фото учебника — решение остаётся, сбрасывается
  // только всё, что относится к уже загруженному фото учебника.
  function resetTaskPhotoOnly() {
    if (taskPhotoPreviewUrl) URL.revokeObjectURL(taskPhotoPreviewUrl);
    setTaskPhotoPreviewUrl(null);
    setPendingTaskFile(null);
    setSelectingTaskRegion(false);
    setTaskCropRange(DEFAULT_TASK_CROP);
  }

  function resetToUpload() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (taskPhotoPreviewUrl) URL.revokeObjectURL(taskPhotoPreviewUrl);
    setTaskPhotoPreviewUrl(null);
    setResult(null);
    setError(null);
    setNeedsTaskPhoto(false);
    setPhotoMismatch(false);
    setSelectingTaskRegion(false);
    setTaskCropRange(DEFAULT_TASK_CROP);
    setPendingTaskFile(null);
    setPendingFile(null);
    setSelectingSolutionRegion(false);
    setSolutionCropRange(DEFAULT_SOLUTION_CROP);
    setSolutionRegion(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      {/* На экранах выделения полосы (и для фото решения, и для фото
          учебника) шапка с списком предметов отнимает вертикальное
          пространство и сдвигает кнопку "Проверить" ниже видимой области
          экрана — на реальном телефоне её было плохо видно без прокрутки. */}
      {view !== 'selecting_solution_region' && view !== 'selecting_task_region' && header}
      {(view === 'idle' || view === 'checking') && title && (
        <h1 className="font-heading font-semibold text-2xl text-ink text-center mb-4">{title}</h1>
      )}
      {view === 'results' && (resultsTitle || title) && (
        <h1 className="font-heading font-semibold text-2xl text-ink text-center mb-4">
          {resultsTitle || title}
        </h1>
      )}

      {view === 'idle' && intro}
      {view === 'idle' && beforeUpload}

      {/* Нативный экран загрузки — круглая кнопка вместо пунктирной зоны, без
          обёртки в белую карточку (фон вкладки уже бежевый, как и в
          "Подсказать"/"Профиль"). Перетаскивание файла (drag&drop, десктоп)
          сохранено на самой кнопке — те же обработчики, что были у старой
          пунктирной зоны. Шаги (1-2-3) сразу над кнопкой одной группой
          (не растянуты по всей высоте) — владелец попросил придвинуть их
          к кнопке. Группа (шаги+кнопка+подпись) прижата к верху
          оставшейся высоты (justify-start, не justify-center) — владелец
          попросил поднять её выше, а не держать по центру экрана;
          tip-карточка остаётся внизу. Резерв высоты 58vh рассчитан на
          личный кабинет, где этот блок — единственное содержимое вкладки;
          на главной странице (nativeUploadCompactSteps=false) вокруг уже
          есть другой контент (шаги, пример), и такой отступ создавал
          неоправданно большой пустой промежуток — там резерв убирается. */}
      {view === 'idle' && nativeUpload && (
        <div className={'flex flex-col' + (nativeUploadCompactSteps ? ' min-h-[58vh]' : '')}>
          <div className="flex-1 flex flex-col items-center justify-start">
            {nativeUploadCompactSteps && (
              <div className="flex flex-col gap-3 text-left mb-6 w-full">
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 w-[22px] h-[22px] rounded-full bg-white border border-gridLine text-inkSoft font-mono text-[11px] font-bold flex items-center justify-center">
                    1
                  </span>
                  <p className="text-sm text-inkSoft m-0">Сфотографируйте выполненное задание</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 w-[22px] h-[22px] rounded-full bg-white border border-gridLine text-inkSoft font-mono text-[11px] font-bold flex items-center justify-center">
                    2
                  </span>
                  <p className="text-sm text-inkSoft m-0">Сервис автоматически проверит его</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 w-[22px] h-[22px] rounded-full bg-white border border-gridLine text-inkSoft font-mono text-[11px] font-bold flex items-center justify-center">
                    3
                  </span>
                  <p className="text-sm text-inkSoft m-0">
                    Покажем ошибки и подскажем, как исправить, но не дадим готовый ответ
                  </p>
                </div>
              </div>
            )}

            <label
              className={
                'w-32 h-32 rounded-full bg-white flex flex-col items-center justify-center gap-1 shadow-[0_16px_30px_-12px_rgba(46,158,99,0.55)] cursor-pointer transition-colors mb-4 ' +
                (isDragging
                  ? 'border-[5px] border-pencilOrange'
                  : nativeUploadDashed
                  ? 'border-[6px] border-dashed border-greenCheck'
                  : 'border-[5px] border-greenCheck')
              }
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={onDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 8h2.6l1-2h8.8l1 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
                  stroke="#2E9E63"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="13.5" r="3.4" stroke="#2E9E63" strokeWidth="1.8" />
              </svg>
              <span className="font-extrabold text-base text-greenCheck">Нажмите</span>
            </label>
            <p className="text-center text-sm text-inkSoft max-w-[26ch] mx-auto mb-8">
              Сфотографируйте тетрадь или выберите фото из галереи
            </p>
          </div>

          <div className="flex gap-2.5 items-start bg-greenSoft rounded-2xl px-4 py-3.5 text-left mb-10">
            <span className="shrink-0 mt-0.5" aria-hidden="true">
              💡
            </span>
            <p className="text-[13px] leading-relaxed text-ink m-0">
              Фотографируйте страницу целиком, при хорошем освещении — так почерк читается точнее
            </p>
          </div>
        </div>
      )}

      {/* 09.10.2026: по прямому запросу владельца — extra ("Пример
          результата проверки") переставлен ВЫШЕ самой зоны загрузки
          ("Загрузить фото тетради"). extra по-прежнему показывается
          только в состоянии idle — во время "checking" (спиннер в блоке
          ниже) ничего не меняется, он и раньше не показывался тогда. */}
      {view === 'idle' && extra}

      {((view === 'idle' && !nativeUpload) || view === 'checking') && (
        <div
          // 07.09.2026: для idle-состояния (главная страница для
          // неавторизованных, см. app/(site)/page.tsx) внешняя карточка
          // убрана — сама пунктирная зона ниже теперь несёт полное
          // оформление (белый фон, обводка, тень), обёртка в ещё одну
          // белую карточку поверх нее давала бы двойную рамку.
          // max-w-[620px] mx-auto — та же ширина, что и у списка шагов
          // "Как это работает" (intro на главной), чтобы на десктопе левый
          // край зоны загрузки начинался вертикально там же, где кружки
          // 1-4, а не был шире всей доступной ширины <main>. mb-10 вместо
          // mb-5 — по просьбе владельца, больше воздуха снизу зоны загрузки
          // (09.10.2026: extra теперь рендерится ВЫШЕ, не ниже этого блока
          // — отступ оставлен как есть, он по-прежнему уместен).
          className={
            view === 'idle'
              ? 'max-w-[620px] mx-auto mb-10'
              : view === 'checking' && nativeUpload
              ? 'mb-5'
              : 'bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5'
          }
        >
          {view === 'idle' && (
            <label
              className={
                'block relative border-2 border-dashed rounded-3xl px-5 py-9 text-center cursor-pointer transition-colors bg-white shadow-[0_16px_34px_-18px_rgba(46,158,99,0.35)] ' +
                (isDragging
                  ? 'border-pencilOrange bg-pencilOrange/10'
                  : 'border-greenCheck/60 hover:border-greenCheck hover:bg-greenSoft/40')
              }
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={onDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <span
                aria-hidden="true"
                className="mx-auto mb-3 w-14 h-14 rounded-full bg-greenSoft flex items-center justify-center"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 8h2.6l1-2h8.8l1 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
                    stroke="#2E9E63"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="13.5" r="3.4" stroke="#2E9E63" strokeWidth="1.8" />
                </svg>
              </span>
              <p className="font-extrabold text-base text-ink mb-1">Загрузить фото тетради</p>
              <p className="text-sm text-inkSoft hidden sm:block">
                Выберите фотографию из папки или перетащите фотографию сюда
              </p>
              <p className="text-sm text-inkSoft sm:hidden">
                Нажмите, чтобы сделать фотографию или выбрать фото из медиатеки
              </p>
            </label>
          )}

          {view === 'checking' && (
            <div className="flex items-center justify-center gap-3 py-6 text-inkSoft font-bold">
              <span
                className="w-[22px] h-[22px] rounded-full border-[3px] border-gridLine border-t-pencilOrange animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span>{loadingMessage}</span>
            </div>
          )}
        </div>
      )}

      {view === 'selecting_solution_region' && (
        <div className="-mt-6 mb-5">
          {!previewUrl ? (
            <div className="flex items-center justify-center gap-3 py-6 text-inkSoft font-bold">
              <span
                className="w-[22px] h-[22px] rounded-full border-[3px] border-gridLine border-t-pencilOrange animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span>Загружаю фото…</span>
            </div>
          ) : (
            <>
              <p className="font-heading font-bold text-lg text-ink mb-1 text-center">Выделите нужное задание</p>
              <p className="text-sm text-inkSoft mb-3 text-center">
                Потяните полосы, чтобы выделить задание, которое нужно проверить
              </p>

              <CropSelector imageUrl={previewUrl} value={solutionCropRange} onChange={setSolutionCropRange} />

              <button
                type="button"
                onClick={confirmSolutionRegion}
                className="w-full mt-4 bg-greenCheck text-white font-extrabold text-base rounded-full px-5 py-3 shadow-[0_6px_16px_rgba(46,158,99,0.4)]"
              >
                Проверить
              </button>
              <label className="block w-full mt-2 bg-white border border-ink/15 text-ink font-bold text-sm rounded-full px-5 py-2.5 shadow-sm text-center cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      resetToUpload();
                      handleFile(file);
                    }
                  }}
                />
                Загрузить другое фото
              </label>
            </>
          )}
        </div>
      )}

      {view === 'needs_task_photo' && (
        <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
          {previewUrl && (
            <div className="text-center mb-4">
              <img
                src={previewUrl}
                alt="Фото решения из тетради"
                className="inline-block max-w-full max-h-[160px] rounded border-4 border-white shadow-lg shadow-ink/10 rotate-[-1.2deg]"
              />
            </div>
          )}
          <div className="bg-pencilOrange/10 text-ink rounded-xl px-4 py-3.5 text-[14.5px] leading-relaxed mb-4">
            {taskPhotoReason ||
              'Не получилось понять условие задания по этому фото. Приложите ещё одно фото — страничку учебника, где написано задание.'}
          </div>
          <label className="block relative border-2 border-dashed border-[#B9C6D8] bg-accent/[0.07] hover:border-pencilOrange hover:bg-pencilOrange/[0.06] rounded-2xl px-5 py-4 text-center cursor-pointer transition-colors">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleTaskPhoto(file);
              }}
            />
            <span className="text-2xl block mb-1">📖</span>
            <p className="font-bold text-base mb-1">Загрузить фото странички учебника</p>
            <p className="text-sm text-inkSoft m-0">С условием задания, которое решали в тетради</p>
          </label>
          <label className="block w-full mt-4 text-inkSoft text-sm underline text-center cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  resetToUpload();
                  handleFile(file);
                }
              }}
            />
            Загрузить другое фото решения
          </label>
        </div>
      )}

      {view === 'photo_mismatch' && (
        <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
          {previewUrl && (
            <div className="text-center mb-4">
              <img
                src={previewUrl}
                alt="Фото решения из тетради"
                className="inline-block max-w-full max-h-[160px] rounded border-4 border-white shadow-lg shadow-ink/10 rotate-[-1.2deg]"
              />
            </div>
          )}
          <div className="bg-pencilOrange/10 text-ink rounded-xl px-4 py-3.5 text-[14.5px] leading-relaxed mb-4">
            {photoMismatchReason ||
              'Похоже, второе фото не относится к этому решению. Приложите страничку учебника именно с тем заданием, которое решали в тетради.'}
          </div>
          <label className="block relative border-2 border-dashed border-[#B9C6D8] bg-accent/[0.07] hover:border-pencilOrange hover:bg-pencilOrange/[0.06] rounded-2xl px-5 py-4 text-center cursor-pointer transition-colors">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleTaskPhoto(file);
              }}
            />
            <span className="text-2xl block mb-1">📖</span>
            <p className="font-bold text-base mb-1">Загрузить другое фото странички учебника</p>
            <p className="text-sm text-inkSoft m-0">С условием именно того задания, которое решали в тетради</p>
          </label>
          <label className="block w-full mt-4 text-inkSoft text-sm underline text-center cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  resetToUpload();
                  handleFile(file);
                }
              }}
            />
            Загрузить другое фото решения
          </label>
        </div>
      )}

      {view === 'selecting_task_region' && taskPhotoPreviewUrl && (
        <div className="-mt-6 mb-5">
          <p className="font-heading font-bold text-lg text-ink mb-1 text-center">Выделите нужное задание</p>
          <p className="text-sm text-inkSoft mb-3 text-center">
            На странице учебника может быть несколько заданий — подвиньте полосу и потяните за её края, чтобы
            выделить то, которое решали в тетради
          </p>

          <CropSelector imageUrl={taskPhotoPreviewUrl} value={taskCropRange} onChange={setTaskCropRange} />

          <button
            type="button"
            onClick={confirmTaskRegion}
            className="w-full mt-4 bg-greenCheck text-white font-extrabold text-base rounded-full px-5 py-3 shadow-[0_6px_16px_rgba(46,158,99,0.4)]"
          >
            Проверить
          </button>
          <label className="block relative border-2 border-dashed border-[#B9C6D8] bg-accent/[0.07] hover:border-pencilOrange hover:bg-pencilOrange/[0.06] rounded-2xl px-5 py-4 text-center cursor-pointer transition-colors mt-2">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  resetTaskPhotoOnly();
                  handleTaskPhoto(file);
                }
              }}
            />
            <span className="text-2xl block mb-1">📖</span>
            <p className="font-bold text-base mb-1 m-0">Загрузить другое фото странички учебника</p>
          </label>
          <label className="block w-full mt-2 bg-white border border-ink/15 text-ink font-bold text-sm rounded-full px-5 py-2.5 shadow-sm text-center cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  resetToUpload();
                  handleFile(file);
                }
              }}
            />
            Загрузить другое фото решения
          </label>
        </div>
      )}

      {view === 'error' && (
        <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
          <div className="bg-redPenSoft text-[#7A1E29] rounded-xl px-4 py-3.5 text-[14.5px] leading-relaxed">
            {error}
          </div>
          <div className="flex justify-center gap-2.5 mt-3.5 flex-wrap">
            <button
              onClick={() => inputRef.current?.click()}
              className="bg-greenCheck text-white font-extrabold text-[15px] rounded-[10px] px-5 py-3 shadow-[0_6px_14px_rgba(46,158,99,0.3)]"
            >
              Попробовать снова
            </button>
            <label className="inline-flex items-center justify-center text-inkSoft font-extrabold text-[15px] rounded-[10px] px-5 py-3 border-[1.5px] border-[#C7D3E0] cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    resetToUpload();
                    handleFile(file);
                  }
                }}
              />
              Загрузить другое фото
            </label>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {view === 'results' && result && (
        <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
          {previewUrl && (
            <div className="text-center mb-4">
              <img
                src={previewUrl}
                alt="Проверенное фото домашнего задания"
                className="inline-block max-w-full max-h-[220px] rounded border-4 border-white shadow-lg shadow-ink/10 rotate-[-1.2deg]"
              />
            </div>
          )}

          <CheckResultView
            grade={result.grade}
            generalComment={result.generalComment}
            tasks={result.tasks}
            afterSummary={
              <CheckAnotherZone
                onFile={(file) => {
                  resetToUpload();
                  handleFile(file);
                }}
                className="mb-5"
              />
            }
          />

          <CheckAnotherZone
            onFile={(file) => {
              resetToUpload();
              handleFile(file);
            }}
            className="mt-4"
          />
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
   СТАРАЯ РЕАЛИЗАЦИЯ (авто-определение задания на фото учебника моделью +
   доп. сверка номера) — закомментировано 02.09.2026 по прямому запросу
   владельца, тот же принцип, что уже применялся в components/HintTab.tsx
   ("Подсказать": ручная рамка вместо авто-детекта, 27.08.2026). Заменено
   на ручную полосу-выделение (components/CropSelector.tsx), тот же паттерн,
   что и у solutionCropRange выше — тем же днём добавленного для фото
   РЕШЕНИЯ (см. CLAUDE.md, «Выделение области задания при проверке»).

   Серверная часть НЕ трогалась — app/api/checks/detect-task-photo/route.ts
   (lib/openai.ts → detectTasksOnTaskPhoto, тот же детект использует ЕЩЁ и
   tryTextbookIndexCheck — трогать нельзя) и app/api/checks/verify-task-number/
   route.ts (lib/openai.ts → detectSolutionTaskNumber) остались полностью
   рабочими, просто клиент их больше не вызывает.

   Чтобы вернуть старое поведение:
   1. Добавить в View: 'detecting_task_photo' | 'selecting_task_photo' |
      'verifying_task_number' | 'task_number_mismatch' | 'task_photo_not_found'
      (вместо/вместе с 'selecting_task_region').
   2. Вернуть тип TaskPhotoCandidate и состояния detectingTaskPhoto/
      taskPhotoCandidates/verifyingTaskNumber/taskNumberWarning/
      pendingTaskRegion/taskPhotoNotFound (ниже).
   3. Заменить активные handleTaskPhoto/confirmTaskRegion на handleTaskPhoto/
      confirmTaskPhotoNotFound/selectTaskPhotoRegion/confirmTaskNumberWarning
      из этого комментария.
   4. Вернуть 5 JSX-вьюх ('detecting_task_photo'..'task_photo_not_found') из
      этого комментария на место текущей 'selecting_task_region'.
   5. resetTaskPhotoOnly/resetToUpload — добавить сброс вернувшихся состояний.
   Ничего откатывать на сервере не нужно — там всё как было.

// Найденное на фото учебника задание (номер + координаты) — тот же формат,
// что и в components/HintTab.tsx (детект заданий там же, только для другого
// сценария). См. CLAUDE.md, «Выбор задания на фото учебника».
type TaskPhotoCandidate = { number: string; condition: string; yStartPercent: number; yEndPercent: number };

// добавить в состояния компонента:
// Выбор конкретного задания на фото учебника (см. CLAUDE.md, «Выбор
// задания на фото учебника») — вместо того чтобы модель сама угадывала
// соответствие решения и условия на многозадачной странице (ненадёжно,
// см. историю про photo_mismatch), пользователь указывает нужное сам.
const [detectingTaskPhoto, setDetectingTaskPhoto] = useState(false);
const [taskPhotoCandidates, setTaskPhotoCandidates] = useState<TaskPhotoCandidate[] | null>(null);
// Механическая сверка номера задания (см. CLAUDE.md, «Сверка номера
// задания») — доп. защита ПОСЛЕ того, как пользователь уже выбрал/
// подтвердил задание на фото учебника: вдруг ребёнок подтвердил не то
// не глядя. Срабатывает, если номера явно разошлись ИЛИ номер в решении
// не удалось прочитать вообще — в обоих случаях просим подтверждения.
const [verifyingTaskNumber, setVerifyingTaskNumber] = useState(false);
const [taskNumberWarning, setTaskNumberWarning] = useState<string | null>(null);
const [pendingTaskRegion, setPendingTaskRegion] = useState<{ yStartPercent: number; yEndPercent: number } | null>(null);
// 19.08.2026: реальный прод-кейс — раньше "детект не нашёл заданий"
// (даже после ретрая на битый JSON, см. lib/openai.ts) молча
// отправляло фото учебника целиком, без единого подтверждения — вся
// защита (и выбор задания, и сверка номера) в этом случае выключалась.
// Теперь вместо тихой отправки — явное подтверждение, тот же принцип,
// что и у task_number_mismatch выше.
const [taskPhotoNotFound, setTaskPhotoNotFound] = useState(false);

// добавить в вычисление view (перед error):
// : detectingTaskPhoto
// ? 'detecting_task_photo'
// : verifyingTaskNumber
// ? 'verifying_task_number'
// : taskNumberWarning
// ? 'task_number_mismatch'
// : taskPhotoNotFound
// ? 'task_photo_not_found'
// : taskPhotoCandidates && taskPhotoCandidates.length > 0
// ? 'selecting_task_photo'

async function handleTaskPhoto(file: File) {
  if (!pendingFile) return;
  setError(null);
  setDetectingTaskPhoto(true);
  const normalized = await normalizeImageToJpeg(file);
  if (taskPhotoPreviewUrl) URL.revokeObjectURL(taskPhotoPreviewUrl);
  setTaskPhotoPreviewUrl(URL.createObjectURL(normalized));
  setPendingTaskFile(normalized);

  // Ищем задания на фото учебника, чтобы дать выбрать нужное вручную —
  // best-effort, любой сбой просто отправляет фото целиком, как раньше
  // (см. app/api/checks/detect-task-photo/route.ts).
  let candidates: TaskPhotoCandidate[] = [];
  try {
    const detectFormData = new FormData();
    detectFormData.append('taskPhoto', normalized);
    const res = await fetch('/api/checks/detect-task-photo', { method: 'POST', body: detectFormData });
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data.tasks)) candidates = data.tasks;
  } catch {
    // Сеть недоступна и т.п. — просто пропускаем выбор.
  }

  setDetectingTaskPhoto(false);

  // 18.08.2026: реальный прод-кейс — при РОВНО одном найденном задании
  // экран выбора раньше пропускался автоматически, и если это задание
  // оказывалось не тем (пользователь по ошибке/специально приложил фото
  // совсем другого, но одного-единственного задания), защититься было
  // нечем — photo_mismatch в этом конкретном прогоне не сработал и
  // модель выдала бессмысленный "верный" результат. Теперь подтверждение
  // показывается ВСЕГДА при 1+ найденных заданиях — пользователь видит,
  // какое именно задание нашлось, и сам решает, то ли это. Экран
  // пропускается только если заданий не нашлось вообще (детект не
  // справился) — тогда защититься нечем в любом случае, отправляем как
  // есть, как и раньше.
  if (candidates.length > 0) {
    setTaskPhotoCandidates(candidates);
    return;
  }

  // 19.08.2026: реальный прод-кейс — раньше здесь была тихая отправка
  // фото целиком (0 найденных заданий даже после ретрая на битый JSON
  // в lib/openai.ts — то есть детект правда не справился, а не просто
  // споткнулся на формате ответа). Молчаливая отправка выключала ВСЮ
  // защиту сразу — теперь вместо этого явное подтверждение.
  setTaskPhotoNotFound(true);
}

async function confirmTaskPhotoNotFound() {
  if (!pendingFile || !pendingTaskFile) return;
  setTaskPhotoNotFound(false);
  await submit(pendingFile, pendingTaskFile, solutionRegion || undefined);
}

async function selectTaskPhotoRegion(task: TaskPhotoCandidate) {
  if (!pendingFile || !pendingTaskFile) return;
  setTaskPhotoCandidates(null);
  const region = { yStartPercent: task.yStartPercent, yEndPercent: task.yEndPercent };

  // 19.08.2026: реальный прод-кейс — пользователь может подтвердить уже
  // неверно выбранное задание не глядя, и дальше единственной защитой
  // оставался ненадёжный photo_mismatch (0 из 3 в контрольном тесте).
  // Механическая сверка номера — доп. проверка ПЕРЕД отправкой: сверяем
  // номер выбранного задания (известен точно, с фото учебника) с
  // номером, который ребёнок мог написать в начале решения. Best-effort:
  // сбой сети/API просто пропускает эту проверку, как и детект заданий.
  setVerifyingTaskNumber(true);
  let mismatchReason: string | null = null;
  try {
    const formData = new FormData();
    formData.append('photo', pendingFile);
    formData.append('taskNumber', task.number);
    const res = await fetch('/api/checks/verify-task-number', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (data?.matches === false) {
      mismatchReason = `В тетради с решением написан номер «${data.solutionNumber}», а вы выбрали задание №${task.number} на фото учебника — это точно то самое задание?`;
    } else if (data?.matches === null) {
      mismatchReason = `Не получилось найти номер задания в тетради с решением, чтобы сверить с выбранным заданием №${task.number} — это точно то самое задание?`;
    }
  } catch {
    // Сеть недоступна и т.п. — пропускаем сверку, отправляем как есть.
  }
  setVerifyingTaskNumber(false);

  if (mismatchReason) {
    setTaskNumberWarning(mismatchReason);
    setPendingTaskRegion(region);
    return;
  }

  await submit(pendingFile, pendingTaskFile, solutionRegion || undefined, region);
}

async function confirmTaskNumberWarning() {
  if (!pendingFile || !pendingTaskFile || !pendingTaskRegion) return;
  setTaskNumberWarning(null);
  await submit(pendingFile, pendingTaskFile, solutionRegion || undefined, pendingTaskRegion);
}

{view === 'detecting_task_photo' && (
  <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
    <div className="flex items-center justify-center gap-3 py-6 text-inkSoft font-bold">
      <span
        className="w-[22px] h-[22px] rounded-full border-[3px] border-gridLine border-t-pencilOrange animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span>Ищу задания на фото учебника…</span>
    </div>
  </div>
)}

{view === 'selecting_task_photo' && taskPhotoPreviewUrl && (
  <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
    <p className="font-heading font-bold text-lg text-ink mb-1.5 text-center">Какое задание проверить?</p>
    <p className="text-sm text-inkSoft mb-4 text-center">
      {taskPhotoCandidates && taskPhotoCandidates.length > 1
        ? 'На фото учебника несколько заданий — нажмите на то, которое решали в тетради'
        : 'Подтвердите, что это то самое задание, которое решали в тетради — нажмите на него'}
    </p>

    <div className="relative inline-block w-full rounded-2xl overflow-hidden border border-ink/10 shadow-sm">
      при восстановлении вернуть сюда JSX-комментарий eslint-disable-next-line для правила next/next no-img-element
      <img src={taskPhotoPreviewUrl} alt="Фото странички учебника" className="w-full h-auto block" />
      {taskPhotoCandidates?.map((t, i) => (
        <button
          key={`${t.number}-${i}`}
          type="button"
          onClick={() => selectTaskPhotoRegion(t)}
          className="absolute left-0 right-0 border-2 border-pencilOrange bg-pencilOrange/20 hover:bg-pencilOrange/35 active:bg-pencilOrange/45 transition-colors flex items-start p-1"
          style={{
            top: `${Math.max(t.yStartPercent, 0)}%`,
            height: `${Math.max(t.yEndPercent - t.yStartPercent, 4)}%`
          }}
        >
          <span className="bg-pencilOrange text-white text-[11px] font-bold rounded-full min-w-5 h-5 px-1 flex items-center justify-center shrink-0">
            {t.number}
          </span>
        </button>
      ))}
    </div>

    <button type="button" onClick={resetToUpload} className="w-full mt-4 text-inkSoft text-sm underline">
      Загрузить другое фото решения
    </button>
  </div>
)}

{view === 'verifying_task_number' && (
  <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
    <div className="flex items-center justify-center gap-3 py-6 text-inkSoft font-bold">
      <span
        className="w-[22px] h-[22px] rounded-full border-[3px] border-gridLine border-t-pencilOrange animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span>Сверяю номер задания…</span>
    </div>
  </div>
)}

{view === 'task_number_mismatch' && (
  <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
    {taskPhotoPreviewUrl && (
      <div className="text-center mb-4">
        <img
          src={taskPhotoPreviewUrl}
          alt="Фото странички учебника"
          className="inline-block max-w-full max-h-[160px] rounded border-4 border-white shadow-lg shadow-ink/10 rotate-[-1.2deg]"
        />
      </div>
    )}
    <div className="bg-pencilOrange/10 text-ink rounded-xl px-4 py-3.5 text-[14.5px] leading-relaxed mb-4">
      {taskNumberWarning}
    </div>
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={confirmTaskNumberWarning}
        className="w-full bg-greenCheck text-white font-extrabold text-[15px] rounded-[10px] px-5 py-3 shadow-[0_6px_14px_rgba(46,158,99,0.3)]"
      >
        Да, всё верно — проверить
      </button>
      <label className="block relative border-2 border-dashed border-[#B9C6D8] bg-accent/[0.07] hover:border-pencilOrange hover:bg-pencilOrange/[0.06] rounded-2xl px-5 py-4 text-center cursor-pointer transition-colors">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              resetTaskPhotoOnly();
              handleTaskPhoto(file);
            }
          }}
        />
        <span className="text-2xl block mb-1">📖</span>
        <p className="font-bold text-base mb-1">Загрузить другое фото странички учебника</p>
        <p className="text-sm text-inkSoft m-0">С условием именно того задания, которое решали в тетради</p>
      </label>
    </div>
    <button type="button" onClick={resetToUpload} className="w-full mt-4 text-inkSoft text-sm underline">
      Загрузить другое фото решения
    </button>
  </div>
)}

{view === 'task_photo_not_found' && (
  <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
    {taskPhotoPreviewUrl && (
      <div className="text-center mb-4">
        <img
          src={taskPhotoPreviewUrl}
          alt="Фото странички учебника"
          className="inline-block max-w-full max-h-[160px] rounded border-4 border-white shadow-lg shadow-ink/10 rotate-[-1.2deg]"
        />
      </div>
    )}
    <div className="bg-pencilOrange/10 text-ink rounded-xl px-4 py-3.5 text-[14.5px] leading-relaxed mb-4">
      Не удалось найти задание на этом фото — точно это страничка учебника с условием того задания, которое решали в тетради?
    </div>
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={confirmTaskPhotoNotFound}
        className="w-full bg-greenCheck text-white font-extrabold text-[15px] rounded-[10px] px-5 py-3 shadow-[0_6px_14px_rgba(46,158,99,0.3)]"
      >
        Да, всё верно — проверить
      </button>
      <label className="block relative border-2 border-dashed border-[#B9C6D8] bg-accent/[0.07] hover:border-pencilOrange hover:bg-pencilOrange/[0.06] rounded-2xl px-5 py-4 text-center cursor-pointer transition-colors">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              resetTaskPhotoOnly();
              handleTaskPhoto(file);
            }
          }}
        />
        <span className="text-2xl block mb-1">📖</span>
        <p className="font-bold text-base mb-1">Загрузить другое фото странички учебника</p>
        <p className="text-sm text-inkSoft m-0">С условием именно того задания, которое решали в тетради</p>
      </label>
    </div>
    <button type="button" onClick={resetToUpload} className="w-full mt-4 text-inkSoft text-sm underline">
      Загрузить другое фото решения
    </button>
  </div>
)}
   =========================================================================== */
