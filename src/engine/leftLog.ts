// The What's Left log: each day the user enters what the game shows still to go (steps, flowers,
// the level's quest) instead of what they walked and planted. The day's steps and flowers are
// worked out from the change, so charts, streaks and real rates keep working.
import type { DayKey } from './dates';
import { stepsCarryInto } from './levels';
import { initialState, type ReplayResult } from './progress';
import type { DayEntry, LevelState, Profile, ReqFn } from './types';

/** Where the log stood just before `date`: after the last logged day before it, or the setup snapshot. */
export function stateBefore(replay: ReplayResult, profile: Profile, date: DayKey): { state: LevelState; taskToGo: number | null } {
  let last: ReplayResult['days'][number] | null = null;
  for (const d of replay.days) if (d.date < date && (!last || d.date > last.date)) last = d;
  return last ? { state: { ...last.after }, taskToGo: last.taskToGo } : { state: initialState(profile), taskToGo: null };
}

/**
 * Steps (or flowers) done on a day that ended at `toLevel` with `toGo` left for the level after it.
 * Levels passed on the way count in full from where the log stood; steps past a level's need carry
 * into the next where they do in the game (levels up to 100).
 */
export function doneFromToGo(before: LevelState, toLevel: number, kind: 'steps' | 'flowers', toGo: number, req: ReqFn): number {
  let total = 0;
  let have = before[kind];
  for (let lvl = before.level; lvl < toLevel; lvl++) {
    const need = req(lvl + 1)?.[kind] ?? 0;
    total += Math.max(0, need - have);
    have = kind === 'steps' && stepsCarryInto(req, lvl + 2) ? Math.max(0, have - need) : 0;
  }
  total += Math.max(0, (req(toLevel + 1)?.[kind] ?? 0) - toGo - have);
  return Math.round(total);
}

/**
 * More to go than before, with no level-up marked: the game has usually moved on to the next
 * level's numbers. (Only what was entered is compared.)
 */
export function looksLikeLevelUp(before: LevelState, taskBefore: number | null, req: ReqFn, entered: { steps: number | null; flowers: number | null; task: number | null }): boolean {
  const next = req(before.level + 1);
  if (!next) return false;
  if (entered.steps != null && entered.steps > Math.max(0, next.steps - before.steps)) return true;
  if (entered.flowers != null && entered.flowers > Math.max(0, next.flowers - before.flowers)) return true;
  return entered.task != null && taskBefore != null && entered.task > taskBefore;
}

/**
 * Filling in a missed day takes its share out of the next logged day, whose steps and flowers were
 * worked out from the same numbers to go. Returns that next day, adjusted, or null if nothing changes.
 */
export function rebalanceNext(entries: DayEntry[], saved: DayEntry, previous: DayEntry | null): DayEntry | null {
  let next: DayEntry | null = null;
  for (const e of entries) if (e.date > saved.date && (!next || e.date < next.date)) next = e;
  if (!next) return null;
  const dSteps = saved.steps - (previous?.steps ?? 0);
  const dFlowers = saved.flowers - (previous?.flowers ?? 0);
  const steps = next.gameStepsToGo != null ? Math.max(0, next.steps - dSteps) : next.steps;
  const flowers = next.gameFlowersToGo != null ? Math.max(0, next.flowers - dFlowers) : next.flowers;
  return steps === next.steps && flowers === next.flowers ? null : { ...next, steps, flowers };
}

/** The latest day since setup with nothing logged (yesterday or before), or yesterday when every day is logged; null on the setup day. */
export function missedDay(entries: DayEntry[], startDate: DayKey, today: DayKey, addDays: (k: DayKey, n: number) => DayKey): DayKey | null {
  const yesterday = addDays(today, -1);
  if (yesterday < startDate) return null;
  const logged = new Set(entries.map((e) => e.date));
  for (let k = yesterday, i = 0; k >= startDate && i < 1000; k = addDays(k, -1), i++) if (!logged.has(k)) return k;
  return yesterday;
}
