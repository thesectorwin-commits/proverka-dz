import SiteHeader from '@/components/SiteHeader';

// Шапка только для основного сайта (лендинг, личный кабинет, вход) —
// намеренно НЕ в корневом layout, чтобы не показывать её на админке
// (секретный путь app/SD$37HVhlk$2), у которой своя отдельная сессия
// и своё оформление.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {/* Шапка теперь position:fixed (см. комментарий в SiteHeader.tsx) и
          убрана из потока — этот спейсер занимает ровно её высоту, чтобы
          контент под ней не начинался из-под шапки. С 06.09.2026 сама
          шапка стала выше на env(safe-area-inset-top) (прозрачный
          статус-бар в PWA, см. app/layout.tsx) — спейсер учитывает то же
          самое, иначе контент вновь окажется под шапкой ровно на высоту
          этой прибавки. */}
      <div className="h-[calc(3.5rem+env(safe-area-inset-top))]" aria-hidden="true" />
      {children}
    </>
  );
}
