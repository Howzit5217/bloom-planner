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
import { flowerDays, observedRates, resolveRates, type ObservedRates } from './rates';
import { standing, type Standing } from './standing';
import { recentDays, streak } from './streak';
import { DIFFICULTIES, difficultyOfPlan, type PlanDifficulty } from './difficulty';
import { customProgress, type CustomProgress } from './customGoal';
import { questOf, type Quest } from './quest';
import { MAX_STEPS_PER_DAY } from './goalCheck';
import { timeCost, type TimeCost } from './timecost';
import type { DayEntry, LevelState, LevelTable, Overrides, Profile, ReqFn, Requirement, ResolvedRates } from './types';
import type { DayVerdict, ForecastWeights } from './weatherPlan';

/** Above this the Home screen gives an honest heads-up. The same limit blocks such goals at setup. */
export const IMPOSSIBLE_STEPS_PER_DAY = MAX_STEPS_PER_DAY;

export interface DashboardInput {
  table: LevelTable;
  overrides: Overrides;
  profile: Profile;
  entries: DayEntry[];
  /** 12 values, January first, 0..1 */
  seasonRates: number[];
  today: DayKey;
  /** Walking days per month (heat, downpours), 0..1; missing: every day is a walking day. */
  walkRates?: number[];
  /** The forecast's own weights for the next two weeks. */
  forecast?: ForecastWeights | null;
  /** The week's rhythm (rhythm.ts): easy days ask less, the rest a little more. */
  rhythm?: (d: Date) => number;
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
  /** The next level's quest (mushrooms, expeditions, ...) and how many are left, when logged. */
  quest: (Quest & { task: string; toGo: number | null }) | null;
  /** At the top level: progress toward the user's own steps-and-flowers goal, when one is set. */
  custom: CustomProgress | null;
  /** The next 7 days: what the plan asks of each, and the forecast for it when there is one. */
  week: Array<{ date: DayKey; steps: number; flowers: number; logged: boolean; walk: DayVerdict | null; ride: DayVerdict | null; feels: number | null; code: number | null }>;
  /** What the forecast says about today, and how many of the next 7 days are good (null without a forecast). */
  weather: { today: { walk: DayVerdict; ride: DayVerdict } | null; walkGood: number; rideGood: number; days: number } | null;
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
  /** How hard the rest of the plan is, at its busiest (only while there's a plan to follow). */
  difficulty: PlanDifficulty | null;
  /**
   * When it's a different grade from the plan as set (followed from the start): harder from falling
   * behind, or easier from being ahead. Only when the standing says so, not a change of weather.
   */
  difficultyShift: { from: PlanDifficulty; way: 'harder' | 'easier' } | null;
}

const ring = (done: number, need: number): RingData => ({
  done,
  need,
  remaining: Math.max(0, need - done),
  fraction: need > 0 ? Math.min(1, Math.max(0, done / need)) : 1,
});

