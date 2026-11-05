import { addDaysKey } from '../dates';
import { computeDashboard } from '../summary';
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
