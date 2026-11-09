'use client';

import { useState } from 'react';

export default function AdminLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось войти');
      }
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Что-то пошло не так');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid-paper-bg min-h-screen max-w-sm mx-auto px-4 py-20">
      <h1 className="text-xl font-bold mb-6 text-center">Вход в админ-панель</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Логин"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="w-full border border-ink/15 rounded-lg px-3 py-2.5 text-sm"
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full border border-ink/15 rounded-lg px-3 py-2.5 text-sm"
        />
        {error && <p className="text-redPen text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-greenCheck text-white font-bold rounded-lg py-2.5 disabled:opacity-60"
        >
          {loading ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
