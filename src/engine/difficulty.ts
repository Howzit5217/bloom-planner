import { timeCost } from './timecost';
import type { ResolvedRates } from './types';


/** How hard a plan is, easiest first. Shown as a flower: white, yellow, red, then blue. */
export type Difficulty = 'easy' | 'steady' | 'hard' | 'veryHard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'steady', 'hard', 'veryHard'];

/** The most time on the move, on a riding day, for each grade (very hard is anything above). */
export const DIFFICULTY_HOURS = { easy: 1.5, steady: 3, hard: 4.5 } as const;

export interface PlanDifficulty {
  level: Difficulty;
  /** Walking for the steps plus biking for the flowers, on a riding day at the plan's busiest. */
  hours: number;
  /** The plan still needs flowers, so some days are riding days. */
  riding: boolean;
}

export function difficultyOfHours(hours: number): Difficulty {
  if (hours <= DIFFICULTY_HOURS.easy) return 'easy';
  if (hours <= DIFFICULTY_HOURS.steady) return 'steady';
  if (hours <= DIFFICULTY_HOURS.hard) return 'hard';
  return 'veryHard';
}

/**
 * Grade a plan by the time it asks of you: the steps a day plus the flowers on a riding day, at
 * your own walking and biking rates. Riding earns no steps, so a riding day needs both.
 */
export function planDifficulty(stepsPerDay: number, flowersPerRideDay: number, rates: Pick<ResolvedRates, 'walkStepsPerHour' | 'bikeFlowersPerHour' | 'walkFlowersPerHour' | 'treadmillAvailable' | 'bikes'>): PlanDifficulty {
  const flowers = Number.isFinite(flowersPerRideDay) ? flowersPerRideDay : 0;
  const hours = timeCost(stepsPerDay, flowers, rates).totalRideDay;
  return { level: difficultyOfHours(hours), hours, riding: rates.bikes && flowers > 0 };
}
