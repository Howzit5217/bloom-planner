import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fromKey } from '@/engine/dates';
import type { Schedulable } from '@/engine/notifyPlan';
import { CHANNELS, lookOf, type NotificationLook } from './notificationLook';

/** The phone app can always show notifications (once allowed). */
export const notificationsSupported = () => true;

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** The channels made (Android): a channel that couldn't be made isn't asked for, so its notifications still come, on the default one. */
const madeChannels = new Set<string>();

/** A short buzz for the everyday ones; two firmer ones before a hard day. */
const SOFT_BUZZ = [0, 120];
const FIRM_BUZZ = [0, 220, 140, 220];

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  for (const ch of CHANNELS) {
    try {
      // Android keeps a channel's importance, light and buzz as first made; the name and description
      // follow the app's language each time.
      await Notifications.setNotificationChannelAsync(ch.id, {
        name: ch.name(),
        description: ch.description(),
        importance: ch.high ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
        lightColor: ch.color,
        enableLights: true,
        enableVibrate: true,
        vibrationPattern: ch.high ? FIRM_BUZZ : SOFT_BUZZ,
        showBadge: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      madeChannels.add(ch.id);
    } catch {
      // Expo Go can refuse to make channels; the permission prompt and the notifications go ahead without.
    }
  }
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
export async function applySchedule(plan: Schedulable[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!plan.length || !(await hasPermission())) return;
  await ensureChannel();
  const now = Date.now();
  for (const n of plan) {
    const d = fromKey(n.date);
    d.setHours(n.hour, n.minute, 0, 0);
    if (d.getTime() <= now + 60_000) continue;
    const look = lookOf(n.kind);
    await Notifications.scheduleNotificationAsync({
      content: contentOf(n, look),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d, ...channelOf(look) },
    });
  }
}

/**
 * How it shows: the label beside the app's name (Android) or under the title (iPhone) says which
 * kind it is, and the color tints the flower icon and the app's name.
 */
function contentOf(n: Schedulable, look: NotificationLook): Notifications.NotificationContentInput {
  return {
    title: n.title,
    subtitle: look.label(),
    body: n.body,
    color: look.color,
    priority: look.channel === 'severe' ? Notifications.AndroidNotificationPriority.HIGH : Notifications.AndroidNotificationPriority.DEFAULT,
    data: { kind: n.kind },
  };
}

const channelOf = (look: NotificationLook) => (madeChannels.has(look.channel) ? { channelId: look.channel } : {});

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
