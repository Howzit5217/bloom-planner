// How each kind of notification looks, the same in the app and the web version: a color (Android
// tints the flower icon and the app's name with it), the label shown beside the app's name, and its
// channel (Android lets each be quietened on its own). No emoji: the app uses none.
import { t } from '@/i18n';

export type ChannelId = 'daily' | 'weather' | 'severe' | 'milestone';

export interface NotificationLook {
  color: string;
  channel: ChannelId;
  /** Beside the app's name: what kind of notification it is. */
  label: () => string;
}

const LEAF = '#3C7A3E';
const SKY = '#3D8FD6';
const NECTAR = '#E8A317';
const ALERT = '#D9534F';

const CHECK_IN: NotificationLook = { color: LEAF, channel: 'daily', label: () => t('Daily check-in') };
const WEATHER: NotificationLook = { color: SKY, channel: 'weather', label: () => t('Weather alerts') };
const HARD_DAY: NotificationLook = { color: ALERT, channel: 'severe', label: () => t('Weather alerts') };
const MILESTONE: NotificationLook = { color: NECTAR, channel: 'milestone', label: () => t('Level-Up Coming') };

const LOOKS: Record<string, NotificationLook> = {
  daily: CHECK_IN,
  catchup: CHECK_IN,
  nudge: CHECK_IN,
  behind: CHECK_IN,
  milestone: MILESTONE,
  forecast: WEATHER,
  uv: WEATHER,
  rain: WEATHER,
  storm: HARD_DAY,
  snow: HARD_DAY,
  heat: HARD_DAY,
  cold: HARD_DAY,
  severe: HARD_DAY,
};

/** The look of a kind of notification. */
export const lookOf = (kind: string): NotificationLook => LOOKS[kind] ?? CHECK_IN;

/** The channels, as Android lists them in the app's notification settings. */
export const CHANNELS: Array<{ id: ChannelId; name: () => string; description: () => string; high?: boolean; color: string }> = [
  { id: 'daily', name: () => t('Daily check-in'), description: () => t('One friendly reminder a day at most.'), color: LEAF },
  { id: 'weather', name: () => t('Weather alerts'), description: () => t('The morning forecast, high UV, rain on the way, and storms, snow, heat or cold ahead.'), color: SKY },
  // A hard day ahead shows at the top of the screen, not only in the list.
  { id: 'severe', name: () => t('Storms, Snow, Heat and Cold'), description: () => t('The evening before a stormy, snowy, too hot or too cold day.'), high: true, color: ALERT },
  { id: 'milestone', name: () => t('Level-Up Coming'), description: () => t('When a level is about 2 days away.'), color: NECTAR },
];
