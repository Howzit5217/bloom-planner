import { addDaysKey, daysBetween, type DayKey } from './dates';
import { makeReq } from './levels';
import {
  buildPlan,
  peakFlowersPerRideDay,
  peakStepsPerDay,
  plannedForDay,
  projectedLevels,
  segmentAt,
  type Plan,
  type ProjectedLevel,
} from './plan';
import { initialState, replayLog, type ReplayResult } from './progress';
import { observedRates, resolveRates, type ObservedRates } from './rates';
import { standing, type Standing } from './standing';
import { recentDays, streak } from './streak';
import { timeCost, type TimeCost } from './timecost';
import type { DayEntry, LevelState, LevelTable, Overrides, Profile, ReqFn, Requirement, ResolvedRates } from './types';

export const IMPOSSIBLE_STEPS_PER_DAY = 50000;

export interface DashboardInput {
  table: LevelTable;
  overrides: Overrides;
  profile: Profile;
  entries: DayEntry[];
  /** 12 values, January first, 0..1 */
  seasonRates: number[];
  today: DayKey;
}

export interface RingData {
  done: number;
  need: number;
  remaining: number;
  /** 0..1 */
  fraction: number;
}

export type AppPhase = 'active' | 'goalReached' | 'maxed' | 'datePassed';

export interface Dashboard {
  today: DayKey;
  req: ReqFn;
  phase: AppPhase;
  replay: ReplayResult;
  current: LevelState;
  next: Requirement | null;
  todayEntry: DayEntry | null;
  loggedToday: boolean;
  rings: { steps: RingData; flowers: RingData };
  goal: { level: number; date: DayKey; levelsToGo: number; daysLeft: number };
  plan: Plan;
  baseline: Plan;
  standing: Standing;
  /** The next plan day's targets (today, or tomorrow once today is logged). */
  target: { date: DayKey; isToday: boolean; steps: number; flowersIfRiding: number; expectedFlowers: number };
  /** Today's targets as they stood before today's log (for "daily goal hit"). */
  todayGoal: { steps: number; flowersIfRiding: number };
  pace: {
    /** Steps per day the plan asks for on the current level. */
    stepsPerDay: number;
    /** Flowers per rideable day the plan asks for on the current level. */
    flowersPerRideDay: number;
    avgStepsPerDay: number;
    avgFlowersPerRideDay: number;
    peakStepsPerDay: number;
    peakFlowersPerRideDay: number;
    /** Overhead from surplus that resets at level-ups (1 = none). */
    scale: number;
    binding: 'steps' | 'flowers' | 'both' | 'none';
  };
  time: TimeCost;
  rates: ResolvedRates;
  observed: ObservedRates;
  streak: number;
  recent: Array<{ date: DayKey; logged: boolean }>;
  projected: ProjectedLevel[];
  nextMilestone: ProjectedLevel | null;
  impossible: { stepsPerDay: number; walkHours: number } | null;
}

const ring = (done: number, need: number): RingData => ({
  done,
  need,
  remaining: Math.max(0, need - done),
  fraction: need > 0 ? Math.min(1, Math.max(0, done / need)) : 1,
});

export function computeDashboard({ table, overrides, profile, entries, seasonRates, today }: DashboardInput): Dashboard {
  const req = makeReq(table, overrides);
  const replay = replayLog(profile, entries, req, table.maxLevel);
  const current = replay.state;
  const next = req(current.level + 1);
  const todayEntry = entries.find((e) => e.date === today) ?? null;
  const loggedToday = !!todayEntry;
  const goalLevel = Math.min(table.maxLevel, profile.goalLevel);

  const planStart = loggedToday ? addDaysKey(today, 1) : today;
  const plan = buildPlan({ start: current, startKey: planStart, goalKey: profile.goalDate, goalLevel, seasonRates, req });
  const baseline = buildPlan({
    start: initialState(profile),
    startKey: addDaysKey(profile.startDate, 1),
    goalKey: profile.goalDate,
    goalLevel,
    seasonRates,
    req,
  });
  const stand = standing(baseline, current, req, today, loggedToday);

  const day0 = plannedForDay(plan, 0);
  let todayGoal = { steps: day0.steps, flowersIfRiding: day0.flowersIfRiding };
  if (loggedToday) {
    const prior = replayLog(profile, entries.filter((e) => e.date !== today), req, table.maxLevel).state;
    const p0 = buildPlan({ start: prior, startKey: today, goalKey: profile.goalDate, goalLevel, seasonRates, req });
    const d = plannedForDay(p0, 0);
    todayGoal = { steps: d.steps, flowersIfRiding: d.flowersIfRiding };
  }
  const seg = segmentAt(plan, 0);
  const rates = resolveRates(profile.rates);
  const rideShare = plan.calendarDays > 0 ? plan.rideableDays / plan.calendarDays : 1;
  const time = timeCost(day0.steps, day0.flowersIfRiding, rideShare, rates);

  const projected = projectedLevels(plan);
  const peakSteps = peakStepsPerDay(plan);

  let phase: AppPhase = 'active';
  if (current.level >= table.maxLevel) phase = 'maxed';
  else if (current.level >= goalLevel) phase = 'goalReached';
  else if (daysBetween(today, profile.goalDate) < 0 || (loggedToday && today === profile.goalDate)) phase = 'datePassed';

  const impossible =
    phase === 'active' && plan.status === 'ok' && peakSteps > IMPOSSIBLE_STEPS_PER_DAY
      ? { stepsPerDay: peakSteps, walkHours: peakSteps / rates.walkStepsPerHour }
      : null;

  return {
    today,
    req,
    phase,
    replay,
    current,
    next,
    todayEntry,
    loggedToday,
    rings: {
      steps: ring(next ? Math.min(current.steps, next.steps) : 0, next?.steps ?? 0),
      flowers: ring(next ? Math.min(current.flowers, next.flowers) : 0, next?.flowers ?? 0),
    },
    goal: {
      level: goalLevel,
      date: profile.goalDate,
      levelsToGo: Math.max(0, goalLevel - current.level),
      daysLeft: Math.max(0, daysBetween(today, profile.goalDate) + (loggedToday ? 0 : 1)),
    },
    plan,
    baseline,
    standing: stand,
    target: { date: planStart, isToday: !loggedToday, steps: day0.steps, flowersIfRiding: day0.flowersIfRiding, expectedFlowers: day0.expectedFlowers },
    todayGoal,
    pace: {
      stepsPerDay: seg ? seg.stepRate : 0,
      flowersPerRideDay: seg ? seg.flowerRate : 0,
      avgStepsPerDay: plan.avgStepsPerDay,
      avgFlowersPerRideDay: plan.avgFlowersPerRideDay,
      peakStepsPerDay: peakSteps,
      peakFlowersPerRideDay: peakFlowersPerRideDay(plan),
      scale: plan.scale,
      binding: seg ? seg.binding : 'none',
    },
    time,
    rates,
    observed: observedRates(entries, rates),
    streak: streak(entries, today),
    recent: recentDays(entries, today, 14),
    projected,
    nextMilestone: projected[0] ?? null,
    impossible,
  };
}