export function computeDashboard({ table, overrides, profile, entries, seasonRates: weather, today, walkRates, forecast, rhythm }: DashboardInput): Dashboard {
  // Riding needs fair weather; without a bike, flowers come from walking, on the walking days.
  const bikes = profile.rates.bikes !== false;
  const seasonRates = bikes ? weather : (walkRates ?? flowerDays(weather, false));
  const days = { walkRates, walkDays: forecast?.walk, flowerDays: bikes ? forecast?.ride : forecast?.walk, rhythm };
  const req = makeReq(table, overrides);
  const replay = replayLog(profile, entries, req, table.maxLevel);
  const current = replay.state;
  const next = req(current.level + 1);
  const todayEntry = entries.find((e) => e.date === today) ?? null;
  const loggedToday = !!todayEntry;
  const goalLevel = Math.min(table.maxLevel, profile.goalLevel);

  const planStart = loggedToday ? addDaysKey(today, 1) : today;
  const plan = buildPlan({ start: current, startKey: planStart, goalKey: profile.goalDate, goalLevel, seasonRates, req, ...days });
  // The yardstick for ahead/behind: the plan from setup, with the usual weather (not this fortnight's).
  const baseline = buildPlan({
    start: initialState(profile),
    startKey: addDaysKey(profile.startDate, 1),
    goalKey: profile.goalDate,
    goalLevel,
    seasonRates,
    req,
    walkRates,
    rhythm,
  });
  const stand = standing(baseline, current, req, today, loggedToday);

  const day0 = plannedForDay(plan, 0);
  let todayGoal = { steps: day0.steps, flowersIfRiding: day0.flowersIfRiding };
  if (loggedToday) {
    const prior = replayLog(profile, entries.filter((e) => e.date !== today), req, table.maxLevel).state;
    const p0 = buildPlan({ start: prior, startKey: today, goalKey: profile.goalDate, goalLevel, seasonRates, req, ...days });
    const d = plannedForDay(p0, 0);
    todayGoal = { steps: d.steps, flowersIfRiding: d.flowersIfRiding };
  }
  const seg = segmentAt(plan, 0);
  const rates = resolveRates(profile.rates);
  const time = timeCost(day0.steps, day0.flowersIfRiding, rates);

  const projected = projectedLevels(plan);
  const peakSteps = peakStepsPerDay(plan);

  let phase: AppPhase = 'active';
  if (current.level >= table.maxLevel) phase = 'maxed';
  else if (current.level >= goalLevel) phase = 'goalReached';
  else if (daysBetween(today, profile.goalDate) < 0 || (loggedToday && today === profile.goalDate)) phase = 'datePassed';

  // How hard the days left are, and how hard the plan as set was: falling behind piles the rest onto
  // the days left (a harder grade), being ahead lightens them (an easier one).
  const difficulty = phase === 'active' && plan.status === 'ok' ? difficultyOfPlan(plan, rates) : null;
  const asSet = baseline.status === 'ok' ? difficultyOfPlan(baseline, rates) : null;
  const rank = (d: PlanDifficulty) => DIFFICULTIES.indexOf(d.level);
  const difficultyShift =
    difficulty && asSet && rank(difficulty) !== rank(asSet)
      ? rank(difficulty) > rank(asSet)
        ? stand.verdict === 'behind'
          ? { from: asSet, way: 'harder' as const }
          : null
        : stand.verdict === 'ahead'
          ? { from: asSet, way: 'easier' as const }
          : null
      : null;

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
    custom: phase === 'maxed' && profile.customGoal ? customProgress(profile.customGoal, entries, today, loggedToday) : null,
    week:
      phase === 'active' && plan.status === 'ok'
        ? Array.from({ length: 7 }, (_, i) => {
            const date = addDaysKey(today, i);
            const f = forecast?.day[date] ?? null;
            const why = forecast?.why[date] ?? null;
            if (date === today && todayEntry) return { date, steps: todayEntry.steps, flowers: todayEntry.flowers, logged: true, walk: why?.walk ?? null, ride: why?.ride ?? null, feels: f?.feelsMax ?? null, code: f?.code ?? null };
            const p = plannedForDay(plan, daysBetween(planStart, date));
            return { date, steps: p.steps, flowers: p.expectedFlowers, logged: false, walk: why?.walk ?? null, ride: why?.ride ?? null, feels: f?.feelsMax ?? null, code: f?.code ?? null };
          })
        : [],
    weather: (() => {
      if (!forecast) return null;
      const week = Array.from({ length: 7 }, (_, i) => forecast.why[addDaysKey(today, i)]).filter(Boolean);
      if (!week.length) return null;
      return { today: forecast.why[today] ?? null, walkGood: week.filter((d) => d.walk === 'good').length, rideGood: week.filter((d) => d.ride === 'good').length, days: week.length };
    })(),
    quest: (() => {
      const q = next ? questOf(next.task) : null;
      return q && next ? { ...q, task: next.task, toGo: replay.taskToGo } : null;
    })(),
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
    difficulty,
    difficultyShift,
  };
}
