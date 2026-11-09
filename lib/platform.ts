// Определение платформы/режима запуска на клиенте — общее для
// InstallPwaButton и IosPushPrompt, поэтому вынесено отдельно.

export type Platform = 'ios' | 'android' | 'other';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';

  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+
  if (isIOS) return 'ios';

  if (/Android/.test(ua)) return 'android';

  return 'other';
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}
