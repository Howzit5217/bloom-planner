import { cumulativeStepsTo } from './levels';
import type { ReqFn } from './types';

export interface ProgressInput {
  level: number;
  /** true: the numbers are what's LEFT (what the game shows). false: what's done so far. */
  remainingMode: boolean;
  steps: number;
  flowers: number;
  /** Optional lifetime step total; only used for lifetime-mode levels, to recover a banked surplus. */
  lifetimeSteps: number | null;
}

/** Progress into the next level from what the user typed. Clamped to the requirement. */
export function progressFromInput({ level, remainingMode, steps, flowers, lifetimeSteps }: ProgressInput, req: ReqFn) {
  const next = req(level + 1);
  if (!next) return { stepsIntoLevel: 0, flowersIntoLevel: 0, fromLifetime: false };
  let stepsInto = remainingMode ? next.steps - steps : steps;
  let fromLifetime = false;
  if (next.stepsMode === 'lifetime' && lifetimeSteps != null && lifetimeSteps > 0) {
    const banked = lifetimeSteps - cumulativeStepsTo(req, level);
    if (banked > stepsInto) {
      stepsInto = banked;
      fromLifetime = true;
    }
  }
  const flowersInto = remainingMode ? next.flowers - flowers : flowers;
  const maxSteps = next.stepsMode === 'lifetime' ? Number.MAX_SAFE_INTEGER : next.steps;
  return {
    stepsIntoLevel: Math.round(Math.min(maxSteps, Math.max(0, stepsInto))),
    flowersIntoLevel: Math.round(Math.min(next.flowers, Math.max(0, flowersInto))),
    fromLifetime,
  };
}
