import { addDaysKey } from '../dates';
import { computeDashboard } from '../summary';
import { difficultyOfPlan } from '../difficulty';
import { checkGoal } from '../goalCheck';
import { DEFAULT_RHYTHM, makeRhythm } from '../rhythm';
import { ALL_RIDEABLE, entry, profile, table } from './helpers';

// 2 levels of 10,000 steps / 1,000 flowers each, 20 plan days -> 1,000 steps and 100 flowers a day.
const t = table([
  { level: 3, steps: 10000, flowers: 1000, stepsMode: 'perLevel' },
  { level: 4, steps: 10000, flowers: 1000, stepsMode: 'perLevel' },
]);
const p = profile({ currentLevel: 2, goalLevel: 4, startDate: '2026-11-04', goalDate: '2026-11-24' });
const run = (entries: ReturnType<typeof entry>[], today: string) =>
  computeDashboard({ table: t, overrides: {}, profile: p, entries, seasonRates: ALL_RIDEABLE, today });

describe('ahead or behind (§7.6)', () => {
  it('right on track when doing exactly the plan', () => {
    const entries = [1, 2, 3, 4, 5].map((i) => entry(addDaysKey('2026-11-04', i), 1000, 100));
    const d = run(entries, '2026-11-09');
    expect(d.standing.verdict).toBe('onPace');
    expect(Math.abs(d.standing.gapDays)).toBeLessThan(1e-6);
  });

  it('days ahead, measured in the plan schedule', () => {
    // 5 days in, but did 9 days of work.
    const entries = [1, 2, 3, 4, 5].map((i) => entry(addDaysKey('2026-11-04', i), 1800, 180));
    const d = run(entries, '2026-11-09');
    expect(d.standing.verdict).toBe('ahead');
    expect(d.standing.gapDays).toBeCloseTo(4, 6);
    expect(d.standing.displayDays).toBe(4);
  });

  it('days behind uses the requirement further behind', () => {
    // Steps on pace, flowers at half pace: 5 days in, flowers say 2.5 days done -> 2.5 behind.
    const entries = [1, 2, 3, 4, 5].map((i) => entry(addDaysKey('2026-11-04', i), 1000, 50));
    const d = run(entries, '2026-11-09');
    expect(d.standing.verdict).toBe('behind');
    expect(d.standing.gapDays).toBeCloseTo(-2.5, 6);
    expect(d.standing.displayDays).toBe(2);
  });

  it('compares against yesterday until today is logged, so mornings are not "behind"', () => {
    const entries = [1, 2, 3, 4].map((i) => entry(addDaysKey('2026-11-04', i), 1000, 100));
    const d = run(entries, '2026-11-09'); // day 5 not logged yet
    expect(d.standing.verdict).toBe('onPace');
  });

  it('recovery pace rises after falling behind', () => {
    const behind = run([1, 2, 3, 4, 5].map((i) => entry(addDaysKey('2026-11-04', i), 500, 50)), '2026-11-09');
    const onPace = run([1, 2, 3, 4, 5].map((i) => entry(addDaysKey('2026-11-04', i), 1000, 100)), '2026-11-09');
    expect(behind.pace.stepsPerDay).toBeGreaterThan(onPace.pace.stepsPerDay);
  });
});

describe('the streak flowers', () => {
  it('marks each logged day hit or short of what the plan asked of it that day', () => {
    // On the plan, then short, then not logged, then well over.
    const entries = [entry('2026-11-05', 1000, 100), entry('2026-11-06', 400, 30), entry('2026-11-08', 2000, 200)];
    const d = run(entries, '2026-11-08');
    const byDate = Object.fromEntries(d.recent.map((r) => [r.date, r]));
    expect(byDate['2026-11-05'].hit).toBe(true);
    expect(byDate['2026-11-06'].hit).toBe(false);
    expect(byDate['2026-11-07']).toEqual({ date: '2026-11-07', logged: false, hit: null, did: null });
    expect(byDate['2026-11-08'].hit).toBe(true);
    // How hard the day as logged was: 400 steps is an easy day.
    expect(byDate['2026-11-06'].did).toBe('easy');
  });
});

describe('a goal being chosen', () => {
  it('grades the same as the plan it becomes once saved (the forecast and the easy days in both)', () => {
    const rhythm = makeRhythm(DEFAULT_RHYTHM);
    const forecast = { walk: { '2026-11-09': 0.4, '2026-11-10': 0.7 }, ride: { '2026-11-09': 0 }, flower: { '2026-11-09': 0 }, day: {}, why: {} };
    const d = computeDashboard({ table: t, overrides: {}, profile: p, entries: [], seasonRates: ALL_RIDEABLE, today: '2026-11-08', forecast, rhythm });
    const check = checkGoal({ start: d.plan.start, startKey: d.plan.startKey, goalKey: p.goalDate, goalLevel: p.goalLevel, seasonRates: ALL_RIDEABLE, req: d.req, bikeFlowersPerHour: d.rates.bikeFlowersPerHour, bikes: d.rates.bikes, walkFlowersPerHour: d.rates.walkFlowersPerHour, ...d.goalInputs });
    expect(check.plan?.status).toBe('ok');
    expect(difficultyOfPlan(check.plan!, d.rates)).toEqual(d.difficulty);
  });
});
