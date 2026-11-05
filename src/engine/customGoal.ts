// Past the top level there's no level to aim for, so the goal is the user's own: so many steps
// and flowers by a date ("1,000,000 steps and 600,000 flowers in two months").
import { addDaysKey, daysBetween, type DayKey } from './dates';
import type { CustomGoal, DayEntry } from './types';

export interface CustomProgress {
  steps: { done: number; need: number; remaining: number; fraction: number };
  flowers: { done: number; need: number; remaining: number; fraction: number };
  /** Days left including today (0 once the end date has gone by). */
  daysLeft: number;
  /** What each remaining day needs to finish on time. */
  stepsPerDay: number;
  flowersPerDay: number;
  reached: boolean;
  /** The end date has gone by without reaching it. */
  passed: boolean;
  /** Ahead (+) or behind (-) an even pace, in days. */
  aheadDays: number;
}

const part = (done: number, need: number) => ({ done, need, remaining: Math.max(0, need - done), fraction: need > 0 ? Math.min(1, done / need) : 1 });

/** Progress toward a custom goal from the days logged between its start and end dates. */
export function customProgress(goal: CustomGoal, entries: DayEntry[], today: DayKey, loggedToday: boolean): CustomProgress {
  let steps = 0;
  let flowers = 0;
  for (const e of entries) {
    if (e.date < goal.startDate || e.date > goal.endDate) continue;
    steps += Math.max(0, e.steps);
    flowers += Math.max(0, e.flowers);
  }
  const s = part(steps, goal.steps);
  const f = part(flowers, goal.flowers);
  const reached = s.remaining === 0 && f.remaining === 0;
  // Today still counts while it isn't logged; after that the plan starts tomorrow.
  const from = loggedToday ? addDaysKey(today, 1) : today;
  const daysLeft = Math.max(0, daysBetween(from, goal.endDate) + 1);
  const passed = !reached && daysBetween(goal.endDate, today) > (loggedToday ? -1 : 0);
  const total = Math.max(1, daysBetween(goal.startDate, goal.endDate) + 1);
  const elapsed = Math.min(total, Math.max(0, daysBetween(goal.startDate, from)));
  // Judged by whichever is further behind an even pace.
  const fraction = Math.min(s.fraction, f.fraction);
  const aheadDays = Math.round(fraction * total - elapsed);
  return {
    steps: s,
    flowers: f,
    daysLeft,
    stepsPerDay: daysLeft > 0 ? Math.ceil(s.remaining / daysLeft) : s.remaining,
    flowersPerDay: daysLeft > 0 ? Math.ceil(f.remaining / daysLeft) : f.remaining,
    reached,
    passed,
    aheadDays,
  };
}
