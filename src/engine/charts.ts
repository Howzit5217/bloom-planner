import { addDaysKey, daysBetween, fromKey, monthIndex, type DayKey } from './dates';
import { plannedForDay, planStateAt, remainingWork } from './plan';
import type { Dashboard } from './summary';
import type { DayEntry, Profile } from './types';

export interface BurnPoint {
  /** Days from the baseline plan's start (-1 = setup day). */
  x: number;
  date: DayKey;
  steps: number;
  flowers: number;
}

export interface BurnDown {
  plan: BurnPoint[];
  actual: BurnPoint[];
  totalDays: number;
  maxSteps: number;
  maxFlowers: number;
  todayX: number;
}

/** §6.4.1 Remaining steps and flowers to the goal: plan (dashed) vs actual (solid). */
export function burnDown(dash: Dashboard, profile: Profile): BurnDown {
  const base = dash.baseline;
  const goal = dash.goal.level;
  const startRem = remainingWork(base.start, goal, dash.req);
  const plan: BurnPoint[] = [{ x: -1, date: profile.startDate, steps: startRem.steps, flowers: startRem.flowers }];
  const n = Math.max(0, base.calendarDays);
  const stride = Math.max(1, Math.ceil(n / 120));
  for (let i = 0; i < n; i += stride) {
    const t = Math.min(n, i + 1);
    const rem = remainingWork(planStateAt(base, t), goal, dash.req);
    plan.push({ x: t - 1, date: addDaysKey(base.startKey, t - 1), steps: rem.steps, flowers: rem.flowers });
  }
  if (n > 0 && plan[plan.length - 1].x !== n - 1) plan.push({ x: n - 1, date: base.goalKey, steps: 0, flowers: 0 });
  const actual: BurnPoint[] = [{ x: -1, date: profile.startDate, steps: startRem.steps, flowers: startRem.flowers }];
  for (const d of dash.replay.days) {
    const rem = remainingWork(d.after, goal, dash.req);
    actual.push({ x: daysBetween(base.startKey, d.date), date: d.date, steps: rem.steps, flowers: rem.flowers });
  }
  return {
    plan,
    actual,
    totalDays: n,
    maxSteps: Math.max(1, startRem.steps),
    maxFlowers: Math.max(1, startRem.flowers),
    todayX: daysBetween(base.startKey, dash.today),
  };
}

export interface DailyBar {
  date: DayKey;
  steps: number;
  flowers: number;
  logged: boolean;
}

/** §6.4.2 The last 30 days (gaps stay gaps, never backfilled). */
export function dailyBars(entries: DayEntry[], today: DayKey, count = 30): DailyBar[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const out: DailyBar[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = addDaysKey(today, -i);
    const e = byDate.get(date);
    out.push({ date, steps: e?.steps ?? 0, flowers: e?.flowers ?? 0, logged: !!e });
  }
  return out;
}

export type TimelineStatus = 'done' | 'current' | 'future';
export interface TimelineItem {
  level: number;
  status: TimelineStatus;
  date: DayKey | null;
  projected: boolean;
  /**
   * How grown its flower is, 0..1: a level done is in full bloom; the one under way grows with how far
   * through it you are (from a young plant with a small flower opening); the next is a sprout, and the
   * ones after it just in leaf.
   */
  growth: number;
}

/** How grown the level under way is: from 0.4 (a young plant) up to 1, by how far through it you are. */
export const growthOf = (through: number) => 0.4 + 0.6 * Math.min(1, Math.max(0, through));

/** §6.4.3 Every level from the setup level to the goal. */
export function levelTimeline(dash: Dashboard, profile: Profile): TimelineItem[] {
  const items: TimelineItem[] = [];
  const proj = new Map(dash.projected.map((p) => [p.level, p.date]));
  // How far through the level under way: its steps and flowers, both needed.
  const through = (dash.rings.steps.fraction + dash.rings.flowers.fraction) / 2;
  for (let L = profile.currentLevel; L <= dash.goal.level; L++) {
    if (L <= dash.current.level) {
      const current = L === dash.current.level;
      items.push({ level: L, status: current ? 'current' : 'done', date: L === profile.currentLevel ? profile.startDate : dash.replay.reachedOn[L] ?? null, projected: false, growth: current ? growthOf(through) : 1 });
    } else {
      items.push({ level: L, status: 'future', date: proj.get(L) ?? null, projected: true, growth: L === dash.current.level + 1 ? 0.24 : 0.12 });
    }
  }
  return items;
}

export interface SeasonBar {
  /** 0-11 */
  month: number;
  year: number;
  /** Rideable days in the month (capacity). */
  rideDays: number;
  calendarDays: number;
  /** Flowers the plan expects in the month. */
  planned: number;
  /** Flowers actually logged in the month. */
  actual: number;
  rate: number;
}

/** §6.4.4 Twelve months from the current one: planted vs rideable-day capacity. */
export function seasonalView(dash: Dashboard, entries: DayEntry[], seasonRates: number[]): SeasonBar[] {
  const out: SeasonBar[] = [];
  const t = fromKey(dash.today);
  const plan = dash.plan;
  for (let k = 0; k < 12; k++) {
    const first = new Date(t.getFullYear(), t.getMonth() + k, 1);
    const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const m = first.getMonth();
    const rate = seasonRates[m] ?? 1;
    let planned = 0;
    for (let d = 0; d < daysIn; d++) {
      const key = addDaysKey(`${first.getFullYear()}-${String(m + 1).padStart(2, '0')}-01`, d);
      const i = daysBetween(plan.startKey, key);
      if (i >= 0 && i < plan.calendarDays) planned += plannedForDay(plan, i).expectedFlowers;
    }
    const actual = entries
      .filter((e) => monthIndex(e.date) === m && fromKey(e.date).getFullYear() === first.getFullYear())
      .reduce((s, e) => s + e.flowers, 0);
    out.push({ month: m, year: first.getFullYear(), rideDays: rate * daysIn, calendarDays: daysIn, planned, actual, rate });
  }
  return out;
}
