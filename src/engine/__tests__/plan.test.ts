import bundled from '../../data/bloom-levels.json';
import { addDaysKey } from '../dates';
import { makeReq, parseLevelTable } from '../levels';
import { applyActivity } from '../progress';
import { buildPlan, plannedForDay, planStateAt, projectedLevels, remainingWork, rideableDays } from '../plan';
import { computeDashboard, IMPOSSIBLE_STEPS_PER_DAY } from '../summary';
import { ALL_RIDEABLE, entry, profile, reqOf, table } from './helpers';

describe('fractional rideable days', () => {
  it('31 days at 0.26 contribute 8.06', () => {
    const rates = new Array(12).fill(1);
    rates[0] = 0.26;
    expect(rideableDays('2027-01-01', '2027-01-31', rates)).toBeCloseTo(8.06, 10);
  });
  it('smooths across a month boundary instead of lurching', () => {
    const rates = new Array(12).fill(0.5);
    rates[1] = 0.1; // February
    expect(rideableDays('2027-01-30', '2027-02-02', rates)).toBeCloseTo(0.5 + 0.5 + 0.1 + 0.1, 10);
  });
  it('skipping the weather step (all 1.0) makes rideable days equal calendar days', () => {
    expect(rideableDays('2026-11-05', '2027-11-04', ALL_RIDEABLE)).toBe(365);
  });
});

describe('remaining work', () => {
  it('counts a per-level step surplus as lost but a lifetime surplus as banked', () => {
    const t = table([
      { level: 3, steps: 100, flowers: 10, stepsMode: 'lifetime' },
      { level: 4, steps: 100, flowers: 10, stepsMode: 'lifetime' },
      { level: 5, steps: 100, flowers: 10, stepsMode: 'perLevel' },
    ]);
    const req = reqOf(t);
    // 150 steps into level 3: 50 carry into level 4 (lifetime), nothing carries into 5.
    expect(remainingWork({ level: 2, steps: 150, flowers: 0 }, 5, req)).toMatchObject({ steps: 0 + 50 + 100, flowers: 30 });
  });
});

describe('buildPlan', () => {
  const t = parseLevelTable(bundled);
  const req = makeReq(t, {});

  it('reaches the goal exactly on the goal date', () => {
    const plan = buildPlan({ start: { level: 110, steps: 0, flowers: 0 }, startKey: '2026-11-05', goalKey: '2028-02-14', goalLevel: 130, seasonRates: ALL_RIDEABLE, req });
    expect(plan.status).toBe('ok');
    expect(plan.endT).toBeCloseTo(plan.calendarDays, 4);
    const last = projectedLevels(plan).at(-1)!;
    expect(last.level).toBe(130);
    expect(last.date).toBe('2028-02-14');
  });

  it('with steady weather and steady requirements the naive pace is (almost) enough', () => {
    const plan = buildPlan({ start: { level: 110, steps: 0, flowers: 0 }, startKey: '2026-11-05', goalKey: '2028-02-14', goalLevel: 130, seasonRates: ALL_RIDEABLE, req });
    expect(plan.scale).toBeLessThan(1.01);
    expect(plan.avgStepsPerDay).toBeCloseTo(plan.remaining.steps / plan.calendarDays, 6);
  });

  it('asks for more than the naive pace when seasons make surplus reset at level-ups (101+)', () => {
    const seasons = [0.2, 0.25, 0.45, 0.6, 0.75, 0.9, 0.95, 0.9, 0.8, 0.6, 0.3, 0.2];
    const plan = buildPlan({ start: { level: 110, steps: 0, flowers: 0 }, startKey: '2026-11-05', goalKey: '2028-02-14', goalLevel: 130, seasonRates: seasons, req });
    expect(plan.scale).toBeGreaterThan(1.02);
    expect(plan.endT).toBeCloseTo(plan.calendarDays, 4);
    // Simulating a player who walks/plants exactly the planned amounts each day reaches 130 on time.
    let s = { ...plan.start };
    for (let i = 0; i < plan.calendarDays; i++) {
      // Whole-day accrual blurs mid-day level boundaries slightly, so allow 0.2% slack.
      const d = plannedForDay(plan, i);
      s = applyActivity(s, d.steps * 1.002, d.expectedFlowers * 1.002, req, 130).state;
    }
    expect(s.level).toBe(130);
  });

  it('carries the current partial progress into the first level', () => {
    const plan = buildPlan({ start: { level: 110, steps: 400000, flowers: 290000 }, startKey: '2026-11-05', goalKey: '2026-11-14', goalLevel: 111, seasonRates: ALL_RIDEABLE, req });
    expect(plan.remaining.steps).toBe(79200);
    expect(plan.remaining.flowers).toBe(4900);
    expect(plan.segments[0].stepRate).toBeCloseTo(7920, 6);
  });

  it('planStateAt follows the plan from start to goal', () => {
    const plan = buildPlan({ start: { level: 110, steps: 0, flowers: 0 }, startKey: '2026-11-05', goalKey: '2027-11-04', goalLevel: 115, seasonRates: ALL_RIDEABLE, req });
    expect(planStateAt(plan, 0)).toEqual({ level: 110, steps: 0, flowers: 0 });
    expect(planStateAt(plan, plan.endT + 1).level).toBe(115);
  });

  it('handles the goal date having passed', () => {
    const plan = buildPlan({ start: { level: 110, steps: 0, flowers: 0 }, startKey: '2026-11-05', goalKey: '2026-11-01', goalLevel: 111, seasonRates: ALL_RIDEABLE, req });
    expect(plan.status).toBe('noTime');
  });
});

