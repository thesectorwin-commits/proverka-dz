'use client';

import { useEffect, useRef, useState } from 'react';
import { isTouchDragActive } from '@/lib/touchDragGuard';

const THRESHOLD = 70; // px, которые нужно потянуть, чтобы сработало обновление
const MAX_PULL = 100;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

// Свайп вниз от самого верха страницы обновляет её, как в нативных
// приложениях. Работает только в установленном PWA (standalone) — в
// обычной вкладке браузера вмешиваться не нужно: на Android уже есть
// своё такое поведение, а на iOS Safari его осознанно нет вовсе.
export default function PullToRefresh() {
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    setEnabled(isStandalone());
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function onTouchStart(e: TouchEvent) {
      // 27.08.2026: не начинать отслеживать pull-to-refresh, если в этот
      // момент идёт перетаскивание в components/CropSelector.tsx (раздел
      // "Подсказать") — иначе сдвиг полосы/маркера вниз от верха экрана
      // ошибочно засчитывался как жест "потянуть для обновления" и
      // перезагружал страницу, сбрасывая весь экран. См. lib/touchDragGuard.ts.
      if (isTouchDragActive()) {
        startY.current = null;
        return;
      }
      startY.current = window.scrollY === 0 ? e.touches[0].clientY : null;
    }

    function onTouchMove(e: TouchEvent) {
      if (isTouchDragActive()) {
        startY.current = null;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY === 0) {
        e.preventDefault();
        const next = Math.min(delta * 0.5, MAX_PULL);
        pullRef.current = next;
        setPull(next);
      } else {
        startY.current = null;
        pullRef.current = 0;
        setPull(0);
      }
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        window.location.reload();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled]);

  if (!enabled || pull === 0) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[3000] flex justify-center pointer-events-none"
      style={{ transform: `translateY(${pull - 32}px)`, opacity: Math.min(pull / THRESHOLD, 1) }}
    >
      <span
        className={
          'w-8 h-8 mt-2 rounded-full border-[3px] border-gridLine border-t-pencilOrange bg-white shadow-md ' +
          (refreshing ? 'animate-spin motion-reduce:animate-none' : '')
        }
        style={!refreshing ? { transform: `rotate(${pull * 3}deg)` } : undefined}
        aria-hidden="true"
      />
    </div>
  );
}
