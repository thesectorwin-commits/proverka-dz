'use client';

import { useEffect, useState } from 'react';

// Тумблер пилота "индекс учебника" (см. CLAUDE.md, lib/textbookIndex.ts,
// lib/openai.ts → tryTextbookIndexCheck) — узкая проверка по заранее
// известному ответу вместо полного решения моделью, только для 10 страниц
// одной конкретной рабочей тетради (Кремнева, 3 класс), только для
// однофотовых проверок математики. По умолчанию выключен — включать
// осознанно, ожидая скромный hit-rate (см. пояснение под тумблером).

export default function AdminTextbookIndex() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/textbook-index')
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => setEnabled(Boolean(data.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  async function toggle() {
    if (enabled === null || saving) return;
    const next = !enabled;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/textbook-index', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Не удалось сохранить');
      setEnabled(next);
      setMessage('Сохранено');
    } catch (err: any) {
      setMessage(`Ошибка: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) return <p className="text-sm text-inkSoft">Загрузка…</p>;

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={toggle} disabled={saving} className="mt-1" />
        <span>
          <span className="block font-bold text-sm">Включить индекс учебника (пилот)</span>
          <span className="block text-xs text-inkSoft mt-0.5">
            Пилот на 10 страницах ОДНОЙ рабочей тетради (Кремнева, 3 класс, «Школа России»). Срабатывает только на
            однофотовых проверках математики, и только если ВСЕ задания на фото сопоставились с индексом и относятся
            к числовым типам (примеры, уравнения, вставь число, цепочки). Реальный hit-rate будет скромным — несколько
            страниц смешивают такие задания с задачами на измерение/рисование/творческие, которые индекс пока не
            покрывает, тогда проверка целиком идёт обычным путём. Не проверялось на реальных фото решённых страниц
            этой тетради до первого включения — включайте осознанно и смотрите на счётчик «Проверок по индексу» ниже.
          </span>
        </span>
      </label>
      {message && <p className="text-xs text-inkSoft">{message}</p>}
    </div>
  );
}
