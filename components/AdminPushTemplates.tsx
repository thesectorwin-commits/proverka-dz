'use client';

import { useEffect, useState } from 'react';

type TemplateKey = 'check_ready' | 'reminder';

type Template = {
  key: TemplateKey;
  title: string;
  body: string;
  isCustomized: boolean;
};

const LABELS: Record<TemplateKey, { name: string; hint: string }> = {
  check_ready: {
    name: 'Проверка готова (пуш родителю)',
    hint: 'В тексте можно использовать {subject} (предмет) и {grade} (оценка или "есть ошибки, нужно посмотреть").'
  },
  reminder: {
    name: 'Напоминание о домашке (пуш ребёнку)',
    hint: 'Отправляется по расписанию, которое родитель настраивает в личном кабинете.'
  }
};

export default function AdminPushTemplates() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [savingKey, setSavingKey] = useState<TemplateKey | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/admin/push-templates')
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((data) => setTemplates(data.templates || []))
      .catch(() => setTemplates([]));
  }, []);

  function updateLocal(key: TemplateKey, patch: Partial<Template>) {
    setTemplates((prev) => (prev || []).map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  async function save(key: TemplateKey) {
    const tpl = templates?.find((t) => t.key === key);
    if (!tpl) return;
    setSavingKey(key);
    setMessage((prev) => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/admin/push-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, title: tpl.title, body: tpl.body })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Не удалось сохранить');
      updateLocal(key, { isCustomized: true });
      setMessage((prev) => ({ ...prev, [key]: 'Сохранено' }));
    } catch (err: any) {
      setMessage((prev) => ({ ...prev, [key]: `Ошибка: ${err.message}` }));
    } finally {
      setSavingKey(null);
    }
  }

  async function resetToDefault(key: TemplateKey) {
    setSavingKey(key);
    setMessage((prev) => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/admin/push-templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось сбросить');
      updateLocal(key, { title: data.title, body: data.body, isCustomized: false });
      setMessage((prev) => ({ ...prev, [key]: 'Сброшено к стандартному тексту' }));
    } catch (err: any) {
      setMessage((prev) => ({ ...prev, [key]: `Ошибка: ${err.message}` }));
    } finally {
      setSavingKey(null);
    }
  }

  if (!templates) return <p className="text-sm text-inkSoft">Загрузка…</p>;

  return (
    <div className="space-y-4">
      {templates.map((tpl) => {
        const label = LABELS[tpl.key];
        const saving = savingKey === tpl.key;
        return (
          <div key={tpl.key} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
            <div>
              <p className="font-bold text-sm">{label.name}</p>
              <p className="text-xs text-inkSoft mt-0.5">{label.hint}</p>
            </div>
            <input
              type="text"
              value={tpl.title}
              onChange={(e) => updateLocal(tpl.key, { title: e.target.value })}
              className="w-full border border-ink/15 rounded-lg px-3 py-2 text-sm"
              placeholder="Заголовок"
            />
            <textarea
              value={tpl.body}
              onChange={(e) => updateLocal(tpl.key, { body: e.target.value })}
              rows={2}
              className="w-full border border-ink/15 rounded-lg px-3 py-2 text-sm"
              placeholder="Текст уведомления"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => save(tpl.key)}
                disabled={saving}
                className="bg-greenCheck text-white font-bold text-sm rounded-lg px-4 py-2 disabled:opacity-60"
              >
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </button>
              {tpl.isCustomized && (
                <button
                  type="button"
                  onClick={() => resetToDefault(tpl.key)}
                  disabled={saving}
                  className="text-xs text-inkSoft underline disabled:opacity-60"
                >
                  Сбросить к стандартному
                </button>
              )}
              {!tpl.isCustomized && <span className="text-xs text-inkSoft">Стандартный текст</span>}
              {message[tpl.key] && <span className="text-xs text-inkSoft">{message[tpl.key]}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
