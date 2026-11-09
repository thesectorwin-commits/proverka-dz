// Общий ключ localStorage + событие для баннера cookie
// (components/CookieBanner.tsx) и кнопки "Установить приложение" на
// главной (components/InstallPwaButton.tsx, variant="outline") — им нужно
// синхронизированно знать, дал ли пользователь согласие на cookie: пока не
// дал, кнопка "Установить приложение" временно не рендерится вовсе (баннер
// теперь стоит впритык к самому низу экрана, см. CookieBanner.tsx, и класть
// кнопку поверх/под него было бы либо перекрытием, либо гаданием точной
// высоты баннера, который может занимать 1 или 2 строки в зависимости от
// ширины экрана).
export const COOKIE_CONSENT_KEY = 'cookie-consent-accepted';
export const COOKIE_CONSENT_EVENT = 'cookie-consent-changed';

export function hasCookieConsent(): boolean {
  if (typeof window === 'undefined') return true;
  return Boolean(localStorage.getItem(COOKIE_CONSENT_KEY));
}
