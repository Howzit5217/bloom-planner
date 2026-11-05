import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fromKey } from '@/engine/dates';
import type { PlannedNotification } from '@/engine/notifyPlan';

const CHANNEL = 'daily';

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Daily check-in',
    description: 'One friendly reminder a day at most.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function hasPermission(): Promise<boolean> {
  const s = await Notifications.getPermissionsAsync();
  return s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function requestPermission(): Promise<boolean> {
  // Android 13+ only shows the prompt once a channel exists.
  await ensureChannel();
  const s = await Notifications.requestPermissionsAsync();
  return s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Replace everything scheduled with the given plan. */
export async function applySchedule(plan: PlannedNotification[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!plan.length || !(await hasPermission())) return;
  await ensureChannel();
  const now = Date.now();
  for (const n of plan) {
    const d = fromKey(n.date);
    d.setHours(n.hour, n.minute, 0, 0);
    if (d.getTime() <= now + 60_000) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, data: { kind: n.kind } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d, channelId: CHANNEL },
    });
  }
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
