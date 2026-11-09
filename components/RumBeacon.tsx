'use client';

import { useEffect } from 'react';

// Диагностика медленных заходов с реальных устройств (самохостинг в РФ, мобильные сети). После загрузки страницы
// отправляет на /api/rum только ТАЙМИНГИ этапов (поиск адреса, соединение, TLS, ожидание ответа, скачивание) —
// никаких персональных данных, текста страниц, аккаунта и т.п. Сервер записывает их в журнал, только если
// включена переменная RUM_LOG=1 (на Vercel её нет — там это ничего не делает).
export default function RumBeacon() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    const send = () => {
      try {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (!nav) return;
        const ms = (n: number) => Math.max(0, Math.round(n));
        const nv = navigator as Navigator & { standalone?: boolean; connection?: { effectiveType?: string } };
        const data = {
          path: location.pathname,
          type: nav.type, // navigate | reload | back_forward | prerender
          proto: nav.nextHopProtocol || '',
          sw: nav.workerStart > 0 ? 1 : 0, // 1 — страницу обслуживал service worker
          standalone: nv.standalone === true || window.matchMedia('(display-mode: standalone)').matches ? 1 : 0,
          net: nv.connection?.effectiveType || '',
          start: ms(nav.fetchStart), // до начала запроса (запуск SW, редиректы)
          dns: ms(nav.domainLookupEnd - nav.domainLookupStart),
          connect: ms(nav.connectEnd - nav.connectStart), // TCP + TLS
          tls: nav.secureConnectionStart > 0 ? ms(nav.connectEnd - nav.secureConnectionStart) : 0,
          wait: ms(nav.responseStart - nav.requestStart), // ожидание первого байта после отправки запроса
          download: ms(nav.responseEnd - nav.responseStart),
          dcl: ms(nav.domContentLoadedEventEnd),
          load: ms(nav.loadEventEnd || performance.now())
        };
        navigator.sendBeacon('/api/rum', new Blob([JSON.stringify(data)], { type: 'application/json' }));
      } catch {
        // диагностика не должна ломать страницу
      }
    };

    if (document.readyState === 'complete') {
      setTimeout(send, 0);
    } else {
      window.addEventListener('load', () => setTimeout(send, 0), { once: true });
    }
  }, []);

  return null;
}
