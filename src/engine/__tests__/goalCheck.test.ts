import bundled from '../../data/bloom-levels.json';
import { addDaysKey, daysBetween } from '../dates';
import { checkGoal, earliestReasonableDate, MAX_STEPS_PER_DAY } from '../goalCheck';
import { makeReq, parseLevelTable } from '../levels';
import { ALL_RIDEABLE } from './helpers';

const req = makeReq(parseLevelTable(bundled), {});
const START = '2026-11-05';
const base = { start: { level: 85, steps: 0, flowers: 0 }, startKey: START, seasonRates: ALL_RIDEABLE, req, bikeFlowersPerHour: 20000 };

describe('goal check', () => {
  it('blocks a goal that needs more than 50,000 steps a day', () => {
    const c = checkGoal({ ...base, goalLevel: 120, goalKey: '2026-12-23' });
    expect(c.ok).toBe(false);
    expect(c.problem).toBe('tooManySteps');
    expect(c.stepsPerDay).toBeGreaterThan(MAX_STEPS_PER_DAY);
  });

  it('accepts a sensible goal', () => {
    const c = checkGoal({ ...base, goalLevel: 86, goalKey: '2027-01-31' });
    expect(c.ok).toBe(true);
    expect(c.problem).toBeNull();
    expect(c.stepsPerDay).toBeLessThanOrEqual(MAX_STEPS_PER_DAY);
  });

  it('blocks a goal that is not above the current level, or in the past', () => {
    expect(checkGoal({ ...base, goalLevel: 85, goalKey: '2027-01-31' }).problem).toBe('levelTooLow');
    expect(checkGoal({ ...base, goalLevel: 90, goalKey: '2026-11-01' }).problem).toBe('past');
  });

  it('blocks flowers when no day before the goal is rideable', () => {
    const c = checkGoal({ ...base, goalLevel: 90, goalKey: '2027-06-01', seasonRates: new Array(12).fill(0) });
    expect(c.ok).toBe(false);
    expect(c.problem).toBe('noRideDays');
  });

  it('blocks more riding than a day can hold', () => {
    // At 1,000 flowers an hour, six hours is only 6,000 flowers a riding day.
    const c = checkGoal({ ...base, bikeFlowersPerHour: 1000, goalLevel: 95, goalKey: '2027-03-01' });
    expect(c.problem).toBe('tooManyFlowers');
    expect(c.maxFlowersPerRideDay).toBe(6000);
  });

  it('finds the earliest reasonable date, and the day before it is not', () => {
    const d = earliestReasonableDate({ ...base, goalLevel: 120 });
    expect(d).not.toBeNull();
    expect(checkGoal({ ...base, goalLevel: 120, goalKey: d! }).ok).toBe(true);
    expect(checkGoal({ ...base, goalLevel: 120, goalKey: addDaysKey(d!, -1) }).ok).toBe(false);
    expect(daysBetween(START, d!)).toBeGreaterThan(100);
  });

  it('says so when nothing within ten years works', () => {
    expect(earliestReasonableDate({ ...base, goalLevel: 120, seasonRates: new Array(12).fill(0) })).toBeNull();
  });
});
