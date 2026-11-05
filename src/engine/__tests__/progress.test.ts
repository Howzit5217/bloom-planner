import { applyActivity, replayLog } from '../progress';
import { entry, profile, reqOf, table } from './helpers';

describe('flowers never carry over', () => {
  // L3: 100 steps / 100 flowers, L4: 100 / 100 (lifetime steps so only flowers reset)
  const t = table([
    { level: 3, steps: 100, flowers: 100, stepsMode: 'lifetime' },
    { level: 4, steps: 100, flowers: 100, stepsMode: 'lifetime' },
  ]);
  const req = reqOf(t);

  it('planting 2x the quota before the steps are done does not help the next level', () => {
    // Flowers first (200 planted while steps lag), then steps finish: level up with 0 flowers toward L4.
    const a = applyActivity({ level: 2, steps: 0, flowers: 0 }, 0, 200, req, 99);
    expect(a.state).toEqual({ level: 2, steps: 0, flowers: 200 });
    const b = applyActivity(a.state, 100, 0, req, 99);
    expect(b.state.level).toBe(3);
    expect(b.state.flowers).toBe(0);
    expect(b.wastedFlowers).toBe(100);
  });

  it('only flowers planted after the level-up count toward the next level', () => {
    // 100 steps done already; 150 flowers in a day -> level-up 2/3 through the day, 50 count for L4.
    const r = applyActivity({ level: 2, steps: 100, flowers: 0 }, 0, 150, req, 99);
    expect(r.state.level).toBe(3);
    expect(r.state.flowers).toBeCloseTo(50);
    expect(r.wastedFlowers).toBeCloseTo(0);
  });
});

describe('steps carry over only on lifetime levels', () => {
  it('lifetime levels (<=100) keep the surplus', () => {
    const t = table([
      { level: 3, steps: 100, flowers: 0, stepsMode: 'lifetime' },
      { level: 4, steps: 100, flowers: 0, stepsMode: 'lifetime' },
    ]);
    const r = applyActivity({ level: 2, steps: 0, flowers: 0 }, 150, 0, reqOf(t), 99);
    expect(r.state).toMatchObject({ level: 3 });
    expect(r.state.steps).toBeCloseTo(50);
  });

  it('per-level levels (101+) lose surplus walked while waiting on flowers', () => {
    const t = table([
      { level: 3, steps: 100, flowers: 100, stepsMode: 'perLevel' },
      { level: 4, steps: 100, flowers: 100, stepsMode: 'perLevel' },
    ]);
    const req = reqOf(t);
    const day1 = applyActivity({ level: 2, steps: 0, flowers: 0 }, 300, 50, req, 99); // steps way over, flowers half
    const day2 = applyActivity(day1.state, 0, 50, req, 99); // flowers finish at end of day
    expect(day2.state).toEqual({ level: 3, steps: 0, flowers: 0 });
    expect(day2.wastedSteps).toBe(200);
  });
});

describe('replayLog', () => {
  const t = table([
    { level: 3, steps: 1000, flowers: 100, stepsMode: 'perLevel' },
    { level: 4, steps: 1000, flowers: 100, stepsMode: 'perLevel' },
    { level: 5, steps: 1000, flowers: 100, stepsMode: 'perLevel' },
  ]);
  const req = reqOf(t);

  it('does not level up unless the user says so', () => {
    const p = profile({ currentLevel: 2, goalLevel: 5 });
    const r = replayLog(p, [entry('2026-11-05', 5000, 500)], req, t.maxLevel);
    expect(r.state.level).toBe(2);
    expect(r.readyToLevel).toBe(true);
  });

  it('trusts a level-up the model did not expect: flowers reset, step bank kept only where it carries', () => {
    const p = profile({ currentLevel: 2, goalLevel: 5 });
    const r = replayLog(p, [entry('2026-11-05', 200, 0, { leveledUp: true, newLevel: 3 })], req, t.maxLevel);
    expect(r.state).toEqual({ level: 3, steps: 0, flowers: 0 });
    expect(r.reachedOn[3]).toBe('2026-11-05');
  });

  it('subtracts what was already counted on the setup day', () => {
    const p = profile({ currentLevel: 2, goalLevel: 5, setupTodaySteps: 400, setupTodayFlowers: 30 });
    const r = replayLog(p, [entry('2026-11-04', 1000, 50)], req, t.maxLevel);
    expect(r.state).toEqual({ level: 2, steps: 600, flowers: 20 });
  });

  it('a "game shows" sync replaces the modelled progress', () => {
    const p = profile({ currentLevel: 2, goalLevel: 5 });
    const r = replayLog(p, [entry('2026-11-05', 100, 10, { gameStepsToGo: 250, gameFlowersToGo: 40 })], req, t.maxLevel);
    expect(r.state).toEqual({ level: 2, steps: 750, flowers: 60 });
  });

  it('recomputes the whole chain when a past day changes', () => {
    const p = profile({ currentLevel: 2, goalLevel: 5 });
    const a = replayLog(p, [entry('2026-11-05', 500, 50), entry('2026-11-06', 500, 50, { leveledUp: true, newLevel: 3 })], req, t.maxLevel);
    const b = replayLog(p, [entry('2026-11-05', 900, 50), entry('2026-11-06', 500, 50, { leveledUp: true, newLevel: 3 })], req, t.maxLevel);
    expect(a.state.level).toBe(3);
    expect(b.state.level).toBe(3);
    // In b the steps finish early on day 2, so the level-up time is set by flowers at the end of day 2 either way.
    expect(b.state.flowers).toBeCloseTo(a.state.flowers);
  });
});
