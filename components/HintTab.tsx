'use client';

import { useEffect, useRef, useState } from 'react';
import { normalizeImageToJpeg } from '@/lib/normalizeImage';
import { useSpeech } from '@/lib/useSpeech';
import CropSelector, { CropRange } from '@/components/CropSelector';

type View = 'idle' | 'cropping' | 'explaining' | 'result' | 'error';

const DEFAULT_CROP: CropRange = { yStart: 15, yEnd: 85 };

// Раздел "Подсказать" (сценарий 3, см. CLAUDE.md) — отдельный от проверки
// поток: ребёнок фотографирует ЕЩЁ НЕ решённое задание, сервис объясняет
// метод, не называя ответ. Ничего не сохраняется — это не проверка с
// оценкой.
//
// 27.08.2026: раньше здесь модель САМА находила все задания на фото и их
// границы (см. большой закомментированный блок в конце файла — старая
// реализация оставлена нетронутой на случай отката, вместе с нетронутым
// серверным /api/hint/detect и lib/claude.ts → detectTasksForHint). По
// прямому запросу владельца это заменено на ручную полосу-выделение
// (components/CropSelector.tsx): ребёнок сам двигает и сужает область по
// ВЕРТИКАЛИ (по горизонтали — всегда вся ширина фото, без регулировки), и
// эти координаты уходят сразу на объяснение — без отдельного шага
// распознавания. Ось изначально была наоборот (горизонталь ручная,
// вертикаль всегда полная) — владелец сам попросил именно так, но на
// реальном фото оказалось, что задания почти всегда идут друг под другом
// (отличаются по Y, не по X), так что горизонтальное сужение не помогало
// выбрать конкретное задание — ось поменяли местами в тот же день, как
// только стало видно на скриншоте с реального устройства. Модель теперь
// сама коротко пересказывает, что она поняла как условие (см.
// EXPLAIN_TASK_UNKNOWN_CONDITION_NOTE в lib/claude.ts) — это предположение,
// а не заранее известный факт, поэтому в результате оно подписано как
// "Мы поняли задание так" с возможностью перевыделить область.
export default function HintTab() {
  const [view, setView] = useState<View>('idle');
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropRange, setCropRange] = useState<CropRange>(DEFAULT_CROP);
  const [result, setResult] = useState<{ condition: string; explanation: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const {
    speak,
    stop,
    isSpeaking,
    isSupported: canSpeak,
    voices,
    voiceURI,
    setVoiceURI,
    previewVoice,
    rate,
    setRate
  } = useSpeech();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function safeJson(res: Response): Promise<any> {
    const bodyText = await res.text();
    try {
      return JSON.parse(bodyText);
    } catch {
      console.error('Не удалось разобрать ответ сервера:', bodyText.slice(0, 500));
      throw new Error('Сервис не ответил вовремя, попробуйте ещё раз');
    }
  }

  async function handleFile(file: File) {
    setError('');
    const normalized = await normalizeImageToJpeg(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(normalized));
    setPendingFile(normalized);
    setCropRange(DEFAULT_CROP);
    setView('cropping');
  }

  async function requestExplanationForCrop() {
    if (!pendingFile) return;
    setView('explaining');
    setError('');

    const formData = new FormData();
    formData.append('photo', pendingFile);
    formData.append(
      'task',
      JSON.stringify({
        xStartPercent: 0,
        xEndPercent: 100,
        yStartPercent: Math.round(cropRange.yStart),
        yEndPercent: Math.round(cropRange.yEnd)
      })
    );

    try {
      let res: Response;
      try {
        res = await fetch('/api/hint/explain', { method: 'POST', body: formData });
      } catch (networkErr) {
        // См. components/PhotoChecker.tsx — тот же класс ошибки: сам
        // fetch() бросает исключение до ответа (обрыв сети), браузер даёт
        // сырое сообщение ("Load failed" и т.п.) — подменяем на дружелюбное.
        console.error('Сетевая ошибка при отправке фото на подсказку:', networkErr);
        throw new Error('Не удалось отправить фото — проверьте интернет-соединение и попробуйте ещё раз');
      }
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Не удалось составить подсказку');
      setResult({ condition: data.condition || '', explanation: data.explanation });
      setView('result');
    } catch (err: any) {
      setError(err.message || 'Что-то пошло не так');
      setView('error');
    }
  }

  function reset() {
    stop();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setResult(null);
    setError('');
    setView('idle');
    if (inputRef.current) inputRef.current.value = '';
  }

  function backToCropping() {
    stop();
    setResult(null);
    setView('cropping');
  }

  return (
    <section>
      {/* Оформлено по тем же принципам, что и экран загрузки во вкладке
          "Проверить" (components/PhotoChecker.tsx): список предметов
          сверху, пронумерованные шаги сразу над круглой кнопкой, группа
          центрируется в оставшейся высоте, tip-карточка внизу. Кнопка —
          в тех же зелёных тонах, что и в "Проверить" (осознанно, по
          просьбе владельца) — единственное отличие тут в pencilOrange
          остаётся tip-карточка. */}
      {view === 'idle' && (
        <div className="flex flex-col min-h-[58vh]">
          <p className="font-mono text-xs tracking-[0.12em] uppercase text-accent text-center -mt-3 mb-6">
            Математика · Русский язык · Английский язык · Окружающий мир
          </p>

          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-sm text-inkSoft text-center mb-6 leading-relaxed">
              Сфотографируйте задание, которое
              <br />
              не знаете, как решить —{' '}
              <br />
              подскажем решение, но не
              <br />
              дадим готовый ответ
            </p>

            <label className="w-32 h-32 rounded-full bg-white border-[5px] border-greenCheck flex flex-col items-center justify-center gap-1 shadow-[0_16px_30px_-12px_rgba(46,158,99,0.55)] cursor-pointer mb-4">
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
            <p className="text-center text-sm text-inkSoft max-w-[26ch] mx-auto">
              Сфотографируйте задание или выберите фото из галереи
            </p>
          </div>

          <div className="flex gap-2.5 items-start bg-pencilOrange/10 rounded-2xl px-4 py-3.5 text-left">
            <span className="shrink-0 mt-0.5" aria-hidden="true">
              💡
            </span>
            <p className="text-[13px] leading-relaxed text-ink m-0">
              Совет: фотографируйте только страницу с условием, без решения — объясним, что нужно сделать,
              шаг за шагом, но ответ ребёнок найдёт сам.
            </p>
          </div>
        </div>
      )}

      {view === 'cropping' && previewUrl && (
        <div className="-mt-6">
          <p className="font-heading font-bold text-lg text-ink mb-1 text-center">Выделите нужное задание</p>
          <p className="text-sm text-inkSoft mb-3 text-center">
            Подвиньте полосу и потяните за её края, чтобы обвести задание по высоте
          </p>

          <CropSelector imageUrl={previewUrl} value={cropRange} onChange={setCropRange} />

          <button
            type="button"
            onClick={requestExplanationForCrop}
            className="w-full mt-4 bg-pencilOrange text-white font-extrabold text-base rounded-full px-5 py-3 shadow-[0_6px_16px_rgba(238,155,61,0.4)]"
          >
            Объяснить это задание
          </button>
          <button
            type="button"
            onClick={reset}
            className="w-full mt-2 bg-white border border-ink/15 text-ink font-bold text-sm rounded-full px-5 py-2.5 shadow-sm"
          >
            Сфотографировать другое задание
          </button>
        </div>
      )}

      {view === 'explaining' && (
        <div className="flex flex-col items-center gap-3 py-16 text-inkSoft font-bold">
          <span
            className="w-[22px] h-[22px] rounded-full border-[3px] border-pencilOrange/30 border-t-pencilOrange animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>Готовлю подсказку…</span>
        </div>
      )}

      {view === 'result' && result && (
        <div>
          {result.condition && (
            <p className="text-sm text-inkSoft italic text-center mb-4">Мы поняли задание так: {result.condition}</p>
          )}

          <div className="flex gap-2.5 items-start bg-pencilOrange/10 rounded-2xl px-4 py-4">
            <span className="shrink-0 mt-0.5 text-lg" aria-hidden="true">
              💡
            </span>
            <p className="text-[14.5px] leading-relaxed text-ink m-0">{result.explanation}</p>
          </div>

          {canSpeak && (
            <div className="flex flex-col items-center gap-2 mt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (isSpeaking ? stop() : speak(result.explanation))}
                  className="flex items-center gap-2 bg-pencilOrange text-white font-extrabold text-base rounded-full pl-4 pr-5 py-2.5 shadow-[0_6px_16px_rgba(238,155,61,0.4)]"
                >
                  <span aria-hidden="true" className="text-lg">
                    {isSpeaking ? '⏹' : '🔊'}
                  </span>
                  {isSpeaking ? 'Остановить' : 'Слушать подсказку'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowVoiceSettings((v) => !v)}
                  aria-label="Настройки озвучки"
                  aria-expanded={showVoiceSettings}
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full border border-ink/15 bg-white text-lg"
                >
                  ⚙️
                </button>
              </div>

              {showVoiceSettings && (
                <div className="w-full max-w-xs bg-white/80 border border-ink/10 rounded-2xl p-4 flex flex-col gap-4">
                  {voices.length > 1 && (
                    <div>
                      <label className="text-xs font-bold text-inkSoft block mb-1.5">Голос</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={voiceURI}
                          onChange={(e) => {
                            setVoiceURI(e.target.value);
                            previewVoice(e.target.value);
                          }}
                          className="flex-1 min-w-0 text-sm border border-ink/15 rounded-lg px-2.5 py-2 bg-white"
                        >
                          {voices.map((v, i) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                              {v.name || `Голос ${i + 1}`}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => previewVoice(voiceURI || voices[0].voiceURI)}
                          className="shrink-0 text-xs font-bold text-pencilOrange underline"
                        >
                          Прослушать
                        </button>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold text-inkSoft block mb-1.5">
                      Скорость: ×{rate.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={rate}
                      onChange={(e) => setRate(Number(e.target.value))}
                      className="w-full accent-pencilOrange"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col items-center gap-2 mt-5">
            <button
              type="button"
              onClick={backToCropping}
              className="bg-white border border-ink/15 text-ink font-bold text-sm rounded-full px-5 py-2.5 shadow-sm"
            >
              Выбрать другую область на этом фото
            </button>
            <button
              type="button"
              onClick={reset}
              className="bg-white border border-ink/15 text-ink font-bold text-sm rounded-full px-5 py-2.5 shadow-sm"
            >
              Сфотографировать другое задание
            </button>
          </div>
        </div>
      )}

      {view === 'error' && (
        <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-sm p-5">
          <div className="bg-redPenSoft text-[#7A1E29] rounded-xl px-4 py-3.5 text-[14.5px] leading-relaxed">
            {error}
          </div>
          <div className="flex justify-center gap-2.5 mt-3.5 flex-wrap">
            <button
              type="button"
              onClick={reset}
              className="bg-pencilOrange text-white font-extrabold text-[15px] rounded-[10px] px-5 py-3 shadow-[0_6px_14px_rgba(238,155,61,0.3)]"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ===========================================================================
   СТАРАЯ РЕАЛИЗАЦИЯ (авто-определение заданий моделью) — закомментировано
   27.08.2026 по прямому запросу владельца, см. CLAUDE.md ("Подсказать":
   ручная рамка вместо авто-детекта). Серверная часть НЕ трогалась —
   app/api/hint/detect/route.ts и lib/claude.ts → detectTasksForHint (+
   DETECT_TASKS_PROMPT/clampTaskBounds/HintTaskCandidate, которые к тому же
   разделяет с ДРУГОЙ фичей "Выбор задания на фото учебника" — их трогать
   вообще нельзя) остались полностью рабочими, просто клиент их больше не
   вызывает. Чтобы вернуть старое поведение:
   1. Заменить активные type View / DEFAULT_CROP / handleFile /
      requestExplanationForCrop / backToCropping / JSX-вьюхи 'cropping'
      выше на код из этого комментария (TaskCandidate, 'detecting',
      'selecting', handleFile с вызовом /api/hint/detect, requestExplanation,
      backToSelecting).
   2. Убрать import CropSelector, если он больше не нужен.
   Ничего откатывать на сервере не нужно — там всё как было.

type TaskCandidate = {
  number: string;
  condition: string;
  yStartPercent: number;
  yEndPercent: number;
};

// добавить в View: 'idle' | 'detecting' | 'selecting' | 'explaining' | 'result' | 'error'
// добавить состояние: const [tasks, setTasks] = useState<TaskCandidate[]>([]);
// result тогда имел форму { number: string; condition: string; explanation: string }

async function handleFile(file: File) {
  setView('detecting');
  setError('');
  const normalized = await normalizeImageToJpeg(file);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  setPreviewUrl(URL.createObjectURL(normalized));
  setPendingFile(normalized);

  const formData = new FormData();
  formData.append('photo', normalized);

  try {
    const res = await fetch('/api/hint/detect', { method: 'POST', body: formData });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || 'Не удалось обработать фото');

    const found: TaskCandidate[] = data.tasks || [];
    if (found.length === 1) {
      await requestExplanation(normalized, found[0]);
    } else {
      setTasks(found);
      setView('selecting');
    }
  } catch (err: any) {
    setError(err.message || 'Что-то пошло не так');
    setView('error');
  }
}

async function requestExplanation(file: File, task: TaskCandidate) {
  setView('explaining');
  setError('');

  const formData = new FormData();
  formData.append('photo', file);
  formData.append('task', JSON.stringify(task));

  try {
    const res = await fetch('/api/hint/explain', { method: 'POST', body: formData });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || 'Не удалось составить подсказку');
    setResult({ number: data.number, condition: data.condition, explanation: data.explanation });
    setView('result');
  } catch (err: any) {
    setError(err.message || 'Что-то пошло не так');
    setView('error');
  }
}

function backToSelecting() {
  stop();
  setResult(null);
  setView(tasks.length > 1 ? 'selecting' : 'idle');
}

// JSX 'detecting' (внутри общего блока с 'idle'):
      {view === 'detecting' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-inkSoft font-bold">
          <span
            className="w-[22px] h-[22px] rounded-full border-[3px] border-pencilOrange/30 border-t-pencilOrange animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>Ищу задания на фото…</span>
        </div>
      )}

// JSX 'selecting':
      {view === 'selecting' && previewUrl && (
        <div>
          <p className="font-heading font-bold text-lg text-ink mb-1.5 text-center">Какое задание объяснить?</p>
          <p className="text-sm text-inkSoft mb-4 text-center">Нажмите на нужное задание прямо на фото</p>

          <div className="relative inline-block w-full rounded-2xl overflow-hidden border border-ink/10 shadow-sm">
            <img src={previewUrl} alt="Загруженное фото задания" className="w-full h-auto block" />
            {tasks.map((t) => (
              <button
                key={t.number}
                type="button"
                onClick={() => pendingFile && requestExplanation(pendingFile, t)}
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

          <button
            type="button"
            onClick={reset}
            className="w-full mt-5 bg-white border border-ink/15 text-ink font-bold text-sm rounded-full px-5 py-2.5 shadow-sm"
          >
            Сфотографировать другое задание
          </button>
        </div>
      )}

// В 'result' раньше был заголовок:
          <p className="font-heading font-bold text-lg text-ink mb-3 text-center">
            Задание {result.number}
          </p>
          {result.condition && (
            <p className="text-sm text-inkSoft italic text-center mb-4">{result.condition}</p>
          )}

// и кнопка "Другое задание на этом фото" рядом со "Сфотографировать другое":
            {tasks.length > 1 && (
              <button
                type="button"
                onClick={backToSelecting}
                className="bg-white border border-ink/15 text-ink font-bold text-sm rounded-full px-5 py-2.5 shadow-sm"
              >
                Другое задание на этом фото
              </button>
            )}
=========================================================================== */
