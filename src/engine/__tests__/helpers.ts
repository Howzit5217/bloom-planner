import { makeReq, parseLevelTable } from '../levels';
import type { DayEntry, LevelTable, Overrides, Profile, StepsMode } from '../types';

/** Small synthetic table: level L>=3 needs `steps` and `flowers`, with a chosen steps mode. */
export function table(rows: Array<{ level: number; steps: number; flowers: number; stepsMode?: StepsMode }>, maxLevel?: number): LevelTable {
  const max = maxLevel ?? Math.max(...rows.map((r) => r.level));
  const all = [];
  for (let l = 1; l <= max; l++) {
    const r = rows.find((x) => x.level === l);
    all.push({ level: l, steps: r?.steps ?? 0, flowers: r?.flowers ?? 0, task: '', stepsMode: r?.stepsMode ?? 'perLevel', source: 'wiki' });
  }
  return parseLevelTable({ maxLevel: max, levels: all, extrapolation: {} });
}

export const reqOf = (t: LevelTable, o: Overrides = {}) => makeReq(t, o);

export function profile(p: Partial<Profile> = {}): Profile {
  return {
    currentLevel: 1,
    stepsIntoLevel: 0,
    flowersIntoLevel: 0,
    setupTodaySteps: 0,
    setupTodayFlowers: 0,
    lifetimeSteps: null,
    lifetimeFlowers: null,
    goalLevel: 2,
    goalDate: '2027-01-01',
    rates: { walkStepsPerHour: null, bikeFlowersPerHour: null, bikeStepsPerHour: null, walkFlowersPerHour: null, treadmillAvailable: true },
    createdAt: '2026-11-04T12:00:00.000Z',
    startDate: '2026-11-04',
    ...p,
  };
}

export function entry(date: string, steps: number, flowers: number, e: Partial<DayEntry> = {}): DayEntry {
  return { date, steps, flowers, leveledUp: false, newLevel: null, note: null, minutesOut: null, outMode: null, gameStepsToGo: null, gameFlowersToGo: null, ...e };
}

export const ALL_RIDEABLE = new Array(12).fill(1);
