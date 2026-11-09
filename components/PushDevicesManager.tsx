'use client';

import { useEffect, useState } from 'react';

type Device = {
  id: string;
  device_type: 'parent' | 'child' | null;
  device_label: string | null;
  user_agent: string | null;
  created_at: string;
};

function guessBrowser(ua: string): string {
  if (/FxiOS/.test(ua)) return 'Firefox';
  if (/CriOS/.test(ua)) return 'Chrome';
  if (/EdgiOS|Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox/.test(ua)) return 'Firefox';
  if (/Chrome/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  return '';
}

// Даёт пользователю подсказку "что это за устройство" (модель/ОС/браузер)
// на основе User-Agent — только для UI, не участвует в логике рассылки.
function guessDeviceHint(ua: string | null): string {
  if (!ua) return 'Неизвестное устройство';

  const browser = guessBrowser(ua);

  if (/iPad/.test(ua)) return `iPad, ${browser || 'Safari'}`;
  if (/iPhone/.test(ua)) return `iPhone, ${browser || 'Safari'}`;

  if (/Android/.test(ua)) {
    const match = ua.match(/Android\s[\d.]+;\s*([^)]+)\)/);
    let model = match ? match[1].split('Build/')[0].trim() : '';
    // wv (WebView), K (сокращённая версия) и т.п. — не полезны пользователю
    if (/^(wv|K)$/i.test(model)) model = '';
    return [model || 'Android', browser].filter(Boolean).join(', ');
  }

  if (/Macintosh/.test(ua)) return `Mac, ${browser || 'браузер'}`;
  if (/Windows/.test(ua)) return `Windows, ${browser || 'браузер'}`;
  if (/Linux/.test(ua)) return `Linux, ${browser || 'браузер'}`;

  return 'Устройство';
}

export default function PushDevicesManager() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/push/devices')
      .then((res) => (res.ok ? res.json() : { devices: [] }))
      .then((data) => setDevices(data.devices || []))
      .catch(() => setDevices([]));
  }, []);

  async function save(id: string, patch: { deviceType?: string | null; deviceLabel?: string | null }) {
    setSavingId(id);
    const current = devices?.find((d) => d.id === id);
    const body = {
      id,
      deviceType: patch.deviceType !== undefined ? patch.deviceType : current?.device_type ?? null,
      deviceLabel: patch.deviceLabel !== undefined ? patch.deviceLabel : current?.device_label ?? null
    };
    try {
      await fetch('/api/push/devices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setDevices((prev) =>
        (prev || []).map((d) =>
          d.id === id ? { ...d, device_type: body.deviceType as any, device_label: body.deviceLabel } : d
        )
      );
    } finally {
      setSavingId(null);
    }
  }

  async function sendTest(id: string) {
    setTestingId(id);
    setTestResult((prev) => ({ ...prev, [id]: '' }));
    try {
      const res = await fetch('/api/push/devices/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      setTestResult((prev) => ({
        ...prev,
        [id]: res.ok && data.sent > 0 ? 'Отправлено' : 'Не удалось отправить'
      }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: 'Не удалось отправить' }));
    } finally {
      setTestingId(null);
      setTimeout(() => setTestResult((prev) => ({ ...prev, [id]: '' })), 4000);
    }
  }

  async function remove(id: string) {
    if (!confirm('Удалить это устройство? Оно перестанет получать уведомления.')) return;
    setDeletingId(id);
    try {
      await fetch('/api/push/devices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      setDevices((prev) => (prev || []).filter((d) => d.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  if (!devices || devices.length === 0) return null;

  return (
    <div className="bg-white/85 border border-ink/[0.06] rounded-2xl shadow-sm p-4 mb-4">
      <div className="flex items-center gap-3 mb-1">
        <span className="w-[30px] h-[30px] rounded-lg bg-ink flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <rect x="6" y="2" width="12" height="20" rx="2.5" stroke="#fff" strokeWidth="1.8" />
          </svg>
        </span>
        <h3 className="font-medium text-[15px] text-ink">Устройства для уведомлений</h3>
      </div>
      <p className="text-xs text-inkSoft mb-4 mt-1">
        Отметь, чей это телефон — родителя или ребёнка. Это нужно, чтобы разные уведомления можно было
        отправлять только на нужное устройство.
      </p>
      <div className="space-y-3">
        {devices.map((d) => (
          <div key={d.id} className="border border-ink/10 rounded-xl p-3 flex flex-col gap-2">
            <p className="text-xs text-inkSoft">
              {guessDeviceHint(d.user_agent)}
              <span className="text-ink/30">
                {' '}
                · подключено{' '}
                {new Date(d.created_at).toLocaleString('ru-RU', {
                  timeZone: 'Europe/Moscow',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </p>
            <input
              type="text"
              placeholder="Название (например, Телефон мамы)"
              defaultValue={d.device_label || ''}
              onBlur={(e) => save(d.id, { deviceLabel: e.target.value || null })}
              className="border border-ink/15 rounded-lg px-3 py-1.5 text-sm"
            />
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  ['parent', 'Родитель'],
                  ['child', 'Ребёнок'],
                  [null, 'Не указано']
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  disabled={savingId === d.id}
                  onClick={() => save(d.id, { deviceType: value })}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border disabled:opacity-60 ${
                    d.device_type === value
                      ? 'bg-greenCheck text-white border-greenCheck'
                      : 'bg-transparent text-inkSoft border-ink/15'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                disabled={testingId === d.id}
                onClick={() => sendTest(d.id)}
                className="text-xs font-bold px-3 py-1.5 rounded-full border border-ink/15 text-inkSoft disabled:opacity-60"
              >
                {testingId === d.id ? 'Отправляем…' : '🔔 Проверить'}
              </button>
              <button
                type="button"
                disabled={deletingId === d.id}
                onClick={() => remove(d.id)}
                className="text-xs font-bold px-3 py-1.5 rounded-full border border-redPen/30 text-redPen disabled:opacity-60"
              >
                {deletingId === d.id ? 'Удаляем…' : '🗑 Удалить'}
              </button>
              {testResult[d.id] && <span className="text-xs text-inkSoft self-center">{testResult[d.id]}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
