'use client';

import { useEffect } from 'react';

// 09.09.2026: доп. митигация к уже настроенному <meta name="theme-color">
// (см. lib/themeColor.ts) — реальный кейс, когда сама Safari (обычная
// вкладка, не PWA) не подкрашивала свой статус-бар/адресную строку,
// несмотря на корректный тег в разметке. Известная нестабильность именно
// Safari: иногда она заново вычисляет цвет хрома только при явном
// изменении DOM/видимости, а не один раз при первой загрузке. Здесь
// просто переустанавливаем content того же самого значения — на
// монтировании и при возврате видимости страницы (сворачивание/разворачивание
// вкладки, восстановление из bfcache при навигации назад/вперёд) — чтобы
// дать Safari лишний повод пересчитать. Не гарантирует исправление (это
// сторона браузера, не наша), но ничего не ломает при отсутствии эффекта.
//
// 09.09.2026, тот же день — новая находка владельца: сравнили с
// download.max.ru (у него в той же Safari белых полос нет). У них
// <body> имеет НАСТОЯЩИЙ (не через отдельный position:fixed слой,
// как у нас) сплошной background. У нас же <html> в globals.css
// белый (#FFFEFB, нужен для других страниц — вход/лендинг со своей
// тетрадной клеткой), а фактический бежевый фон рисует ОТДЕЛЬНЫЙ
// дочерний слой (см. app/(site)/page.tsx, DashboardShell.tsx) — сам
// <html>/<body> при этом остаются белыми на уровне их СОБСТВЕННОГО
// CSS-фона. Гипотеза: Safari при решении, чем красить свой хром,
// может ориентироваться на настоящий computed background html/body,
// а не только на theme-color. Явно проставляем реальный inline-фон на
// html И body (не только слой внутри React-дерева) — только на
// страницах, которые это делают (главная, дашборд), не трогая
// глобальный CSS (login/админка остаются как есть).
export default function ThemeColorSync({ color }: { color: string }) {
  useEffect(() => {
    function reassert() {
      document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
        el.setAttribute('content', color);
      });
      document.documentElement.style.backgroundColor = color;
      document.body.style.backgroundColor = color;
    }
    reassert();
    document.addEventListener('visibilitychange', reassert);
    window.addEventListener('pageshow', reassert);
    return () => {
      document.removeEventListener('visibilitychange', reassert);
      window.removeEventListener('pageshow', reassert);
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, [color]);

  return null;
}
