'use client';

import { useEffect, useState } from 'react';
import { getMoscowDateStr } from '@/lib/moscowDate';

type DayInfo = { count: number; hasErrors: boolean };

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь'
];

// Сетка дней месяца в виде строк 'YYYY-MM-DD' (или null для пустых ячеек
// выравнивания по дню недели, Пн — первый столбец).
function buildMonthGrid(year: number, month0: number): (string | null)[] {
  const firstWeekday = (new Date(Date.UTC(year, month0, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

function cellClasses(info: DayInfo | undefined, isSelected: boolean, isToday: boolean, isFuture: boolean) {
  const count = info?.count || 0;
  let bg = 'bg-transparent text-inkSoft/50';
  if (count > 0 && count <= 2) bg = 'bg-greenSoft text-ink';
  else if (count >= 3 && count <= 5) bg = 'bg-greenCheck/60 text-white';
  else if (count >= 6) bg = 'bg-greenCheck text-white';

  const ring = isSelected ? 'ring-2 ring-ink' : isToday ? 'ring-1 ring-ink/40' : '';
  const disabled = isFuture ? 'opacity-30 pointer-events-none' : 'cursor-pointer hover:brightness-95';

  return `${bg} ${ring} ${disabled}`;
}

function Month({
  year,
  month0,
  data,
  selectedDate,
  todayStr,
  onSelect,
  collapsible,
  expanded,
  onToggle
}: {
  year: number;
  month0: number;
  data: Record<string, DayInfo>;
  selectedDate: string;
  todayStr: string;
  onSelect: (date: string) => void;
  /** Месяц можно сворачивать (текущий и предыдущий, оба свёрнуты по умолчанию), кликом по названию. */
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const cells = buildMonthGrid(year, month0);
  const showGrid = !collapsible || expanded;

  return (
    <div>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-bold text-inkSoft uppercase tracking-wide mb-2 hover:text-ink"
        >
          {MONTH_NAMES[month0]} {year}
          <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
      ) : (
        <p className="text-xs font-bold text-inkSoft uppercase tracking-wide mb-2">
          {MONTH_NAMES[month0]} {year}
        </p>
      )}
      {showGrid && (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-[10px] text-inkSoft/60 text-center">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, i) => {
              if (!date) return <div key={i} />;
              const day = Number(date.slice(-2));
              const info = data[date];
              const isFuture = date > todayStr;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={isFuture}
                  onClick={() => onSelect(date)}
                  className={`relative aspect-square rounded-lg text-[11px] font-bold flex items-center justify-center transition-colors ${cellClasses(
                    info,
                    date === selectedDate,
                    date === todayStr,
                    isFuture
                  )}`}
                >
                  {day}
                  {info?.hasErrors && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-redPen" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function CalendarHeatmap({
  selectedDate,
  onSelect,
  todayOverride
}: {
  selectedDate: string;
  onSelect: (date: string) => void;
  todayOverride: DayInfo;
}) {
  const [data, setData] = useState<Record<string, DayInfo>>({});
  const [currentExpanded, setCurrentExpanded] = useState(false);
  const [prevExpanded, setPrevExpanded] = useState(false);
  const todayStr = getMoscowDateStr();

  useEffect(() => {
    const [y, m] = todayStr.split('-').map(Number);
    // Диапазон: 1 число прошлого месяца — 1 число месяца после текущего
    // (правая граница исключается, см. app/api/checks/list/route.ts).
    const from = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}-01`;
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    fetch(`/api/checks/list?from=${from}&to=${to}`)
      .then((res) => (res.ok ? res.json() : { checks: [] }))
      .then((json) => {
        const map: Record<string, DayInfo> = {};
        for (const c of json.checks || []) {
          const day = getMoscowDateStr(new Date(c.created_at));
          if (!map[day]) map[day] = { count: 0, hasErrors: false };
          map[day].count++;
          if (c.incorrect_count > 0 || c.unclear_count > 0) map[day].hasErrors = true;
        }
        setData(map);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mergedData = { ...data, [todayStr]: todayOverride };
  const [ty, tm0] = [Number(todayStr.slice(0, 4)), Number(todayStr.slice(5, 7)) - 1];
  const prevMonth0 = tm0 === 0 ? 11 : tm0 - 1;
  const prevYear = tm0 === 0 ? ty - 1 : ty;

  return (
    <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-sm p-4 mb-5 flex flex-col gap-4 max-w-[300px] mx-auto">
      <Month
        year={ty}
        month0={tm0}
        data={mergedData}
        selectedDate={selectedDate}
        todayStr={todayStr}
        onSelect={onSelect}
        collapsible
        expanded={currentExpanded}
        onToggle={() => setCurrentExpanded((v) => !v)}
      />
      <Month
        year={prevYear}
        month0={prevMonth0}
        data={mergedData}
        selectedDate={selectedDate}
        todayStr={todayStr}
        onSelect={onSelect}
        collapsible
        expanded={prevExpanded}
        onToggle={() => setPrevExpanded((v) => !v)}
      />
    </div>
  );
}
