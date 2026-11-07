import { addDaysKey, daysBetween, fromKey, toKey, type DayKey } from './dates';
import type { LevelState, ReqFn } from './types';

/**
 * The plan engine.
 *
 * Remaining work (§7.1), rideable days (§7.2), pace (§7.3) and projected level dates (§7.5).
 *
 * Time is continuous: t is measured in days from the first plan day (t=0 is that day's start).
 * Each rideable-weighted day contributes seasonRate[month] "ride days", so a 31-day month at 0.26
 * contributes 8.06 (fractional on purpose, so projections don't lurch at month boundaries).
 * Days the forecast covers use their own weight instead of the month's (a hot or stormy day counts
 * for less). Steps work the same way on a walking calendar: 1 on a good walking day, less on a day
 * too hot or wet to walk far, so the good days carry more of the plan.
 *
 * Levelling rules honoured here:
 *   - Flowers never carry over. Each level needs its full quota planted while at that level.
 *   - Steps carry over only while the game counts a lifetime total (levels <= 100). From level 101
 *     each level needs its own "Walk X steps", and extra steps are lost at the level-up.
 *
 * Because surplus is lost at each level-up, the naive pace (remaining / days) is not enough when the
 * two requirements finish at different times (for example: winter makes flowers slow, so steps
 * finish first and their extra is wasted). The plan therefore finds the smallest common scale k >= 1
 * on the naive paces for which a player who finishes both requirements together, never exceeding
 * k x the naive pace, still reaches the goal by the goal date.
 */

export interface RemainingWork {
  steps: number;
  flowers: number;
  levels: Array<{ level: number; steps: number; flowers: number }>;
}

/** §7.1 Remaining work from `start` to `goalLevel`, honouring which step surplus legally carries. */
export function remainingWork(start: LevelState, goalLevel: number, req: ReqFn): RemainingWork {
  const levels: RemainingWork['levels'] = [];
  let bank = start.steps;
  let fl = start.flowers;
  let steps = 0;
  let flowers = 0;
  for (let L = start.level + 1; L <= goalLevel; L++) {
    const r = req(L);
    if (!r) break;
    const needS = Math.max(0, r.steps - bank);
    const needF = Math.max(0, r.flowers - fl);
    steps += needS;
    flowers += needF;
    levels.push({ level: L, steps: needS, flowers: needF });
    const next = req(L + 1);
    bank = next && next.stepsMode === 'lifetime' ? Math.max(0, bank - r.steps) : 0;
    fl = 0;
  }
  return { steps, flowers, levels };
}

/** Per-day weights for days the forecast covers, by yyyy-MM-dd (0..1). */
export type DayWeights = Record<DayKey, number>;

/** Prefix sums of daily weights (riding or walking) starting at `startKey`. */
export class RideCalendar {
  readonly startKey: DayKey;
  private readonly rates: number[];
  private readonly prefix: number[];
  /** Each day's share from the week's rhythm (1 when the days don't vary). */
  private readonly shares: number[];

  /**
   * `rhythm` scales each day by the week's rhythm (easy days less, the rest a little more), on top
   * of the weather's weight: a day's weight can then pass 1.
   */
  constructor(startKey: DayKey, seasonRates: number[], days: number, overrides?: DayWeights, rhythm?: (d: Date) => number) {
    this.startKey = startKey;
    const n = Math.max(1, Math.ceil(days));
    this.rates = new Array(n);
    this.prefix = new Array(n + 1);
    this.shares = new Array(n);
    this.prefix[0] = 0;
    const d = fromKey(startKey);
    const has = !!overrides && Object.keys(overrides).length > 0;
    for (let i = 0; i < n; i++) {
      const o = has ? overrides![toKey(d)] : undefined;
      const share = rhythm ? Math.max(0, rhythm(d)) : 1;
      const r = Math.min(1, Math.max(0, o ?? seasonRates[d.getMonth()] ?? 1)) * share;
      this.shares[i] = share;
      this.rates[i] = r;
      this.prefix[i + 1] = this.prefix[i] + r;
      d.setDate(d.getDate() + 1);
    }
  }