describe('impossible goals', () => {
  it('are allowed but flagged honestly', () => {
    const t = parseLevelTable(bundled);
    const p = profile({ currentLevel: 110, goalLevel: 130, goalDate: '2027-01-31', startDate: '2026-11-04' });
    const d = computeDashboard({ table: t, overrides: {}, profile: p, entries: [], seasonRates: ALL_RIDEABLE, today: '2026-11-04' });
    expect(d.plan.status).toBe('ok');
    expect(d.impossible).not.toBeNull();
    expect(d.impossible!.stepsPerDay).toBeGreaterThan(IMPOSSIBLE_STEPS_PER_DAY);
    expect(d.impossible!.walkHours).toBeCloseTo(d.impossible!.stepsPerDay / 6000, 6);
  });

  it('a sensible goal is not flagged', () => {
    const t = parseLevelTable(bundled);
    const p = profile({ currentLevel: 110, goalLevel: 130, goalDate: '2028-02-14', startDate: '2026-11-04' });
    const d = computeDashboard({ table: t, overrides: {}, profile: p, entries: [], seasonRates: ALL_RIDEABLE, today: '2026-11-04' });
    expect(d.impossible).toBeNull();
  });
});

describe('overrides feed the plan', () => {
  it('a corrected level changes the remaining work', () => {
    const t = parseLevelTable(bundled);
    const base = remainingWork({ level: 110, steps: 0, flowers: 0 }, 111, makeReq(t, {}));
    const fixed = remainingWork({ level: 110, steps: 0, flowers: 0 }, 111, makeReq(t, { 111: { level: 111, steps: 500000, flowers: null, recordedAt: 'x' } }));
    expect(base.steps).toBe(479200);
    expect(fixed.steps).toBe(500000);
  });
});

describe('dashboard', () => {
  const t = table([
    { level: 3, steps: 10000, flowers: 1000, stepsMode: 'perLevel' },
    { level: 4, steps: 10000, flowers: 1000, stepsMode: 'perLevel' },
  ]);
  it('starts the plan tomorrow once today is logged', () => {
    const p = profile({ currentLevel: 2, goalLevel: 4, goalDate: '2026-11-23', startDate: '2026-11-03' });
    const d0 = computeDashboard({ table: t, overrides: {}, profile: p, entries: [], seasonRates: ALL_RIDEABLE, today: '2026-11-04' });
    expect(d0.plan.startKey).toBe('2026-11-04');
    expect(d0.target.isToday).toBe(true);
    const d1 = computeDashboard({ table: t, overrides: {}, profile: p, entries: [entry('2026-11-04', 1000, 100)], seasonRates: ALL_RIDEABLE, today: '2026-11-04' });
    expect(d1.plan.startKey).toBe(addDaysKey('2026-11-04', 1));
    expect(d1.target.isToday).toBe(false);
  });
});
