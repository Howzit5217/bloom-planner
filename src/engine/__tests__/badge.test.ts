import { badgeTier } from '../badge';

describe('level badge', () => {
  it('is bronze to 49, silver to 99, gold to 129, gold with red from 130, and gold with green at 150', () => {
    expect([1, 49, 50, 99, 100, 129, 130, 149, 150].map(badgeTier)).toEqual(['bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'top', 'top', 'peak']);
  });
});
