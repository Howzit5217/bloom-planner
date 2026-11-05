import { addDaysKey, daysBetween, type DayKey } from './dates';
import { planStateAt, type Plan } from './plan';
import { position } from './progress';
import type { LevelState, ReqFn } from './types';

export type Verdict = 'ahead' | 'onPace' | 'behind' | 'reached' | 'notStarted';

export interface Standing {
  verdict: Verdict;
  /** Positive = ahead of the plan, negative = behind. In days of the plan's own schedule. */
  gapDays: number;
  /** Whole days shown to the user. */
  displayDays: number;
  /** Plan position (level + fraction) on the comparison date vs where the user actually is. */
  planPosition: number;
  actualPosition: number;
  asOf: DayKey;
}

/**
 * §7.6 Ahead or behind.
 *
 * `baseline` is the plan built from the setup snapshot on the setup date (with today's goal, overrides
 * and seasons). We find the plan time at which the plan reaches the position the user is actually at,
 * and compare it with the current plan time. The gap is in days of the plan's own per-level schedule,
 * so being half a level behind on a level the plan gives 30 days to reads as ~15 days behind.
 *
 * The comparison date is today when today is logged, otherwise yesterday, so mornings don't read as behind.
 */
export function standing(baseline: Plan, actual: LevelState, req: ReqFn, today: DayKey, loggedToday: boolean): Standing {
  const asOf = loggedToday ? today : addDaysKey(today, -1);
  const tNow = Math.max(0, daysBetween(baseline.startKey, asOf) + 1);
  const actualPos = position(actual, req);
  const goalPos = baseline.goalLevel;
  if (actual.level >= baseline.goalLevel) {
    return { verdict: 'reached', gapDays: Math.max(0, baseline.calendarDays - tNow), displayDays: Math.max(0, Math.floor(baseline.calendarDays - tNow)), planPosition: goalPos, actualPosition: actualPos, asOf };
  }
  if (baseline.status !== 'ok') {
    return { verdict: 'notStarted', gapDays: 0, displayDays: 0, planPosition: actualPos, actualPosition: actualPos, asOf };
  }
  const posAt = (t: number) => position(planStateAt(baseline, t), req);
  const planNow = posAt(tNow);
  let tStar: number;
  const endPos = posAt(baseline.endT);
  if (actualPos >= endPos) {
    tStar = baseline.endT;
  } else if (actualPos <= posAt(0)) {
    tStar = 0;
  } else {
    let lo = 0;
    let hi = baseline.endT;
    for (let i = 0; i < 60 && hi - lo > 1e-6; i++) {
      const mid = (lo + hi) / 2;
      if (posAt(mid) >= actualPos) hi = mid;
      else lo = mid;
    }
    tStar = hi;
  }
  // Before the plan's first day there is nothing to be behind on.
  if (tNow === 0 && tStar === 0) {
    return { verdict: 'onPace', gapDays: 0, displayDays: 0, planPosition: planNow, actualPosition: actualPos, asOf };
  }
  const gap = tStar - tNow;
  const whole = Math.floor(Math.abs(gap) + 1e-9);
  const verdict: Verdict = whole < 1 ? 'onPace' : gap > 0 ? 'ahead' : 'behind';
  return { verdict, gapDays: gap, displayDays: whole, planPosition: planNow, actualPosition: actualPos, asOf };
}
