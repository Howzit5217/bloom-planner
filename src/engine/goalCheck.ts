import { addDaysKey, daysBetween, type DayKey } from './dates';
import { buildPlan, peakFlowersPerRideDay, peakStepsPerDay, type DayWeights, type Plan } from './plan';
import { DEFAULT_RATES, flowerDays } from './rates';
import type { LevelState, ReqFn } from './types';

/** More steps than this in a day is not a reasonable plan, whatever the maths says. */
export const MAX_STEPS_PER_DAY = 50_000;
/**
 * More than this every day, on average, isn't possible at all: a goal like that can't be kept even
 * on purpose. A single day past it is fine (it has been done); day after day it isn't.
 */
export const MAX_STEPS_EVERY_DAY = 120_000;
/** More riding than this on a riding day is not reasonable either. */
export const MAX_RIDE_HOURS = 6;
/** How far ahead to look for the earliest reasonable date. */
const SEARCH_DAYS = 3650;

export interface GoalCheckInput {
  start: LevelState;
  /** First day of the plan (today, or tomorrow once today is logged). */
  startKey: DayKey;
  goalKey: DayKey;
  goalLevel: number;
  /** 12 monthly rideable-day rates. */
  seasonRates: number[];
  req: ReqFn;
  /** The user's biking rate: sets how many flowers a riding day can hold. */
  bikeFlowersPerHour: number;
  /** Rides a bike (the default). Without one, flowers come from walking, on any day. */
  bikes?: boolean;
  /** Flowers an hour on foot: sets how many a day can hold without a bike. */
  walkFlowersPerHour?: number;
  /** Walking days per month, and the forecast's own weights (see weatherPlan.ts). */
  walkRates?: number[];
  walkDays?: DayWeights;
  rideDays?: DayWeights;
}

export type GoalProblem = 'levelTooLow' | 'past' | 'noRideDays' | 'tooManySteps' | 'tooManyFlowers';

export interface GoalCheck {
  ok: boolean;
  problem: GoalProblem | null;
  /** The busiest day's steps and a riding day's flowers in this plan. */
  stepsPerDay: number;
  flowersPerRideDay: number;
  /** The most flowers a riding day (or, without a bike, a day) can reasonably take. */
  maxFlowersPerRideDay: number;
  /** Whether the flowers are planned from riding or from walking. */
  bikes: boolean;
  plan: Plan | null;
}

/**
 * Which realistic limit a day's targets go past, if any: too many steps, or more flowers than a
 * day's riding (or, without a bike, walking) can plant.
 */
export function beyondReason(stepsPerDay: number, flowersPerRideDay: number, rates: { bikes: boolean; bikeFlowersPerHour: number; walkFlowersPerHour?: number }): 'tooManySteps' | 'tooManyFlowers' | null {
  const rate = rates.bikes ? rates.bikeFlowersPerHour : (rates.walkFlowersPerHour ?? DEFAULT_RATES.walkFlowersPerHour);
  if (stepsPerDay > MAX_STEPS_PER_DAY) return 'tooManySteps';
  if (flowersPerRideDay > MAX_RIDE_HOURS * Math.max(1, rate)) return 'tooManyFlowers';
  return null;
}

export function checkGoal(input: GoalCheckInput): GoalCheck {
  const bikes = input.bikes !== false;
  const rate = bikes ? input.bikeFlowersPerHour : (input.walkFlowersPerHour ?? DEFAULT_RATES.walkFlowersPerHour);
  const maxFlowers = MAX_RIDE_HOURS * Math.max(1, rate);
  const base = { stepsPerDay: 0, flowersPerRideDay: 0, maxFlowersPerRideDay: maxFlowers, bikes };
  if (input.goalLevel <= input.start.level) return { ok: false, problem: 'levelTooLow', plan: null, ...base };
  if (daysBetween(input.startKey, input.goalKey) < 0) return { ok: false, problem: 'past', plan: null, ...base };
  // Riding needs fair weather; walking plants flowers on any day.
  const plan = buildPlan({
    ...input,
    seasonRates: bikes ? input.seasonRates : (input.walkRates ?? flowerDays(input.seasonRates, false)),
    walkRates: input.walkRates,
    walkDays: input.walkDays,
    flowerDays: bikes ? input.rideDays : input.walkDays,
  });
  if (plan.status === 'reached') return { ok: true, problem: null, plan, ...base };
  if (plan.status === 'noTime') return { ok: false, problem: 'past', plan, ...base };
  if (plan.status === 'noRideDays') return { ok: false, problem: 'noRideDays', plan, ...base, stepsPerDay: plan.avgStepsPerDay, flowersPerRideDay: Infinity };
  const stepsPerDay = peakStepsPerDay(plan);
  const flowersPerRideDay = peakFlowersPerRideDay(plan);
  const problem: GoalProblem | null = beyondReason(stepsPerDay, flowersPerRideDay, { bikes, bikeFlowersPerHour: input.bikeFlowersPerHour, walkFlowersPerHour: input.walkFlowersPerHour });
  return { ok: problem == null, problem, plan, stepsPerDay, flowersPerRideDay, maxFlowersPerRideDay: maxFlowers, bikes };
}

/**
 * The earliest goal date that is reasonable (within the step and riding limits), or null when
 * nothing within ten years is. Longer plans only ever get easier, so a binary search finds it.
 */
export function earliestReasonableDate(input: Omit<GoalCheckInput, 'goalKey'>): DayKey | null {
  if (input.goalLevel <= input.start.level) return null;
  const at = (n: number) => checkGoal({ ...input, goalKey: addDaysKey(input.startKey, n) }).ok;
  if (!at(SEARCH_DAYS)) return null;
  let lo = 0;
  let hi = SEARCH_DAYS;
  if (at(lo)) return input.startKey;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at(mid)) hi = mid;
    else lo = mid;
  }
  return addDaysKey(input.startKey, hi);
}
