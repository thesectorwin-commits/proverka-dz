'use client';

import { PushStatus } from '@/lib/usePushSubscription';

export default function PushSubscribeButton({
  status,
  loading,
  subscribe,
  unsubscribe
}: {
  status: PushStatus;
  loading: boolean;
  subscribe: () => void;
  unsubscribe: () => void;
}) {
  if (status === 'unsupported' || status === 'checking') return null;

  const subscribed = status === 'subscribed';

  return (
    <div className="bg-white/85 border border-ink/[0.06] rounded-2xl shadow-sm overflow-hidden mb-4">
      <button
        type="button"
        role="switch"
        aria-checked={subscribed}
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left disabled:opacity-60"
      >
        <span className="w-[30px] h-[30px] rounded-lg bg-accent flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 7h16c0-1-2-2-2-7Z"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="#fff" strokeWidth="1.8" />
          </svg>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-medium text-ink">Push-уведомления</span>
          <span className="block text-[12px] text-inkSoft mt-0.5">
            {subscribed ? 'Включены на этом устройстве' : 'Сейчас выключены'}
          </span>
        </span>
        <span
          className={
            'shrink-0 w-11 h-6 rounded-full relative transition-colors ' +
            (subscribed ? 'bg-greenCheck' : 'bg-ink/15')
          }
        >
          <span
            className={
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ' +
              (subscribed ? 'translate-x-5' : '')
            }
          />
        </span>
      </button>
    </div>
  );
}
