import { addDaysKey, daysBetween, monthIndex, type DayKey } from './dates';
import { PRESETS } from './climate';
import type { Dashboard } from './summary';
import type { ThresholdPreset } from './types';

export interface NotifyPrefs {
  enabled: boolean;
  hour: number;
  minute: number;
  nudges: boolean;
  behind: boolean;
  milestones: boolean;
  lastBehindAlert: DayKey | null;
  nudgeDates: DayKey[];
  lastMilestoneLevel: number | null;
}

export interface ForecastLite {
  date: string;
  precipitation: number;
  precipitationChance: number;
  snowfall: number;
  tmax: number;
  wind: number;
}

export type NotifyKind = 'daily' | 'nudge' | 'behind' | 'milestone';

export interface PlannedNotification {
  date: DayKey;
  hour: number;
  minute: number;
  kind: NotifyKind;
  title: string;
  body: string;
  /** For milestones: the level announced. */
  level?: number;
}

export const NOTIFY_HORIZON_DAYS = 14;
const NUDGE_HOUR = 9;

const isClear = (f: ForecastLite, preset: ThresholdPreset) => {
  const th = PRESETS[preset];
  return f.precipitation < 1 && f.precipitationChance < 30 && f.snowfall <= 0 && f.tmax >= th.minTmax && f.tmax <= th.maxTmax && f.wind <= th.maxWind;
};

/**
 * §8 Local notifications, at most one per day, never guilt-tripping.
 * Priority on any day: milestone > behind-pace > ride nudge > daily reminder.
 * Pure: the caller schedules the result and records what was used.
 */
export function planNotifications(args: {
  prefs: NotifyPrefs;
  dash: Dashboard;
  seasonRates: number[];
  forecast: ForecastLite[];
  preset: ThresholdPreset;
  now: Date;
}): PlannedNotification[] {
  const { prefs, dash, seasonRates, forecast, preset, now } = args;
  if (!prefs.enabled) return [];
  const today = dash.today;
  const out: PlannedNotification[] = [];
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const reminderMinutes = prefs.hour * 60 + prefs.minute;
  const active = dash.phase === 'active';
  let behindUsed = false;
  let milestoneUsed = false;
  const recentNudges = prefs.nudgeDates.filter((d) => daysBetween(d, today) < 7).length;

  for (let i = 0; i < NOTIFY_HORIZON_DAYS; i++) {
    const date = addDaysKey(today, i);
    const isToday = i === 0;
    const reminderPassed = isToday && minutesNow >= reminderMinutes;
    let pick: PlannedNotification | null = null;

    // Milestone: a level-up projected within 2 days, announced once per level.
    const m = dash.nextMilestone;
    if (active && prefs.milestones && !milestoneUsed && m && m.level !== prefs.lastMilestoneLevel) {
      const lead = daysBetween(date, m.date);
      if (lead >= 0 && lead <= 2 && !reminderPassed) {
        milestoneUsed = true;
        pick = {
          date,
          hour: prefs.hour,
          minute: prefs.minute,
          kind: 'milestone',
          level: m.level,
          title: `Level ${m.level} is nearly here!`,
          body: lead === 0 ? 'At your pace it could land today.' : `About ${lead} day${lead === 1 ? '' : 's'} to go at your pace.`,
        };
      }
    }

    // Behind pace: at most once a week, only when the gap is over 5 days.
    if (!pick && active && prefs.behind && !behindUsed && dash.standing.verdict === 'behind' && dash.standing.displayDays > 5 && !reminderPassed) {
      const last = prefs.lastBehindAlert;
      if (!last || daysBetween(last, date) >= 7) {
        behindUsed = true;
        pick = {
          date,
          hour: prefs.hour,
          minute: prefs.minute,
          kind: 'behind',
          title: 'A little behind, no stress',
          body: `You're about ${dash.standing.displayDays} days behind. A couple of longer rides would close the gap.`,
        };
      }
    }

    // Ride nudge: tomorrow only (we need today's flowers and a forecast), high-rideable month, max 2 a week.
    if (!pick && active && prefs.nudges && i === 1 && recentNudges < 2) {
      const todayFlowers = dash.todayEntry ? dash.todayEntry.flowers : null;
      const f = forecast.find((x) => x.date === date);
      if (todayFlowers === 0 && f && (seasonRates[monthIndex(date)] ?? 0) >= 0.6 && isClear(f, preset)) {
        pick = {
          date,
          hour: NUDGE_HOUR,
          minute: 0,
          kind: 'nudge',
          title: 'Today looks lovely for a ride',
          body: 'Dry, bright and mild out there. A good day to plant some flowers.',
        };
      }
    }

    if (!pick) {
      if (isToday && (dash.loggedToday || reminderPassed)) continue;
      pick = { date, hour: prefs.hour, minute: prefs.minute, kind: 'daily', title: "How'd today go?", body: 'Pop in your steps and flowers. It takes ten seconds.' };
    }
    out.push(pick);
  }
  return out;
}
