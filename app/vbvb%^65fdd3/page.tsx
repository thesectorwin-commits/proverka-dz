import { requireAdmin } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabaseServer';
import AdminLoginForm from '@/components/AdminLoginForm';
import AdminPushBroadcast from '@/components/AdminPushBroadcast';
import AdminPushTemplates from '@/components/AdminPushTemplates';
import AdminAiProvider from '@/components/AdminAiProvider';
import AdminTextbookIndex from '@/components/AdminTextbookIndex';

export default async function AdminPage() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return <AdminLoginForm />;
  }

  const [
    { count: usersCount },
    { count: checksCount },
    { data: recentChecks },
    { data: pricingVotes },
    { count: pushSubsCount },
    { count: indexChecksCount }
  ] = await Promise.all([
    supabaseServer.from('users').select('*', { count: 'exact', head: true }),
    supabaseServer.from('checks').select('*', { count: 'exact', head: true }),
    supabaseServer
      .from('checks')
      .select('id, subject, grade, created_at, tokens_input, tokens_output, ai_provider')
      .order('created_at', { ascending: false })
      .limit(30),
    supabaseServer.from('pricing_votes').select('tier, choice'),
    supabaseServer.from('push_subscriptions').select('*', { count: 'exact', head: true }),
    // Отдельный счётчик, а не только 30-строчная таблица ниже — при
    // ожидаемо скромном hit-rate пилота "индекс учебника" (см.
    // components/AdminTextbookIndex.tsx) редкие 'index'-строки легко
    // потерять глазами среди остальных 30 строк.
    supabaseServer.from('checks').select('*', { count: 'exact', head: true }).eq('ai_provider', 'index')
  ]);

  const voteCounts: Record<string, number> = {};
  (pricingVotes || []).forEach((v) => {
    const key = v.choice === 'ok' ? `${v.tier} ₽/мес` : 'Не готов платить';
    voteCounts[key] = (voteCounts[key] || 0) + 1;
  });

  return (
    <main className="grid-paper-bg min-h-screen max-w-4xl mx-auto px-4 py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Админ-панель</h1>
        <form action="/api/admin-logout" method="post">
          <button className="text-sm text-inkSoft underline" formAction="/api/admin-logout">
            Выйти
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-inkSoft uppercase mb-1">Пользователей</p>
          <p className="text-3xl font-bold">{usersCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-inkSoft uppercase mb-1">Всего проверок</p>
          <p className="text-3xl font-bold">{checksCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-inkSoft uppercase mb-1">Проверок по индексу учебника</p>
          <p className="text-3xl font-bold">{indexChecksCount ?? 0}</p>
        </div>
      </div>

      <h2 className="text-lg font-bold mb-4">Последние проверки</h2>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-inkSoft">
            <tr>
              <th className="px-4 py-2">Дата</th>
              <th className="px-4 py-2">Предмет</th>
              <th className="px-4 py-2">Оценка</th>
              <th className="px-4 py-2">Токены (вх/вых)</th>
              <th className="px-4 py-2">Провайдер</th>
            </tr>
          </thead>
          <tbody>
            {(recentChecks || []).map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2">
                  {new Date(c.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                </td>
                <td className="px-4 py-2">{c.subject}</td>
                <td className="px-4 py-2">{c.grade ?? '—'}</td>
                <td className="px-4 py-2">
                  {c.tokens_input ?? 0} / {c.tokens_output ?? 0}
                </td>
                <td className="px-4 py-2">{c.ai_provider || 'claude'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-bold mb-4 mt-10">Голоса по тарифам (тестовый режим)</h2>
      <div className="bg-white rounded-xl shadow-sm p-5">
        {Object.keys(voteCounts).length === 0 ? (
          <p className="text-sm text-inkSoft">Пока нет ни одного голоса.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(voteCounts).map(([label, count]) => (
              <div key={label} className="flex justify-between text-sm border-t first:border-t-0 pt-2 first:pt-0">
                <span>{label}</span>
                <span className="font-bold">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-lg font-bold mb-4 mt-10">Push-уведомления</h2>
      <p className="text-sm text-inkSoft mb-3">Подписано устройств: {pushSubsCount ?? 0}</p>
      <AdminPushBroadcast />

      <h2 className="text-lg font-bold mb-4 mt-10">Тексты автоматических уведомлений</h2>
      <AdminPushTemplates />

      <h2 className="text-lg font-bold mb-4 mt-10">Провайдер проверки</h2>
      <AdminAiProvider />

      <h2 className="text-lg font-bold mb-4 mt-10">Индекс учебника (пилот)</h2>
      <AdminTextbookIndex />
    </main>
  );
}