  /** Day i's share from the week's rhythm. */
  shareOnDay(i: number): number {
    return i >= 0 && i < this.shares.length ? this.shares[i] : 1;
  }

  get length() {
    return this.rates.length;
  }

  rateOnDay(i: number): number {
    if (i < 0) return this.rates[0];
    if (i >= this.rates.length) return this.avgRate();
    return this.rates[i];
  }

  private avgRate() {
    const n = this.rates.length;
    return n > 0 ? this.prefix[n] / n || 1 : 1;
  }

  /** Cumulative ride days from 0 to t. */
  W(t: number): number {
    if (t <= 0) return 0;
    const n = this.rates.length;
    if (t >= n) return this.prefix[n] + (t - n) * this.avgRate();
    const i = Math.floor(t);
    return this.prefix[i] + this.rates[i] * (t - i);
  }

  /** Smallest t with W(t) = w. */
  Winv(w: number): number {
    if (w <= 0) return 0;
    const n = this.rates.length;
    if (w > this.prefix[n]) {
      const avg = this.avgRate();
      return avg > 0 ? n + (w - this.prefix[n]) / avg : Infinity;
    }
    let lo = 1;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.prefix[mid] >= w) hi = mid;
      else lo = mid + 1;
    }
    const i = lo - 1;
    const rate = this.prefix[lo] - this.prefix[i];
    return rate > 0 ? i + (w - this.prefix[i]) / rate : lo;
  }
}

/** §7.2 Fractional rideable days from startKey to endKey inclusive. */
export function rideableDays(startKey: DayKey, endKey: DayKey, seasonRates: number[]): number {
  const n = daysBetween(startKey, endKey) + 1;
  if (n <= 0) return 0;
  return new RideCalendar(startKey, seasonRates, n).W(n);
}

export interface PlanSegment {
  /** The level reached at endT. */
  level: number;
  startT: number;
  endT: number;
  startSteps: number;
  startFlowers: number;
  needSteps: number;
  needFlowers: number;
  reqSteps: number;
  reqFlowers: number;
  /** Steps per calendar day during this level. */
  stepRate: number;
  /** Flowers per rideable day during this level. */
  flowerRate: number;
  binding: 'steps' | 'flowers' | 'both' | 'none';
  /** Step progress carried into the next level. */
  carryOut: number;
}

export type PlanStatus = 'ok' | 'reached' | 'noTime' | 'noRideDays';

export interface Plan {
  status: PlanStatus;
  startKey: DayKey;
  goalKey: DayKey;
  goalLevel: number;
  start: LevelState;
  calendarDays: number;
  rideableDays: number;
  remaining: RemainingWork;
  /** §7.3 naive averages. */
  avgStepsPerDay: number;
  avgFlowersPerRideDay: number;
  /** Plan caps (naive x scale): the most any single level asks for. */
  stepsCap: number;
  flowersCap: number;
  scale: number;
  segments: PlanSegment[];
  endT: number;
  /** Flower days (riding, or walking without a bike). */
  calendar: RideCalendar;
  /** Walking days, for steps. */
  walk: RideCalendar;
}

interface SimResult {
  segments: PlanSegment[];
  endT: number;
}

