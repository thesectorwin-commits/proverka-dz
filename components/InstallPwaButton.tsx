'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { Manrope } from 'next/font/google';
import { detectPlatform, isStandalone, Platform } from '@/lib/platform';
import { COOKIE_CONSENT_EVENT, hasCookieConsent } from '@/lib/cookieConsent';

// Тот же шрифт, что и в редизайне главной/шапки (SiteHeader.tsx) — next/font
// дедуплицирует загрузку одного и того же шрифта/начертания между файлами,
// поэтому используется и здесь без доп. стоимости, ради единообразия — окно
// установки раньше выбивалось системным шрифтом на фоне остального сайта.
const manrope = Manrope({ subsets: ['latin', 'cyrillic'], weight: ['700', '800'] });

export default function InstallPwaButton({
  variant = 'solid'
}: {
  /** 'outline' — пунктирная пилюля со значком (см. app/(site)/page.tsx).
   * По умолчанию 'solid' — сегодняшний сплошной зелёный вид, используется
   * везде, где проп не передан явно (например, DashboardShell.tsx). */
  variant?: 'solid' | 'outline';
} = {}) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');
  // По умолчанию true (скрыта) — сервер не может знать про standalone-режим,
  // а useState(false) означало, что в SSR-разметке кнопка ВСЕГДА присутствовала
  // и на реальном устройстве в уже установленном PWA была видна долю секунды
  // до хоть какого-то клиентского JS, а потом резко пропадала. Раз ошибаться,
  // то в сторону "скрыть" — для обычных (не-PWA) пользователей кнопка просто
  // появится чуть позже, это гораздо менее заметно, чем мелькание.
  const [installed, setInstalled] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  // Только для variant="outline" (главная страница, см. её комментарий) —
  // пока пользователь не дал согласие на cookie, баннер cookie
  // (components/CookieBanner.tsx) стоит впритык к самому низу экрана, и
  // класть эту кнопку поверх/под него означало бы либо перекрытие, либо
  // гадание точной высоты баннера (1 или 2 строки текста в зависимости от
  // ширины экрана). Проще не рендерить кнопку вовсе, пока решение по
  // cookie не принято — по умолчанию true (не блокировать), чтобы не
  // усложнять поведение variant="solid" (DashboardShell.tsx), где баннера
  // cookie нет вообще.
  const [cookieAccepted, setCookieAccepted] = useState(true);

  useLayoutEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    if (variant === 'outline') setCookieAccepted(hasCookieConsent());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  useEffect(() => {
    if (variant !== 'outline') return;
    const onConsentChange = () => setCookieAccepted(true);
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsentChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsentChange);
  }, [variant]);

  if (installed) return null;
  if (variant === 'outline' && !cookieAccepted) return null;

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return (
    <>
      {variant === 'outline' ? (
        // 08.09.2026: сама "пилюля" (fixed-позиционирование, фон, рамка,
        // тень) теперь ЦЕЛИКОМ внутри компонента, а не в обёртке
        // app/(site)/page.tsx — раньше та обёртка оставалась в DOM даже
        // когда installed===true (кнопка внутри неё возвращала null), и
        // на реальном устройстве в уже установленном PWA было видно
        // пустой прямоугольник с рамкой (тонкая вертикальная черта —
        // w-fit без содержимого схлопывался почти до нуля по ширине,
        // но рамка/тень/фон оставались). Теперь весь блок пропадает
        // одним ранним return выше.
        <div
          className="fixed left-0 right-0 w-fit mx-auto z-[600] bg-[#F4F1E9] border border-ink/10 shadow-lg rounded-full py-1"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-3 bg-transparent text-ink font-extrabold text-base pl-2 pr-6 py-2 rounded-full transition-colors whitespace-nowrap"
          >
            <span
              aria-hidden="true"
              className="w-10 h-10 shrink-0 rounded-full bg-greenSoft text-greenCheck flex items-center justify-center text-lg"
            >
              📲
            </span>
            Установить приложение
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2.5 bg-greenCheck hover:bg-greenCheck/90 text-white font-extrabold text-base rounded-full px-7 py-3.5 shadow-[0_10px_24px_-8px_rgba(46,158,99,0.55)] transition-colors"
        >
          <span aria-hidden="true">📲</span> Установить приложение
        </button>
      )}

      {open && (
        // flex+overflow-y-auto на ОДНОМ и том же fixed-элементе (без лишней
        // вложенной обёртки с min-h-full) — первая версия с двумя вложенными
        // контейнерами вела себя непредсказуемо в WebKit: попап рендерился,
        // но сползал в самый низ прокручиваемой области вместо центра экрана
        // (реальный баг, найден по репорту с телефона + подтверждён
        // Playwright-скриншотом в эмуляции iPhone). my-auto на самой карточке
        // — доп. подстраховка центрирования при скролле.
        <div
          className="fixed inset-0 z-[2000] bg-ink/50 overflow-y-auto flex items-center justify-center p-5"
          onClick={() => setOpen(false)}
        >
          <div
            className={`${manrope.className} bg-white rounded-3xl shadow-2xl max-w-sm w-full p-7 my-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-greenSoft text-greenCheck text-2xl flex items-center justify-center mx-auto mb-4">
              📲
            </div>
            <h2 className="font-extrabold text-xl text-ink text-center mb-1">Установить на телефон</h2>
            <p className="text-center text-[13px] text-inkSoft mb-5">
              Иконка появится на главном экране, как у обычного приложения
            </p>

            {platform === 'ios' && (
              <div>
                <p className="text-[13.5px] text-inkSoft leading-relaxed text-center mb-4">
                  Работает только в браузере <strong className="text-ink">Safari</strong> (не в Chrome на
                  iPhone/iPad)
                </p>
                <div className="flex flex-col gap-3">
                  {[
                    <>
                      Нажмите значок «Поделиться» <span aria-hidden="true">⬆️</span> внизу экрана
                    </>,
                    'Выберите «На экран «Домой»»',
                    'Нажмите «Добавить»'
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="shrink-0 w-7 h-7 rounded-full border-2 border-dashed border-greenCheck bg-greenSoft text-greenCheck font-bold text-xs flex items-center justify-center">
                        {i + 1}
                      </span>
                      <p className="text-sm text-ink leading-relaxed mt-0.5 mb-0">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {platform === 'android' && (
              <div>
                {deferredPrompt ? (
                  <>
                    <p className="text-[13.5px] text-inkSoft leading-relaxed text-center mb-4">
                      Нажмите кнопку ниже, чтобы установить приложение
                    </p>
                    <button
                      type="button"
                      onClick={handleAndroidInstall}
                      className="w-full bg-greenCheck hover:bg-greenCheck/90 text-white font-extrabold rounded-xl py-3 transition-colors"
                    >
                      Установить
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    {[
                      'Откройте меню браузера (обычно значок ⋮ вверху справа)',
                      'Выберите «Установить приложение» или «Добавить на главный экран»'
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="shrink-0 w-7 h-7 rounded-full border-2 border-dashed border-greenCheck bg-greenSoft text-greenCheck font-bold text-xs flex items-center justify-center">
                          {i + 1}
                        </span>
                        <p className="text-sm text-ink leading-relaxed mt-0.5 mb-0">{step}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {platform === 'other' && (
              <p className="text-[13.5px] text-inkSoft leading-relaxed text-center">
                Откройте этот сайт на телефоне (Android или iPhone), чтобы установить приложение на главный
                экран
              </p>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full mt-6 text-inkSoft font-bold text-sm"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </>
  );
}
