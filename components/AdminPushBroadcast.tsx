'use client';

import { useState } from 'react';

export default function AdminPushBroadcast() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'parent' | 'child'>('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/push-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, target })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить');
      setResult(`Отправлено: ${data.sent} из ${data.total}${data.failed ? `, ошибок: ${data.failed}` : ''}`);
      setTitle('');
      setBody('');
    } catch (err: any) {
      setResult(`Ошибка: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <input
        type="text"
        placeholder="Заголовок уведомления"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full border border-ink/15 rounded-lg px-3 py-2 text-sm"
        required
      />
      <textarea
        placeholder="Текст уведомления"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full border border-ink/15 rounded-lg px-3 py-2 text-sm"
        required
      />
      <label className="block text-xs text-inkSoft">
        Кому отправить
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as 'all' | 'parent' | 'child')}
          className="w-full border border-ink/15 rounded-lg px-3 py-2 text-sm mt-1"
        >
          <option value="all">Всем подписанным устройствам</option>
          <option value="parent">Только устройства, помеченные «Родитель»</option>
          <option value="child">Только устройства, помеченные «Ребёнок»</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={sending}
        className="bg-greenCheck text-white font-bold text-sm rounded-lg px-4 py-2.5 disabled:opacity-60"
      >
        {sending ? 'Отправляем…' : 'Отправить'}
      </button>
      {result && <p className="text-sm text-inkSoft">{result}</p>}
    </form>
  );
}
