'use client';

import { useEffect, useState } from 'react';

const CLIENT_DEVICE_ID_KEY = 'push-client-device-id';

// Стабильный ID этого браузера/устройства, переживает переподписку (у
// Web Push endpoint может смениться на том же физическом телефоне — сброс
// разрешений, особенности iOS и т.п.). Сервер использует его, чтобы не
// плодить дублирующиеся записи устройства при каждой новой подписке
// (см. app/api/push/subscribe/route.ts).
function getClientDeviceId(): string {
  let id = localStorage.getItem(CLIENT_DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_DEVICE_ID_KEY, id);
  }
  return id;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushStatus = 'checking' | 'unsupported' | 'subscribed' | 'unsubscribed';

// Общее состояние push-подписки для PushSubscribeButton (кнопка в
// "Настройка уведомлений") и IosPushPrompt (попап для iOS) — один хук,
// чтобы оба места не расходились в статусе, если пользователь подписался
// через одно из них, а не другое.
export function usePushSubscription(autoSubscribe: boolean) {
  const [status, setStatus] = useState<PushStatus>('checking');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || process.env.NODE_ENV !== 'production') {
        setStatus('unsupported');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setStatus('subscribed');
          return;
        }
        setStatus('unsubscribed');

        // Автоподписка при заходе в кабинет — по просьбе владельца проекта.
        // На iOS Safari requestPermission() без жеста пользователя не
        // покажет диалог вообще (WebKit это блокирует) — там реально
        // срабатывает только явный клик (см. IosPushPrompt.tsx).
        if (autoSubscribe && Notification.permission !== 'denied') {
          await subscribe();
        }
      } catch {
        setStatus('unsupported');
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function subscribe() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.warn('Уведомления пока не настроены на сервере: нет NEXT_PUBLIC_VAPID_PUBLIC_KEY');
      return;
    }
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), clientDeviceId: getClientDeviceId() })
      });
      setStatus('subscribed');
    } catch (err) {
      console.error('Не удалось подписаться на уведомления:', err);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
      }
      setStatus('unsubscribed');
    } finally {
      setLoading(false);
    }
  }

  return { status, loading, subscribe, unsubscribe };
}
