// Работа с календарными днями в Europe/Moscow — общая логика для сервера
// (app/(site)/dashboard/page.tsx, app/api/checks/list/route.ts) и клиента
// (components/CalendarHeatmap.tsx). У Москвы нет перехода на летнее время
// с 2014 года, поэтому смещение +03:00 всегда фиксированное — это
// упрощает границы дня до простой строковой подстановки.

export function getMoscowDateStr(date: Date = new Date()): string {
  // Локаль en-CA форматирует дату как YYYY-MM-DD — ровно то, что нужно.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(date);
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Границы календарного дня в Москве, в UTC ISO — для запросов к БД
// (created_at >= gte and created_at < lt).
export function moscowDayBounds(dateStr: string): { gte: string; lt: string } {
  return {
    gte: `${dateStr}T00:00:00+03:00`,
    lt: `${addDaysToDateStr(dateStr, 1)}T00:00:00+03:00`
  };
}
