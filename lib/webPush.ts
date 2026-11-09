import webpush from 'web-push';
import { supabaseServer } from '@/lib/supabaseServer';

// Web Push (VAPID) — отправка браузерных push-уведомлений в PWA.
// Публичный ключ уходит в браузер (NEXT_PUBLIC_...), приватный — только
// здесь, на сервере.

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

async function sendToSubscriptions(subs: Subscription[], payload: PushPayload) {
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: any) {
        failed++;
        // Подписка больше не действительна (пользователь удалил приложение,
        // отозвал разрешение и т.п.) — чистим её, чтобы не пытаться снова.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabaseServer.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Ошибка отправки push:', err?.message);
        }
      }
    })
  );

  return { sent, failed, total: subs.length };
}

export async function sendPushToUser(userId: string, payload: PushPayload, target?: 'parent' | 'child') {
  let query = supabaseServer
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (target) {
    query = query.eq('device_type', target);
  }
  const { data: subs } = await query;

  return sendToSubscriptions(subs || [], payload);
}

// Тестовый пуш на одно конкретное устройство — чтобы пользователь мог
// понять, какая именно физическая карточка в списке соответствует
// какому телефону (User-Agent не всегда отличает два одинаковых iPhone).
export async function sendTestPush(subscriptionId: string, userId: string, payload: PushPayload) {
  const { data: sub } = await supabaseServer
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!sub) {
    return { sent: 0, failed: 0, total: 0 };
  }

  return sendToSubscriptions([sub], payload);
}

export async function sendPushToAll(payload: PushPayload, target?: 'parent' | 'child') {
  let query = supabaseServer.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  if (target) {
    query = query.eq('device_type', target);
  }
  const { data: subs } = await query;
  return sendToSubscriptions(subs || [], payload);
}
