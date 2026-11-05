import { DIFFICULTIES, difficultyOfHours, planDifficulty } from '../difficulty';

const rates = { walkStepsPerHour: 6000, bikeFlowersPerHour: 600, walkFlowersPerHour: 3000, treadmillAvailable: false, bikes: true };

describe('plan difficulty', () => {
  it('grades by time on the move: easy, steady, hard, then very hard', () => {
    expect(difficultyOfHours(0)).toBe('easy');
    expect(difficultyOfHours(1.5)).toBe('easy');
    expect(difficultyOfHours(1.6)).toBe('steady');
    expect(difficultyOfHours(3)).toBe('steady');
    expect(difficultyOfHours(4)).toBe('hard');
    expect(difficultyOfHours(4.6)).toBe('veryHard');
    expect(DIFFICULTIES).toEqual(['easy', 'steady', 'hard', 'veryHard']);
  });

  it('adds the walking for the steps to the biking for the flowers, since riding earns no steps', () => {
    // 6,000 steps is an hour's walk; 300 flowers is half an hour on the bike.
    expect(planDifficulty(6000, 300, rates)).toEqual({ level: 'easy', hours: 1.5, riding: true });
    expect(planDifficulty(12000, 600, rates)).toEqual({ level: 'steady', hours: 3, riding: true });
    expect(planDifficulty(24000, 0, rates)).toEqual({ level: 'hard', hours: 4, riding: false });
    expect(planDifficulty(30000, 1200, rates).level).toBe('veryHard');
  });

  it('treats a plan with no riding days as walking only', () => {
    expect(planDifficulty(3000, Infinity, rates)).toEqual({ level: 'easy', hours: 0.5, riding: false });
  });

  it('without a bike, the walking plants the flowers too: whichever takes longer', () => {
    const walker = { ...rates, bikes: false };
    // 6,000 steps is an hour; 6,000 flowers at 3,000 an hour on foot is two.
    expect(planDifficulty(6000, 6000, walker)).toEqual({ level: 'steady', hours: 2, riding: false });
    expect(planDifficulty(12000, 1500, walker)).toEqual({ level: 'steady', hours: 2, riding: false });
  });
});
