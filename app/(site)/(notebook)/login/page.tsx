const ERROR_MESSAGES: Record<string, string> = {
  denied: 'Вы отменили вход через Яндекс ID.',
  no_code: 'Не удалось получить код авторизации от Яндекса.',
  token_exchange: 'Не удалось обменять код на токен доступа.',
  profile_fetch: 'Не удалось получить профиль пользователя.',
  db: 'Ошибка базы данных при входе.',
  network: 'Проблема с сетевым соединением. Попробуйте ещё раз.'
};

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null;

  return (
    <main className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-6">Вход в аккаунт</h1>

      {errorMessage && (
        <p className="bg-red-50 text-redPen border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm">
          {errorMessage}
        </p>
      )}

      {/* Кнопка "Войти через Яндекс ID" теперь в общей шапке сайта
          (components/SiteHeader.tsx, показывается всем неавторизованным
          пользователям) — своя кнопка здесь убрана 05.09.2026, чтобы не
          дублировать её на этой же странице. */}
    </main>
  );
}
