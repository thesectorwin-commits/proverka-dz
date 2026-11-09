'use client';

import { useEffect, useState } from 'react';

type Provider = 'claude' | 'openai';

const OPTIONS: Array<{ value: Provider; name: string; hint: string }> = [
  {
    value: 'claude',
    name: 'Claude (Haiku 4.5 + Sonnet 4.6)',
    hint: 'Текущий провайдер по умолчанию, полностью проверен в проде.'
  },
  {
    value: 'openai',
    name: 'GPT-5.4-mini (эксперимент)',
    hint: 'Заметно дешевле, но НЕ на 100% надёжен на многошаговой арифметике и заданиях с общим банком карточек-ответов — см. подробности в CLAUDE.md. Включайте осознанно.'
  }
];

export default function AdminAiProvider() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/ai-provider')
      .then((res) => (res.ok ? res.json() : { provider: 'claude' }))
      .then((data) => setProvider(data.provider || 'claude'))
      .catch(() => setProvider('claude'));
  }, []);

  async function selectProvider(value: Provider) {
    if (value === provider || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/ai-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: value })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Не удалось сохранить');
      setProvider(value);
      setMessage('Сохранено');
    } catch (err: any) {
      setMessage(`Ошибка: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!provider) return <p className="text-sm text-inkSoft">Загрузка…</p>;

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer ${
              provider === opt.value ? 'border-greenCheck bg-greenCheck/5' : 'border-ink/15'
            }`}
          >
            <input
              type="radio"
              name="ai-provider"
              checked={provider === opt.value}
              onChange={() => selectProvider(opt.value)}
              disabled={saving}
              className="mt-1"
            />
            <span>
              <span className="block font-bold text-sm">{opt.name}</span>
              <span className="block text-xs text-inkSoft mt-0.5">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {message && <p className="text-xs text-inkSoft">{message}</p>}
    </div>
  );
}
