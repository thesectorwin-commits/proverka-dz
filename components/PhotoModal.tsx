'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

// Полноэкранный просмотр фото решения — открывается по клику на превью в
// истории проверок. Клик по фону или на крестик закрывает.
//
// 09.10.2026: `maxWidthClass` — необязательный, по умолчанию `max-w-full`
// (прежнее поведение истории проверок не меняется). Добавлен ради
// components/DemoCheckSection.tsx — там фото открывалось почти на весь
// экран (реальный скриншот владельца, max-w-full в паре с max-h-full
// растягивает книжную страницу на всю доступную высоту вьюпорта), а на
// демо-блоке нужен более скромный размер просмотра.
//
// 09.10.2026, тот же день — реальный баг, пойманный Playwright-скриншотом:
// на главной странице крестика не было видно вообще (владелец: "нет
// крестика закрытия фотографии"). Причина — НЕ позиционирование (это уже
// чинили 08.09.2026), а CSS stacking context: `<main>` на главной
// (app/(site)/page.tsx) имеет `position: relative` + `z-[1]` (ради
// наложения на фоновый слой) — это создаёт собственный stacking context,
// и ЛЮБОЙ `position: fixed`-потомок внутри него (даже с z-[1200]) красится
// внутри этого контекста, а не сравнивается напрямую с шапкой сайта
// (SiteHeader, z-[1100], лежит СНАРУЖИ `<main>`, сосед по layout.tsx) — в
// итоге шапка (как часть стекового порядка body) рисуется ПОВЕРХ всего
// содержимого `<main>`, включая модалку, перекрывая крестик целиком.
// Поднимать z-index внутри `<main>` эту проблему не решает (контейнер
// всё равно ограничен снаружи своим z-[1]). Исправлено порталом —
// `createPortal` рендерит модалку прямо в `document.body`, минуя любой
// stacking context промежуточных предков, где бы PhotoModal ни
// монтировался (на истории проверок баг не проявлялся, но портал не
// меняет её поведение и делает оба места одинаково надёжными).
export default function PhotoModal({
  src,
  onClose,
  maxWidthClass = 'max-w-full'
}: {
  src: string;
  onClose: () => void;
  maxWidthClass?: string;
}) {
  // document недоступен при серверном рендере — портал монтируем только
  // после гидратации на клиенте (на первый кадр ничего не рендерим, что
  // безопасно: модалка и так открывается только по клику, уже на клиенте).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      // z-[1200] — выше шапки сайта (SiteHeader, z-[1100], sticky и видна
      // на всех страницах включая мобильный/PWA), иначе шапка перекрывает
      // крестик закрытия сверху экрана.
      className="fixed inset-0 z-[1200] bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* 08.09.2026: top-4 (16px от самого верха вьюпорта) не учитывал
          env(safe-area-inset-top) — в установленном PWA (statusBarStyle
          'black-translucent', см. app/layout.tsx) статус-бар прозрачный,
          и без этого отступа крестик оказывался прямо под/за системными
          иконками времени/батареи, а не под ними — тот же класс бага,
          что уже чинили для SiteHeader.tsx. Реальный кейс: владелец
          сообщил, что крестик "не работает" — на самом деле по нему
          просто нельзя было точно попасть пальцем в этой зоне. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
        className="absolute right-4 w-10 h-10 rounded-full bg-white/15 text-white text-2xl leading-none flex items-center justify-center hover:bg-white/25"
      >
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Фото решения ученика"
        className={`max-h-full rounded-lg shadow-2xl ${maxWidthClass}`}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