function simulate(start: LevelState, goalLevel: number, req: ReqFn, cal: RideCalendar, walk: RideCalendar, sCap: number, fCap: number): SimResult {
  const segments: PlanSegment[] = [];
  let t = 0;
  let bank = start.steps;
  let fl = start.flowers;
  for (let L = start.level + 1; L <= goalLevel; L++) {
    const r = req(L);
    if (!r) break;
    const needS = Math.max(0, r.steps - bank);
    const needF = Math.max(0, r.flowers - fl);
    const stepsTime = needS > 0 ? (sCap > 0 ? walk.Winv(walk.W(t) + needS / sCap) - t : Infinity) : 0;
    const flowersTime = needF > 0 ? (fCap > 0 ? cal.Winv(cal.W(t) + needF / fCap) - t : Infinity) : 0;
    const D = Math.max(stepsTime, flowersTime);
    const next = req(L + 1);
    const carry = !!next && next.stepsMode === 'lifetime' && L < goalLevel;
    // Lifetime levels whose surplus carries: walk at full pace, the bank grows.
    // Otherwise surplus would be lost, so ease off to finish steps exactly at the level-up.
    const fullPace = r.stepsMode === 'lifetime' && carry;
    // Steps per good walking day.
    const walkW = walk.W(t + D) - walk.W(t);
    const stepRate = D > 0 ? (fullPace ? sCap : walkW > 0 ? needS / walkW : 0) : 0;
    const rideW = cal.W(t + D) - cal.W(t);
    const flowerRate = rideW > 0 ? needF / rideW : 0;
    const surplus = Math.max(0, bank + stepRate * walkW - r.steps);
    const binding: PlanSegment['binding'] =
      D === 0 ? 'none' : Math.abs(stepsTime - flowersTime) < 1e-9 ? 'both' : stepsTime > flowersTime ? 'steps' : 'flowers';
    segments.push({
      level: L,
      startT: t,
      endT: t + D,
      startSteps: bank,
      startFlowers: fl,
      needSteps: needS,
      needFlowers: needF,
      reqSteps: r.steps,
      reqFlowers: r.flowers,
      stepRate,
      flowerRate,
      binding,
      carryOut: carry ? surplus : 0,
    });
    t += D;
    bank = carry ? surplus : 0;
    fl = 0;
  }
  return { segments, endT: t };
}

export interface PlanInput {
  start: LevelState;
  startKey: DayKey;
  goalKey: DayKey;
  goalLevel: number;
  /** Flower days per month (0..1). */
  seasonRates: number[];
  req: ReqFn;
  /** Walking days per month (0..1); missing means every day is a full walking day. */
  walkRates?: number[];
  /** The forecast's own weights for the days it covers. */
  flowerDays?: DayWeights;
  walkDays?: DayWeights;
  /** The week's rhythm (rhythm.ts): easy days ask less, the rest a little more. */
  rhythm?: (d: Date) => number;
}

const EVERY_DAY = new Array(12).fill(1);

/** §7.3 + §7.5: required paces and the projected path to the goal. */
export function buildPlan({ start, startKey, goalKey, goalLevel, seasonRates, req, walkRates, flowerDays, walkDays, rhythm }: PlanInput): Plan {
  const calendarDays = daysBetween(startKey, goalKey) + 1;
  const remaining = remainingWork(start, goalLevel, req);
  const horizon = Math.max(1, calendarDays) + 3660;
  const cal = new RideCalendar(startKey, seasonRates, horizon, flowerDays, rhythm);
  const walk = new RideCalendar(startKey, walkRates ?? EVERY_DAY, horizon, walkDays, rhythm);
  const ride = calendarDays > 0 ? cal.W(calendarDays) : 0;
  const walkable = calendarDays > 0 ? walk.W(calendarDays) : 0;
  const base: Omit<Plan, 'status' | 'segments' | 'endT' | 'scale' | 'stepsCap' | 'flowersCap' | 'avgStepsPerDay' | 'avgFlowersPerRideDay'> = {
    startKey,
    goalKey,
    goalLevel,
    start,
    calendarDays,
    rideableDays: ride,
    remaining,
    calendar: cal,
    walk,
  };

  if (start.level >= goalLevel) {
    return { ...base, status: 'reached', segments: [], endT: 0, scale: 1, stepsCap: 0, flowersCap: 0, avgStepsPerDay: 0, avgFlowersPerRideDay: 0 };
  }
  if (calendarDays <= 0) {
    return { ...base, status: 'noTime', segments: [], endT: 0, scale: 1, stepsCap: 0, flowersCap: 0, avgStepsPerDay: Infinity, avgFlowersPerRideDay: Infinity };
  }
  const s0 = walkable > 0 ? remaining.steps / walkable : remaining.steps / calendarDays;
  const f0 = ride > 0 ? remaining.flowers / ride : remaining.flowers > 0 ? Infinity : 0;
  if (!Number.isFinite(f0)) {
    return { ...base, status: 'noRideDays', segments: [], endT: 0, scale: 1, stepsCap: s0, flowersCap: Infinity, avgStepsPerDay: s0, avgFlowersPerRideDay: Infinity };
  }

  const N = calendarDays;
  const run = (k: number) => simulate(start, goalLevel, req, cal, walk, k * s0, k * f0);
  let lo = 1;
  let best = run(1);
  if (best.endT > N * (1 + 1e-9) + 1e-9) {
    let hi = 2;
    let hiRun = run(hi);
    while (hiRun.endT > N && hi < 1e6) {
      lo = hi;
      hi *= 2;
      hiRun = run(hi);
    }
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const r = run(mid);
      if (r.endT > N) lo = mid;
      else {
        hi = mid;
        hiRun = r;
      }
      if (hi - lo < 1e-11 * hi) break;
    }
    best = hiRun;
    lo = hi;
  }
  return {
    ...base,
    status: 'ok',
    segments: best.segments,
    endT: best.endT,
    scale: lo,
    stepsCap: lo * s0,
    flowersCap: lo * f0,
    avgStepsPerDay: s0,
    avgFlowersPerRideDay: f0,
  };
}

