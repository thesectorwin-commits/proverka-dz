import type { Viewport } from 'next';

// 09.09.2026: реальный кейс — на iPhone 11 (iOS 26.4.1, обычная вкладка
// Safari, панель вкладок снизу) собственный статус-бар/свёрнутая адресная
// строка Safari оставались белыми, хотя единственный <meta name="theme-color">
// со значением #F4F1E9 присутствует в разметке корректно (проверено
// напрямую на проде) — известная нестабильность подкрашивания хрома в
// самой Safari, воспроизводится не на всех устройствах/сессиях одинаково.
// Один из задокументированных обходных путей — раздать ДВА тега с явным
// media (prefers-color-scheme: light/dark) вместо одного безусловного,
// раз Safari в некоторых версиях ищет именно такие теги. Цвет одинаковый
// для обеих схем — у сайта нет отдельной тёмной темы.
export function themeColorViewport(color: string): Pick<Viewport, 'themeColor'> {
  return {
    themeColor: [
      { media: '(prefers-color-scheme: light)', color },
      { media: '(prefers-color-scheme: dark)', color }
    ]
  };
}
