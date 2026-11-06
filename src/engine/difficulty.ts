import { addDaysKey, daysBetween, type DayKey } from './dates';
import { checkGoal, beyondReason, MAX_STEPS_EVERY_DAY, type GoalCheck, type GoalCheckInput } from './goalCheck';
import { peakFlowersPerRideDay, peakStepsPerDay, type Plan } from './plan';
import { timeCost } from './timecost';
import type { ResolvedRates } from './types';

/**
 * How hard a plan is, easiest first. Shown as a flower: white, yellow, red, blue, then deep purple
 * (a Purple Pikmin's heavy load) for an extreme one: 50,000 steps a day or more, or past what's
 * realistic (kept only when the player insists).
 */
export type Difficulty = 'easy' | 'steady' | 'hard' | 'veryHard' | 'extreme';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'steady', 'hard', 'veryHard', 'extreme'];

/**
 * Each grade's ceiling, in steps on an average day (riding counted as the steps the same time would
 * walk): under 6,000 is easy; 50,000 and up is extreme.
 */
export const DIFFICULTY_STEPS = { easy: 6_000, steady: 12_000, hard: 20_000, veryHard: 50_000 } as const;

/** What a too-easy goal is nudged toward: the middle of a steady plan. */
export const CHALLENGE_STEPS = (DIFFICULTY_STEPS.easy + DIFFICULTY_STEPS.steady) / 2;

type DifficultyRates = Pick<ResolvedRates, 'walkStepsPerHour' | 'bikeFlowersPerHour' | 'walkFlowersPerHour' | 'treadmillAvailable' | 'bikes'>;

export interface PlanDifficulty {
  level: Difficulty;
  /** Time on the move on an average day: walking for the steps, plus riding for the flowers. */
  hours: number;
  /** The same time as steps at your walking pace: what the grade goes by. */
  steps: number;
  /** The plan still needs flowers, so some days are riding days. */
  riding: boolean;
}

/** A day's targets: steps, and the flowers on a riding day (or, without a bike, a day). */
export interface DayLoad {
  steps: number;
  flowers: number;
}

export function difficultyOfSteps(steps: number): Difficulty {
  if (steps < DIFFICULTY_STEPS.easy) return 'easy';
  if (steps < DIFFICULTY_STEPS.steady) return 'steady';
  if (steps < DIFFICULTY_STEPS.hard) return 'hard';
  if (steps < DIFFICULTY_STEPS.veryHard) return 'veryHard';
  return 'extreme';
}

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/**
 * Grade a plan by its average day: the steps, plus the riding for the flowers counted as the steps
 * that time would walk at your own pace (riding earns no steps, so a riding day needs both; without
 * a bike, the walking plants the flowers too). Busiest days past the realistic limits (too many
 * steps, or too long riding) make it extreme too, whatever the average.
 */
export function planDifficulty(average: DayLoad, busiest: DayLoad, rates: DifficultyRates): PlanDifficulty {
  const flowers = finite(average.flowers);
  const hours = timeCost(finite(average.steps), flowers, rates).totalRideDay;
  const steps = hours * rates.walkStepsPerHour;
  const extreme = beyondReason(finite(busiest.steps), finite(busiest.flowers), rates) != null;
  return { level: extreme ? 'extreme' : difficultyOfSteps(steps), hours, steps, riding: rates.bikes && flowers > 0 };
}

/** A plan's difficulty, from its average day and its busiest. */
export function difficultyOfPlan(plan: Plan, rates: DifficultyRates): PlanDifficulty {
  return planDifficulty({ steps: plan.avgStepsPerDay, flowers: plan.avgFlowersPerRideDay }, { steps: peakStepsPerDay(plan), flowers: peakFlowersPerRideDay(plan) }, rates);
}

/** A checked goal's difficulty, when it has a plan to grade (an unrealistic one comes out extreme). */
export function checkDifficulty(check: GoalCheck | null, rates: DifficultyRates): PlanDifficulty | null {
  if (!check || check.plan?.status !== 'ok') return null;
  if (!check.ok && check.problem !== 'tooManySteps' && check.problem !== 'tooManyFlowers') return null;
  return difficultyOfPlan(check.plan, rates);
}

/** A goal past what's realistic whose average day is past what's possible at all (over 120,000 steps). */
export const pastPossible = (check: GoalCheck | null) => !!check && !check.ok && (check.problem === 'tooManySteps' || check.problem === 'tooManyFlowers') && check.plan?.status === 'ok' && check.plan.avgStepsPerDay > MAX_STEPS_EVERY_DAY;

/**
 * Whether a goal that isn't realistic can still be kept, if the player insists: it has a plan, and
 * its average day is still possible (busiest days past 120,000 are fine; every day isn't).
 */
export const canKeepAnyway = (check: GoalCheck | null) => !!check && !check.ok && (check.problem === 'tooManySteps' || check.problem === 'tooManyFlowers') && check.plan?.status === 'ok' && !pastPossible(check);

export interface MoreChallenge {
  /** The soonest date for the same level that's still a steady plan (null: none sooner). */
  date: DayKey | null;
  /** The highest level by the same date that's still a steady plan (null: none higher). */
  level: number | null;
}

/**
 * For a goal that's too easy: a shorter challenge (the same level sooner) and a bigger one (a
 * higher level by the same date), each as far as a comfortably steady plan goes. Sooner and higher
 * only ever get harder, so a binary search finds each.
 */
export function moreChallenge(input: GoalCheckInput, rates: DifficultyRates, maxLevel: number): MoreChallenge {
  const fits = (c: GoalCheck) => c.ok && (c.plan?.status !== 'ok' || difficultyOfPlan(c.plan, rates).steps <= CHALLENGE_STEPS);

  let date: DayKey | null = null;
  const days = daysBetween(input.startKey, input.goalKey);
  if (days > 0) {
    let lo = -1;
    let hi = days;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fits(checkGoal({ ...input, goalKey: addDaysKey(input.startKey, mid) }))) hi = mid;
      else lo = mid;
    }
    if (hi < days) date = addDaysKey(input.startKey, hi);
  }

  let level: number | null = null;
  let lo = input.goalLevel;
  let hi = maxLevel + 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fits(checkGoal({ ...input, goalLevel: mid }))) lo = mid;
    else hi = mid;
  }
  if (lo > input.goalLevel) level = lo;
  return { date, level };
}
