'use client';

import PushSubscribeButton from '@/components/PushSubscribeButton';
import PushDevicesManager from '@/components/PushDevicesManager';
import ReminderSettings from '@/components/ReminderSettings';
import { PushStatus } from '@/lib/usePushSubscription';

export default function NotificationsTab({
  pushStatus,
  pushLoading,
  subscribe,
  unsubscribe
}: {
  pushStatus: PushStatus;
  pushLoading: boolean;
  subscribe: () => void;
  unsubscribe: () => void;
}) {
  return (
    <section>
      <PushSubscribeButton status={pushStatus} loading={pushLoading} subscribe={subscribe} unsubscribe={unsubscribe} />
      <ReminderSettings />
      <PushDevicesManager />
    </section>
  );
}
