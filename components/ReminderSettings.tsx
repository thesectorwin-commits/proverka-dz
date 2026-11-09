'use client';

import { useEffect, useState } from 'react';

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' }
];

type Settings = {
  enabled: boolean;
  weekdays: number[];
  time: string;
};

export default function ReminderSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/reminders')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSettings(data || { enabled: false, weekdays: [], time: '17:00' }))
      .catch(() => setSettings({ enabled: false, weekdays: [], time: '17:00' }));
  }, []);

  async function save(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      await fetch('/api/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      });
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return null;

  return (
    <div className="bg-white/85 border border-ink/[0.06] rounded-2xl shadow-sm overflow-hidden mb-4">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="w-[30px] h-[30px] rounded-lg bg-pencilOrange flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8" stroke="#fff" strokeWidth="1.8" />
            <path d="M12 8v4l3 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-medium text-ink">Напоминать делать уроки</span>
          <span className="block text-[12px] text-inkSoft mt-0.5">
            В выбранные дни устройства «Ребёнок» получат пуш-напоминание
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          disabled={saving}
          onClick={() => save({ enabled: !settings.enabled })}
          className={
            'shrink-0 w-11 h-6 rounded-full relative transition-colors disabled:opacity-60 ' +
            (settings.enabled ? 'bg-greenCheck' : 'bg-ink/15')
          }
        >
          <span
            className={
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ' +
              (settings.enabled ? 'translate-x-5' : '')
            }
          />
        </button>
      </div>

      <div className="px-4 pt-3 pb-4 border-t border-ink/[0.06]">
        <div className="flex gap-2 flex-wrap mb-3">
          {WEEKDAYS.map((d) => {
            const active = settings.weekdays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                disabled={saving}
                onClick={() =>
                  save({
                    weekdays: active
                      ? settings.weekdays.filter((v) => v !== d.value)
                      : [...settings.weekdays, d.value]
                  })
                }
                className={`text-xs font-bold w-10 h-10 rounded-full border disabled:opacity-60 ${
                  active ? 'bg-greenCheck text-white border-greenCheck' : 'bg-transparent text-inkSoft border-ink/15'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2.5 text-sm text-ink font-semibold">
          Время
          <input
            type="time"
            value={settings.time}
            disabled={saving}
            onChange={(e) => save({ time: e.target.value })}
            className="border border-ink/15 rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
          />
        </label>
      </div>
    </div>
  );
}
