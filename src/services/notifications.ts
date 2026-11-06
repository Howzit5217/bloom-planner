import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fromKey } from '@/engine/dates';
import type { Schedulable } from '@/engine/notifyPlan';
import { t } from '@/i18n';

const CHANNEL = 'daily';
/** The weather alerts have their own channel, so Android can quieten them apart from the check-in. */
const WEATHER_CHANNEL = 'weather';
const WEATHER_KINDS = new Set(['forecast', 'uv', 'rain', 'storm', 'snow', 'heat', 'cold']);


/** The phone app can always show notifications (once allowed). */
export const notificationsSupported = () => true;

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** The channels made (Android): a channel that couldn't be made isn't asked for, so its notifications still come, on the default one. */
const madeChannels = new Set<string>();

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  const make = async (id: string, name: string, description: string) => {
    try {
      await Notifications.setNotificationChannelAsync(id, { name, description, importance: Notifications.AndroidImportance.DEFAULT });
      madeChannels.add(id);
    } catch {
      // Expo Go can refuse to make channels; the permission prompt and the notifications go ahead without.
    }
  };
  await make(CHANNEL, t('Daily check-in'), t('One friendly reminder a day at most.'));
  await make(WEATHER_CHANNEL, t('Weather alerts'), t('The morning forecast, high UV, rain on the way, and storms, snow, heat or cold ahead.'));
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

const channelFor = (kind: string) => {
  const id = WEATHER_KINDS.has(kind) ? WEATHER_CHANNEL : CHANNEL;
  return madeChannels.has(id) ? { channelId: id } : {};
};

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
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, data: { kind: n.kind } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d, ...channelFor(n.kind) },
    });
  }
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
