import { stepsCarryInto } from './levels';
import type { DayKey } from './dates';
import type { DayEntry, LevelState, Profile, ReqFn } from './types';

export interface LevelUpEvent {
  level: number;
  /** Fraction (0..1) of the day at which it happened in the model. */
  at: number;
  forced: boolean;
}

export interface ActivityResult {
  state: LevelState;
  levelUps: LevelUpEvent[];
  wastedSteps: number;
  wastedFlowers: number;
}

const EPS = 1e-9;

/**
 * Apply one day's activity to a level state.
 *
 * Within the day, steps and flowers accrue evenly. The level-up happens at the
 * moment BOTH requirements are met. At that moment:
 *   - flowers reset to 0. Anything planted beyond the quota before that moment is lost;
 *     only flowers planted after it count toward the next level.
 *   - steps carry over only when the next level still uses a lifetime step total (levels <= 100).
 *     From level 101 on, surplus steps are lost too.
 *
 * `capLevel` stops level-ups at that level (the user's own say-so); activity past it piles up as progress.
 */
export function applyActivity(
  start: LevelState,
  steps: number,
  flowers: number,
  req: ReqFn,
  capLevel: number,
): ActivityResult {
  const state: LevelState = { ...start };
  const levelUps: LevelUpEvent[] = [];
  let wastedSteps = 0;
  let wastedFlowers = 0;
  let t = 0;
  const rS = Math.max(0, steps);
  const rF = Math.max(0, flowers);
  for (let guard = 0; guard < 1000; guard++) {
    const remaining = 1 - t;
    const next = req(state.level + 1);
    if (state.level >= capLevel || !next) {
      state.steps += rS * remaining;
      state.flowers += rF * remaining;
      break;
    }
    const needS = Math.max(0, next.steps - state.steps);
    const needF = Math.max(0, next.flowers - state.flowers);
    const tS = needS <= EPS ? 0 : rS > 0 ? needS / rS : Infinity;
    const tF = needF <= EPS ? 0 : rF > 0 ? needF / rF : Infinity;
    const tUp = Math.max(tS, tF);
    if (tUp > remaining + EPS) {
      state.steps += rS * remaining;
      state.flowers += rF * remaining;
      break;
    }
    const stepsAt = state.steps + rS * tUp;
    const flowersAt = state.flowers + rF * tUp;
    const surplusS = Math.max(0, stepsAt - next.steps);
    wastedFlowers += Math.max(0, flowersAt - next.flowers);
    const carry = stepsCarryInto(req, state.level + 2);
    if (!carry) wastedSteps += surplusS;
    state.level += 1;
    state.steps = carry ? surplusS : 0;
    state.flowers = 0;
    t += tUp;
    levelUps.push({ level: state.level, at: Math.min(1, t), forced: false });
  }
  return { state, levelUps, wastedSteps, wastedFlowers };
}

/** Level up without the model's agreement (the user says so). Flowers reset; the step bank is kept where it legally carries. */
export function forceLevelUp(state: LevelState, req: ReqFn): LevelState {
  const next = req(state.level + 1);
  if (!next) return state;
  const carry = stepsCarryInto(req, state.level + 2);
  return {
    level: state.level + 1,
    steps: carry ? Math.max(0, state.steps - next.steps) : 0,
    flowers: 0,
  };
}

export interface ReplayDay {
  date: DayKey;
  entry: DayEntry;
  before: LevelState;
  after: LevelState;
  levelUps: LevelUpEvent[];
}

export interface ReplayResult {
  state: LevelState;
  days: ReplayDay[];
  /** Level -> date reached, for levels reached since setup. */
  reachedOn: Record<number, DayKey>;
  /** Requirements for the next level look met but the user hasn't said they levelled up. */
  readyToLevel: boolean;
}

export function initialState(profile: Profile): LevelState {
  return { level: profile.currentLevel, steps: profile.stepsIntoLevel, flowers: profile.flowersIntoLevel };
}

/**
 * Rebuild the current state from the setup snapshot plus every logged day, in date order.
 * The user's word wins: the model only levels up on days marked "I levelled up", and is forced
 * up to the level they report. A "game shows" sync on an entry replaces the modelled progress.
 */
export function replayLog(profile: Profile, entries: DayEntry[], req: ReqFn, maxLevel: number): ReplayResult {
  let state = initialState(profile);
  const days: ReplayDay[] = [];
  const reachedOn: Record<number, DayKey> = {};
  const sorted = [...entries].filter((e) => e.date >= profile.startDate).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const entry of sorted) {
    const before = { ...state };
    let s = Math.max(0, entry.steps);
    let f = Math.max(0, entry.flowers);
    if (entry.date === profile.startDate) {
      s = Math.max(0, s - profile.setupTodaySteps);
      f = Math.max(0, f - profile.setupTodayFlowers);
    }
    const target = entry.leveledUp
      ? Math.min(maxLevel, Math.max(state.level, entry.newLevel ?? state.level + 1))
      : state.level;
    const res = applyActivity(state, s, f, req, target);
    state = res.state;
    const levelUps = [...res.levelUps];
    while (state.level < target) {
      state = forceLevelUp(state, req);
      levelUps.push({ level: state.level, at: 1, forced: true });
    }
    const next = req(state.level + 1);
    if (next) {
      if (entry.gameStepsToGo != null) {
        const synced = Math.max(0, next.steps - entry.gameStepsToGo);
        // "0 to go" on a lifetime level can hide a bank; keep the model's bank in that case.
        state.steps = entry.gameStepsToGo === 0 && state.steps > synced ? state.steps : synced;
      }
      if (entry.gameFlowersToGo != null) state.flowers = Math.max(0, next.flowers - entry.gameFlowersToGo);
    }
    for (const lu of levelUps) reachedOn[lu.level] = entry.date;
    days.push({ date: entry.date, entry, before, after: { ...state }, levelUps });
  }
  const next = req(state.level + 1);
  const readyToLevel = !!next && state.steps >= next.steps && state.flowers >= next.flowers;
  return { state, days, reachedOn, readyToLevel };
}

/** Fraction of the next level done, judged by the requirement that's further behind (0..1). */
export function levelFraction(state: LevelState, req: ReqFn): number {
  const next = req(state.level + 1);
  if (!next) return 1;
  const fs = next.steps > 0 ? Math.min(1, state.steps / next.steps) : 1;
  const ff = next.flowers > 0 ? Math.min(1, state.flowers / next.flowers) : 1;
  return Math.min(fs, ff);
}

/** Monotone position: level plus fraction toward the next one. */
export const position = (state: LevelState, req: ReqFn): number => state.level + Math.min(0.999999, levelFraction(state, req));
