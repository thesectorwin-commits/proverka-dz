'use client';

import { useCallback, useEffect, useRef } from 'react';
import { beginTouchDrag, endTouchDrag } from '@/lib/touchDragGuard';

export type CropRange = { yStart: number; yEnd: number };

type Props = {
  imageUrl: string;
  value: CropRange;
  onChange: (next: CropRange) => void;
};

const MIN_HEIGHT = 10;

type DragState =
  | { kind: 'move'; startClientY: number; startRange: CropRange }
  | { kind: 'top' | 'bottom'; startRange: CropRange };

// Полоса-выделение поверх фото для раздела "Подсказать" (см. CLAUDE.md,
// 27.08.2026) — заменяет прежний авто-детект заданий моделью. Ребёнок сам
// двигает и сужает область, но ТОЛЬКО по вертикали (двигать тело полосы,
// тянуть верхний/нижний край) — по горизонтали полоса всегда занимает всю
// ширину фото, без ручной регулировки. Ось изначально сделали наоборот
// (горизонталь ручная, вертикаль всегда полная) по прямой просьбе
// владельца — но на реальном фото оказалось, что на большинстве страниц
// задания идут друг под другом (отличаются именно по Y), а не по X, так
// что горизонтальное сужение не помогало выбрать конкретное задание. Ось
// поменяли местами в тот же день, как только это стало видно на скриншоте.
export default function CropSelector({ imageUrl, value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const percentFromClientY = useCallback((clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return 0;
    return Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
  }, []);

  // Подстраховка сверх touch-action:none (className + inline style ниже):
  // на некоторых реальных телефонах touch-action один не спасал — палец
  // всё равно уводил страницу в скролл вместо перетаскивания полосы.
  // Настоящий, НЕ пассивный (`{ passive: false }`) обработчик touchmove на
  // самом DOM-узле надёжнее: пока идёт перетаскивание (dragRef.current не
  // пуст), явно глушим нативный скролл на уровне подлинного touch-события,
  // а не только React-события.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function blockScrollDuringDrag(e: TouchEvent) {
      if (dragRef.current) e.preventDefault();
    }
    el.addEventListener('touchmove', blockScrollDuringDrag, { passive: false });
    return () => el.removeEventListener('touchmove', blockScrollDuringDrag);
  }, []);

  function onBodyPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    beginTouchDrag();
    dragRef.current = { kind: 'move', startClientY: e.clientY, startRange: value };
  }

  function onEdgePointerDown(edge: 'top' | 'bottom') {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      beginTouchDrag();
      dragRef.current = { kind: edge, startRange: value };
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    const currentPercent = percentFromClientY(e.clientY);

    if (drag.kind === 'move') {
      const startPercent = percentFromClientY(drag.startClientY);
      const delta = currentPercent - startPercent;
      const height = drag.startRange.yEnd - drag.startRange.yStart;
      let yStart = drag.startRange.yStart + delta;
      let yEnd = drag.startRange.yEnd + delta;
      if (yStart < 0) {
        yStart = 0;
        yEnd = height;
      }
      if (yEnd > 100) {
        yEnd = 100;
        yStart = 100 - height;
      }
      onChange({ yStart, yEnd });
    } else if (drag.kind === 'top') {
      const yStart = Math.max(0, Math.min(currentPercent, drag.startRange.yEnd - MIN_HEIGHT));
      onChange({ yStart, yEnd: drag.startRange.yEnd });
    } else {
      const yEnd = Math.min(100, Math.max(currentPercent, drag.startRange.yStart + MIN_HEIGHT));
      onChange({ yStart: drag.startRange.yStart, yEnd });
    }
  }

  function onPointerUp() {
    if (dragRef.current) endTouchDrag();
    dragRef.current = null;
  }

  return (
    // ref на ВНЕШНЕМ, НЕ обрезающем контейнере (без overflow-hidden) — важно:
    // полоса и маркеры вынесены за пределы скруглённого/обрезающего блока с
    // фото (см. ниже), чтобы маркер у самого края (yStart≈0 или yEnd≈100) не
    // обрезался рамкой overflow-hidden и оставался кликабельным целиком.
    <div ref={containerRef} className="relative w-full select-none">
      <div className="rounded-2xl overflow-hidden border border-ink/10 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Загруженное фото задания"
          draggable={false}
          className="w-full h-auto block select-none pointer-events-none"
        />

        {/* Затемнение вне выбранной полосы — наглядно показывает, что именно
            отправится на объяснение. Специально ВНУТРИ обрезающего блока —
            красиво скругляется по углам вместе с фото. */}
        <div className="absolute inset-x-0 top-0 bg-black/35 pointer-events-none" style={{ height: `${value.yStart}%` }} />
        <div
          className="absolute inset-x-0 bottom-0 bg-black/35 pointer-events-none"
          style={{ height: `${100 - value.yEnd}%` }}
        />
      </div>

      <div
        onPointerDown={onBodyPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-x-0 border-y-[3px] border-pencilOrange bg-pencilOrange/10 cursor-grab active:cursor-grabbing touch-none"
        style={{ top: `${value.yStart}%`, height: `${value.yEnd - value.yStart}%`, touchAction: 'none' }}
      >
        {/* onPointerMove/onPointerUp/onPointerCancel продублированы на каждом
            маркере (не только на теле полосы) — после setPointerCapture на
            ВЛОЖЕННОМ маркере последующие pointermove у touch-указателей на
            практике не всегда доходят до обработчика родителя всплытием
            (в отличие от мыши, где всплытие срабатывало надёжно) — обнаружено
            реальным тестом на телефоне. Проще и надёжнее повесить те же
            обработчики прямо на маркер, чем полагаться на всплытие. */}
        {/* Зажимы сознательно НЕ на одной линии друг с другом — верхний
            справа, нижний по центру — по просьбе владельца (28.08.2026,
            уточнение после первой диагональной раскладки). */}
        <div
          onPointerDown={onEdgePointerDown('top')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute -top-3.5 right-4 h-7 w-16 rounded-full bg-pencilOrange shadow-[0_2px_8px_rgba(0,0,0,0.3)] touch-none flex items-center justify-center"
          style={{ touchAction: 'none' }}
          aria-label="Двигать верхнюю границу"
        >
          <span className="h-1 w-7 bg-white/80 rounded-full" aria-hidden="true" />
        </div>
        <div
          onPointerDown={onEdgePointerDown('bottom')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 h-7 w-16 rounded-full bg-pencilOrange shadow-[0_2px_8px_rgba(0,0,0,0.3)] touch-none flex items-center justify-center"
          style={{ touchAction: 'none' }}
          aria-label="Двигать нижнюю границу"
        >
          <span className="h-1 w-7 bg-white/80 rounded-full" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
