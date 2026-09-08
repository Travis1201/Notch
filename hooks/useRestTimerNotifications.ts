import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';

import { useRestTimerStore } from '../store/restTimerStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// CLAUDE.md "Rest timer": fires a local notification when it ends (works phone
// locked/pocketed) plus a haptic on completion. Mount once at the session screen
// root. Permission is requested on the first start() — asks in context rather than
// at app boot — and requestPermissionsAsync is safe to call repeatedly afterward: it
// just returns the current status without re-prompting once resolved.
export function useRestTimerNotifications(): void {
  const endsAt = useRestTimerStore((s) => s.endsAt);
  const isRunning = useRestTimerStore((s) => s.isRunning);
  const scheduledIdRef = useRef<string | null>(null);
  const hapticFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function reschedule() {
      if (scheduledIdRef.current) {
        await Notifications.cancelScheduledNotificationAsync(scheduledIdRef.current);
        scheduledIdRef.current = null;
      }
      if (endsAt === null || !isRunning) return;

      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      const seconds = Math.max(1, Math.round((endsAt - Date.now()) / 1000));
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: 'Rest complete', body: 'Time for your next set.' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
      });
      if (!cancelled) scheduledIdRef.current = id;
    }

    hapticFiredRef.current = false;
    reschedule();

    return () => {
      cancelled = true;
    };
  }, [endsAt, isRunning]);

  useEffect(() => {
    if (!isRunning || endsAt === null) return;
    const interval = setInterval(() => {
      if (!hapticFiredRef.current && Date.now() >= endsAt) {
        hapticFiredRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        useRestTimerStore.getState().clear();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isRunning, endsAt]);
}
