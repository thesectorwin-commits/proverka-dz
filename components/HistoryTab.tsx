'use client';

import { useEffect, useState } from 'react';
import CheckResultView, { CheckTask } from '@/components/CheckResultView';
import CalendarHeatmap from '@/components/CalendarHeatmap';
import PhotoModal from '@/components/PhotoModal';
import { getMoscowDateStr } from '@/lib/moscowDate';

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Математика',
  russian: 'Русский язык',
  english: 'Английский язык',
  world: 'Окружающий мир'
};

type CheckSummary = {
  id: string;
  subject: string;
  grade: number | null;
  general_comment: string;
  created_at: string;
  incorrect_count: number;
  unclear_count: number;
  has_photo: boolean;
};

type CheckDetail = {
  grade: number | null;
  general_comment: string;
  tasks: CheckTask[];
};

function formatSelectedDate(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Сегодня';
  const d = new Date(`${dateStr}T00:00:00+03:00`);
  return d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });
}

export default function HistoryTab({
  todayChecks,
  initialExpandedId
}: {
  /** Проверки за сегодня — держатся в DashboardShell и обновляются сразу после новой проверки. */
  todayChecks: CheckSummary[];
  /** Открыть конкретную проверку сразу при заходе — ссылка из push-уведомления. */
  initialExpandedId?: string | null;
}) {
  const todayStr = getMoscowDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [dayCache, setDayCache] = useState<Record<string, CheckSummary[]>>({});
  const [loadingDay, setLoadingDay] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CheckDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Id проверки, чьё фото сейчас открыто на весь экран (см. PhotoModal).
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  // Проверки, для которых превью не загрузилось (фото удалено по сроку
  // 48 часов, ошибка заливки и т.п.) — прячем превью без лишнего шума.
  const [photoErrorIds, setPhotoErrorIds] = useState<Set<string>>(new Set());

  const checksForSelectedDay = selectedDate === todayStr ? todayChecks : dayCache[selectedDate];

  useEffect(() => {
    if (selectedDate === todayStr || dayCache[selectedDate]) return;
    setLoadingDay(true);
    fetch(`/api/checks/list?date=${selectedDate}`)
      .then((res) => (res.ok ? res.json() : { checks: [] }))
      .then((data) => setDayCache((prev) => ({ ...prev, [selectedDate]: data.checks || [] })))
      .catch(() => setDayCache((prev) => ({ ...prev, [selectedDate]: [] })))
      .finally(() => setLoadingDay(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    if (initialExpandedId && todayChecks.some((c) => c.id === initialExpandedId)) {
      toggleExpand(initialExpandedId);
    }
    // Срабатывает один раз при заходе по ссылке из уведомления — дальше
    // раскрытием управляет обычный клик по карточке. Ссылка из пуша всегда
    // указывает на только что созданную проверку — она в todayChecks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialExpandedId]);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (details[id]) return;

    setLoadingId(id);
    try {
      const res = await fetch(`/api/checks/${id}`);
      const data = await res.json();
      if (res.ok) {
        setDetails((prev) => ({
          ...prev,
          [id]: {
            grade: data.grade,
            general_comment: data.general_comment,
            tasks: data.check_tasks || []
          }
        }));
      }
    } finally {
      setLoadingId(null);
    }
  }

  const visibleChecks = (checksForSelectedDay || []).filter(
    (c) => !errorsOnly || c.incorrect_count > 0 || c.unclear_count > 0
  );

  // Сводка по предметам за выбранный день: берём САМУЮ ПОСЛЕДНЮЮ проверку
  // по каждому предмету (список уже отсортирован по created_at desc на
  // сервере и при добавлении в todayChecks — первое вхождение предмета и
  // есть последнее по времени). Предмет считается выполненным, только
  // если в последней попытке нет ни ошибок, ни нераспознанных ответов —
  // если ребёнок ещё не загрузил фото с исправлением, предмет "висит".
  const subjectSummary: { subject: string; done: boolean }[] = [];
  {
    const seen = new Set<string>();
    for (const c of checksForSelectedDay || []) {
      if (seen.has(c.subject)) continue;
      seen.add(c.subject);
      subjectSummary.push({ subject: c.subject, done: c.incorrect_count === 0 && c.unclear_count === 0 });
    }
  }

  return (
    <section>
      <h2 className="font-heading font-bold text-lg text-ink mb-4">История проверок</h2>

      <CalendarHeatmap
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        todayOverride={{
          count: todayChecks.length,
          hasErrors: todayChecks.some((c) => c.incorrect_count > 0 || c.unclear_count > 0)
        }}
      />

      {subjectSummary.length > 0 && (
        <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-sm p-4 mb-5">
          <p className="text-xs font-bold text-inkSoft uppercase tracking-wide mb-3">
            Сводка по предметам — {formatSelectedDate(selectedDate, todayStr).toLowerCase()}
          </p>
          <div className="flex flex-wrap gap-2">
            {subjectSummary.map(({ subject, done }) => (
              <span
                key={subject}
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
                  done ? 'bg-greenSoft text-greenCheck border-greenCheck/30' : 'bg-pencilOrange/10 text-pencilOrange border-pencilOrange/30'
                }`}
              >
                <span aria-hidden="true">{done ? '✅' : '⏳'}</span>
                {SUBJECT_LABELS[subject] || subject}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm font-bold text-ink">{formatSelectedDate(selectedDate, todayStr)}</p>
        <label className="flex items-center gap-2 text-xs text-inkSoft font-semibold cursor-pointer select-none">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
            className="accent-redPen"
          />
          Только с ошибками
        </label>
      </div>

      {loadingDay ? (
        <p className="text-inkSoft text-sm">Загрузка…</p>
      ) : !checksForSelectedDay || checksForSelectedDay.length === 0 ? (
        <p className="text-inkSoft text-sm">
          {selectedDate === todayStr
            ? 'Проверок сегодня пока нет — загрузите фото во вкладке «Проверить задание».'
            : 'В этот день проверок не было.'}
        </p>
      ) : visibleChecks.length === 0 ? (
        <p className="text-inkSoft text-sm">В этот день ошибок не было — все проверки без замечаний.</p>
      ) : (
        <div className="space-y-2">
          {visibleChecks.map((c) => (
            <div key={c.id} className="bg-white/70 border border-ink/10 rounded-xl shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpand(c.id)}
                className="w-full text-left px-4 py-3 flex justify-between items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{SUBJECT_LABELS[c.subject] || c.subject}</p>
                  <p className="text-xs text-inkSoft">
                    {new Date(c.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                  </p>
                </div>
                {c.incorrect_count === 0 && c.unclear_count === 0 ? (
                  <span className="text-2xl leading-none text-greenCheck" aria-label="Без ошибок">
                    ✅
                  </span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    {c.incorrect_count > 0 && (
                      <span className="flex items-center gap-1 text-redPen text-sm font-bold">
                        <span aria-hidden="true">✕</span>
                        {c.incorrect_count}
                      </span>
                    )}
                    {c.unclear_count > 0 && (
                      <span className="flex items-center gap-1 text-pencilOrange text-sm font-bold">
                        <span aria-hidden="true">❓</span>
                        {c.unclear_count}
                      </span>
                    )}
                  </div>
                )}
              </button>

              {expandedId === c.id && (
                <div className="border-t border-ink/10 px-4 py-4">
                  {c.has_photo && !photoErrorIds.has(c.id) && (
                    <button
                      type="button"
                      onClick={() => setOpenPhotoId(c.id)}
                      className="block mx-auto mb-4 rounded-lg overflow-hidden border border-ink/10 shadow-sm"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/checks/${c.id}/photo`}
                        alt="Фото решения — нажмите, чтобы увеличить"
                        className="max-h-40 w-auto mx-auto"
                        onError={() => setPhotoErrorIds((prev) => new Set(prev).add(c.id))}
                      />
                    </button>
                  )}
                  {loadingId === c.id ? (
                    <p className="text-sm text-inkSoft">Загрузка…</p>
                  ) : details[c.id] ? (
                    <CheckResultView
                      grade={details[c.id].grade}
                      generalComment={details[c.id].general_comment}
                      tasks={details[c.id].tasks}
                    />
                  ) : (
                    <p className="text-sm text-inkSoft">Не удалось загрузить результат.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {openPhotoId && (
        <PhotoModal src={`/api/checks/${openPhotoId}/photo`} onClose={() => setOpenPhotoId(null)} />
      )}
    </section>
  );
}
