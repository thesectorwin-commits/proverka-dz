'use client';

import { useEffect, useState } from 'react';
import { detectPlatform, isStandalone } from '@/lib/platform';
import { PushStatus } from '@/lib/usePushSubscription';

const DISMISSED_KEY = 'ios-push-prompt-dismissed';

// На iOS Safari Notification.requestPermission() без клика пользователя
// не показывает системный диалог вообще (см. lib/usePushSubscription.ts) —
// поэтому там вместо автоподписки показываем свой попап с явной кнопкой,
// клик по которой и есть тот самый жест, которого требует WebKit. Пуш на
// iOS в принципе работает только в установленном на главный экран
// приложении (см. CLAUDE.md), поэтому в обычной вкладке Safari попап не
// показываем — просить разрешение там бессмысленно.
export default function IosPushPrompt({
  status,
  loading,
  subscribe
}: {
  status: PushStatus;
  loading: boolean;
  subscribe: () => void;
}) {
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const isIos = detectPlatform() === 'ios';
    const standalone = isStandalone();
    const alreadyDismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    const permissionDecided = typeof Notification !== 'undefined' && Notification.permission !== 'default';

    setEligible(isIos && standalone);
    setDismissed(alreadyDismissed || permissionDecided);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  async function handleAllow() {
    await subscribe();
    // Если пользователь всё же нажал "Не разрешать" в системном диалоге,
    // status останется 'unsubscribed' — не показываем попап повторно в
    // этой сессии в любом случае, дальше доступно только вручную из
    // "Настройка уведомлений".
    dismiss();
  }

  if (!eligible || dismissed || status !== 'unsubscribed') return null;

  return (
    <div className="fixed inset-0 z-[2000] bg-ink/45 flex items-end sm:items-center justify-center p-5">
      <div className="bg-paper rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h2 className="font-heading font-bold text-lg text-ink mb-2">Включить уведомления?</h2>
        <p className="text-sm text-inkSoft leading-relaxed mb-4">
          Пришлём push, когда проверка готова, и напомним сделать уроки в настроенное время. Дальше
          можно отключить в любой момент во вкладке «Настройка уведомлений».
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleAllow}
            disabled={loading}
            className="w-full bg-greenCheck text-white font-bold rounded-lg py-2.5 disabled:opacity-60"
          >
            {loading ? 'Секунду…' : 'Разрешить'}
          </button>
          <button type="button" onClick={dismiss} className="w-full text-inkSoft text-sm underline py-1">
            Не сейчас
          </button>
        </div>
      </div>
    </div>
  );
}
