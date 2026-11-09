import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import PullToRefresh from '@/components/PullToRefresh';
import RumBeacon from '@/components/RumBeacon';

export const metadata: Metadata = {
  title: 'Проверка домашнего задания по фото тетради',
  description: 'Сервис проверки домашних заданий 1-5 класс',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    // 06.09.2026: 'default' резервировал отдельную непрозрачную белую
    // полосу под статус-бар в установленном PWA, которую нельзя было
    // перекрасить ни фоном страницы, ни theme-color — на бежевых страницах
    // (главная, личный кабинет) она выглядела чужеродным белым швом сверху.
    // 'black-translucent' делает статус-бар прозрачным — сквозь него видно
    // собственный фон страницы. Требует явного отступа под контент шапки
    // на высоту статус-бара (env(safe-area-inset-top), см. SiteHeader.tsx
    // и спейсер в app/(site)/layout.tsx) — иначе лого/кнопка окажутся под
    // выемкой/чёлкой экрана.
    statusBarStyle: 'black-translucent',
    title: 'Проверка домашки'
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: '/icons/apple-touch-icon.png'
  }
};

// 09.09.2026: попытка отдавать viewport-fit=cover только установленному
// PWA (через ранний inline-скрипт, проверяющий navigator.standalone) не
// удалась — владелец подтвердил на реальном iPhone 11: белые полосы в
// обычной вкладке Safari никуда не делись (значит, дело было не в
// viewport-fit=cover, гипотеза с download.max.ru не подтвердилась), а
// в уже РАБОТАВШЕМ PWA вместо этого появился новый регресс — белая
// полоса в самой шапке (WebKit, судя по всему, не успевает/не умеет
// пересчитать env(safe-area-inset-*) по тегу, изменённому уже после
// начального парсинга). Откачено полностью — viewport-fit=cover снова
// стоит всегда и безусловно, как было исходно и как нужно для
// корректной работы PWA (см. комментарий про 'black-translucent' выше).
// Белые полосы в ОБЫЧНОЙ вкладке Safari на этом устройстве остаются
// неисправленными — подтверждённая нестабильность самой Safari,
// не устранённая ни одной из опробованных на сегодня митигаций
// (theme-color с media, переустановка через JS, отказ от viewport-fit).
export const viewport: Viewport = {
  themeColor: '#FFFEFB',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen">
        {children}
        <ServiceWorkerRegister />
        <RumBeacon />
        <PullToRefresh />
      </body>
    </html>
  );
}