/** Planned state at plan time t (end of day i is t = i + 1). */
export function planStateAt(plan: Plan, t: number): LevelState {
  const segs = plan.segments;
  if (segs.length === 0) return { ...plan.start };
  if (t <= 0) return { ...plan.start };
  for (const s of segs) {
    if (t >= s.startT && t < s.endT) {
      return {
        level: s.level - 1,
        steps: s.startSteps + s.stepRate * (plan.walk.W(t) - plan.walk.W(s.startT)),
        flowers: s.startFlowers + s.flowerRate * (plan.calendar.W(t) - plan.calendar.W(s.startT)),
      };
    }
  }
  const last = segs[segs.length - 1];
  return { level: last.level, steps: last.carryOut, flowers: 0 };
}

/**
 * Planned steps on plan day i, and flowers you'd plant on it if you ride: none on a day the forecast
 * rules out (a storm, severe weather), so that day asks for no flowers at all.
 */
export function plannedForDay(plan: Plan, i: number): { steps: number; flowersIfRiding: number; expectedFlowers: number } {
  let steps = 0;
  let flowersIfRiding = 0;
  let expectedFlowers = 0;
  const open = plan.calendar.rateOnDay(i) > 0;
  for (const s of plan.segments) {
    const a = Math.max(i, s.startT);
    const b = Math.min(i + 1, s.endT);
    if (b <= a) continue;
    steps += s.stepRate * (plan.walk.W(b) - plan.walk.W(a));
    // A ride on an easy day plants less too.
    if (open) flowersIfRiding += s.flowerRate * (b - a) * plan.calendar.shareOnDay(i);
    expectedFlowers += s.flowerRate * (plan.calendar.W(b) - plan.calendar.W(a));
  }
  return { steps, flowersIfRiding, expectedFlowers };
}

/** Segment in effect at plan time t (the level being worked on). */
export function segmentAt(plan: Plan, t: number): PlanSegment | null {
  for (const s of plan.segments) if (t < s.endT) return s;
  return plan.segments.length ? plan.segments[plan.segments.length - 1] : null;
}

export interface ProjectedLevel {
  level: number;
  /** Day the level is projected to be reached. */
  date: DayKey;
  t: number;
  days: number;
  binding: PlanSegment['binding'];
  stepRate: number;
  flowerRate: number;
}

/** §7.5 projected date for each level. */
export function projectedLevels(plan: Plan): ProjectedLevel[] {
  return plan.segments.map((s) => ({
    level: s.level,
    date: addDaysKey(plan.startKey, Math.max(0, Math.ceil(s.endT - 1e-9) - 1)),
    t: s.endT,
    days: s.endT - s.startT,
    binding: s.binding,
    stepRate: s.stepRate,
    flowerRate: s.flowerRate,
  }));
}

export const peakStepsPerDay = (plan: Plan) => plan.segments.reduce((m, s) => (s.endT > s.startT ? Math.max(m, s.stepRate) : m), 0);
export const peakFlowersPerRideDay = (plan: Plan) => plan.segments.reduce((m, s) => (s.endT > s.startT ? Math.max(m, s.flowerRate) : m), 0);
