'use client';

import { useEffect, useState } from 'react';
import { COOKIE_CONSENT_KEY, COOKIE_CONSENT_EVENT, hasCookieConsent } from '@/lib/cookieConsent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasCookieConsent()) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  // 08.09.2026: раньше баннер стоял на bottom-16 (отступ 64px от низа
  // экрана), чтобы не перекрывать кнопку "Установить приложение" ниже
  // (тот же fixed-футер, bottom-0, z-[600]) — но тогда под баннером был
  // виден кусок бежевого фона страницы вплоть до самого низа экрана,
  // владелец попросил убрать этот зазор. Теперь баннер сам стоит
  // впритык к низу (bottom-0 + safe-area-inset-bottom вместо py-3.5
  // снизу), а кнопка "Установить приложение" (components/InstallPwaButton.tsx,
  // variant="outline") вместо попытки встать НАД баннером (пришлось бы
  // гадать его высоту — 1 или 2 строки текста в зависимости от ширины
  // экрана) просто не рендерится вовсе, пока согласие не дано, и
  // появляется сразу же по клику "Согласен" (см. dispatchEvent ниже).
  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-[1000] bg-paper border-t border-ink/10 shadow-[0_-6px_20px_rgba(38,54,79,0.12)] px-5 pt-3.5 flex items-center justify-center gap-4 flex-wrap text-center"
      style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}
    >
      <p className="text-[13px] leading-relaxed text-inkSoft m-0 max-w-[640px]">
        Мы используем файлы cookie для обеспечения работы сайта и улучшения качества сервиса. Продолжая
        пользоваться сайтом, вы соглашаетесь с использованием файлов cookie.
      </p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(COOKIE_CONSENT_KEY, '1');
          setVisible(false);
          window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
        }}
        className="shrink-0 bg-greenCheck text-white font-extrabold text-sm px-5 py-2.5 rounded-[10px] whitespace-nowrap"
      >
        Согласен
      </button>
    </div>
  );
}
