import { customProgress } from '../customGoal';
import { entry } from './helpers';

// 1,000,000 steps and 600,000 flowers over 10 days.
const goal = { steps: 1_000_000, flowers: 600_000, startDate: '2026-11-01', endDate: '2026-11-10' };

describe('custom goal at the top level', () => {
  it('counts only the days inside the goal and spreads the rest over the days left', () => {
    const entries = [entry('2026-10-31', 999_999, 999_999), entry('2026-11-01', 100_000, 60_000), entry('2026-11-02', 100_000, 60_000)];
    const p = customProgress(goal, entries, '2026-11-03', false);
    expect(p.steps.done).toBe(200_000);
    expect(p.flowers.remaining).toBe(480_000);
    expect(p.daysLeft).toBe(8);
    expect(p.stepsPerDay).toBe(100_000);
    expect(p.flowersPerDay).toBe(60_000);
    expect(p.aheadDays).toBe(0);
    expect(p.reached).toBe(false);
    expect(p.passed).toBe(false);
  });

  it('is judged by whichever is further behind', () => {
    const p = customProgress(goal, [entry('2026-11-01', 500_000, 0)], '2026-11-02', false);
    expect(p.aheadDays).toBe(-1);
  });

  it('is reached when both are done, and passed when the end date goes by first', () => {
    expect(customProgress(goal, [entry('2026-11-05', 1_000_000, 600_000)], '2026-11-05', true).reached).toBe(true);
    const late = customProgress(goal, [entry('2026-11-05', 10, 10)], '2026-11-11', false);
    expect(late.passed).toBe(true);
    expect(late.daysLeft).toBe(0);
  });
});
