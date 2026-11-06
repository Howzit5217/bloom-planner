import bundled from '../../data/bloom-levels.json';
import { daysBetween } from '../dates';
import { canKeepAnyway, CHALLENGE_STEPS, checkDifficulty, DIFFICULTIES, difficultyOfSteps, moreChallenge, pastPossible, planDifficulty } from '../difficulty';
import { checkGoal, MAX_STEPS_EVERY_DAY } from '../goalCheck';
import { makeReq, parseLevelTable } from '../levels';
import { ALL_RIDEABLE } from './helpers';

const rates = { walkStepsPerHour: 6000, bikeFlowersPerHour: 600, walkFlowersPerHour: 3000, treadmillAvailable: false, bikes: true };
/** A day, its average and its busiest the same. */
const day = (steps: number, flowers: number) => [{ steps, flowers }, { steps, flowers }] as const;

describe('plan difficulty', () => {
  it('grades by steps on an average day: white under 6,000, deep purple from 50,000', () => {
    expect(difficultyOfSteps(0)).toBe('easy');
    expect(difficultyOfSteps(5999)).toBe('easy');
    expect(difficultyOfSteps(6000)).toBe('steady');
    expect(difficultyOfSteps(11999)).toBe('steady');
    expect(difficultyOfSteps(12000)).toBe('hard');
    expect(difficultyOfSteps(20000)).toBe('veryHard');
    expect(difficultyOfSteps(49999)).toBe('veryHard');
    expect(difficultyOfSteps(50000)).toBe('extreme');
    expect(DIFFICULTIES).toEqual(['easy', 'steady', 'hard', 'veryHard', 'extreme']);
  });

  it('counts the riding as the steps that time would walk, since riding earns no steps', () => {
    // 3,000 steps is half an hour's walk; 150 flowers is a quarter of an hour on the bike: 4,500 steps' worth.
    expect(planDifficulty(...day(3000, 150), rates)).toEqual({ level: 'easy', hours: 0.75, steps: 4500, riding: true });
    // An hour's walk and half an hour's ride: 9,000 steps' worth.
    expect(planDifficulty(...day(6000, 300), rates)).toEqual({ level: 'steady', hours: 1.5, steps: 9000, riding: true });
    expect(planDifficulty(...day(15000, 0), rates)).toEqual({ level: 'hard', hours: 2.5, steps: 15000, riding: false });
    expect(planDifficulty(...day(30000, 1200), rates).level).toBe('veryHard');
  });

  it('goes by the average day, but a busiest day past the limits makes it extreme', () => {
    expect(planDifficulty({ steps: 5000, flowers: 0 }, { steps: 9000, flowers: 0 }, rates).level).toBe('easy');
    expect(planDifficulty({ steps: 30000, flowers: 0 }, { steps: 60000, flowers: 0 }, rates).level).toBe('extreme');
    // 4,000 flowers is more than six hours at 600 an hour.
    expect(planDifficulty({ steps: 6000, flowers: 2000 }, { steps: 6000, flowers: 4000 }, rates).level).toBe('extreme');
    // 40,000 steps and two hours riding: 52,000 steps' worth on an average day.
    expect(planDifficulty(...day(40000, 1200), rates).level).toBe('extreme');
  });

  it('treats a plan with no riding days as walking only', () => {
    expect(planDifficulty(...day(3000, Infinity), rates)).toEqual({ level: 'easy', hours: 0.5, steps: 3000, riding: false });
  });

  it('without a bike, the walking plants the flowers too: whichever takes longer', () => {
    const walker = { ...rates, bikes: false };
    // 6,000 steps is an hour; 6,000 flowers at 3,000 an hour on foot is two: 12,000 steps' worth.
    expect(planDifficulty(...day(6000, 6000), walker)).toEqual({ level: 'hard', hours: 2, steps: 12000, riding: false });
    expect(planDifficulty(...day(4000, 1500), walker)).toEqual({ level: 'easy', hours: 4000 / 6000, steps: 4000, riding: false });
  });
});

const req = makeReq(parseLevelTable(bundled), {});
const goalBase = { start: { level: 85, steps: 0, flowers: 0 }, startKey: '2026-11-05', seasonRates: ALL_RIDEABLE, req, bikeFlowersPerHour: 20000 };
const fast = { walkStepsPerHour: 6000, bikeFlowersPerHour: 20000, walkFlowersPerHour: 3000, treadmillAvailable: false, bikes: true };

describe('goals past the limits, and goals too easy', () => {
  it('grades an unrealistic goal extreme, and only that kind can be kept anyway', () => {
    const tooHard = checkGoal({ ...goalBase, goalLevel: 100, goalKey: '2027-01-31' });
    expect(tooHard.problem).toBe('tooManySteps');
    expect(tooHard.plan?.status === 'ok' && tooHard.plan.avgStepsPerDay).toBeLessThanOrEqual(MAX_STEPS_EVERY_DAY);
    expect(pastPossible(tooHard)).toBe(false);
    expect(canKeepAnyway(tooHard)).toBe(true);
    expect(checkDifficulty(tooHard, fast)?.level).toBe('extreme');
    const past = checkGoal({ ...goalBase, goalLevel: 90, goalKey: '2026-11-01' });
    expect(canKeepAnyway(past)).toBe(false);
    expect(checkDifficulty(past, fast)).toBeNull();
  });

  it("can't keep a goal past 120,000 steps on an average day: one day like that, yes; every day, no", () => {
    const never = checkGoal({ ...goalBase, goalLevel: 120, goalKey: '2026-12-23' });
    expect(never.problem).toBe('tooManySteps');
    expect(never.plan?.status === 'ok' && never.plan.avgStepsPerDay).toBeGreaterThan(MAX_STEPS_EVERY_DAY);
    expect(pastPossible(never)).toBe(true);
    expect(canKeepAnyway(never)).toBe(false);
    // Still graded, so the plan shows how extreme it would be.
    expect(checkDifficulty(never, fast)?.level).toBe('extreme');
  });

  it('offers a sooner date and a higher level for an easy goal, each still a steady plan', () => {
    const input = { ...goalBase, goalLevel: 86, goalKey: '2027-10-01' };
    expect(checkDifficulty(checkGoal(input), fast)?.level).toBe('easy');
    const more = moreChallenge(input, fast, 150);
    expect(more.date).not.toBeNull();
    expect(daysBetween(more.date!, input.goalKey)).toBeGreaterThan(0);
    expect(checkDifficulty(checkGoal({ ...input, goalKey: more.date! }), fast)!.steps).toBeLessThanOrEqual(CHALLENGE_STEPS);
    expect(more.level).toBeGreaterThan(86);
    expect(checkDifficulty(checkGoal({ ...input, goalLevel: more.level! }), fast)!.steps).toBeLessThanOrEqual(CHALLENGE_STEPS);
    // One more level by then is more than a steady plan.
    expect(checkDifficulty(checkGoal({ ...input, goalLevel: more.level! + 1 }), fast)!.steps).toBeGreaterThan(CHALLENGE_STEPS);
  });
});
