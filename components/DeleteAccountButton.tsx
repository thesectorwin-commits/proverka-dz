'use client';

import { useState } from 'react';

export default function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch('/api/me', { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/';
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="w-[30px] h-[30px] rounded-lg bg-redPen flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="text-[15px] font-medium text-redPen">Удалить аккаунт</span>
      </button>
    );
  }

  return (
    <div className="px-4 py-4">
      <p className="text-[13.5px] text-ink leading-relaxed mb-3">
        Удалить аккаунт и все данные без возможности восстановления?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="flex-1 bg-redPen text-white font-bold text-sm rounded-xl py-2.5 disabled:opacity-60"
        >
          {deleting ? 'Удаляем…' : 'Да, удалить'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="flex-1 bg-paper text-inkSoft font-bold text-sm rounded-xl py-2.5 border border-ink/10"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
