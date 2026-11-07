import { bortleOf } from '../lightPollution';

describe('light pollution', () => {
  it('rates a big city centre the brightest, and its suburbs less', () => {
    expect(bortleOf(1_600_000, 1)).toBe(9);
    expect(bortleOf(1_600_000, 20)).toBe(7);
    expect(bortleOf(1_600_000, 70)).toBe(5);
    expect(bortleOf(8_000_000, 100)).toBe(5);
  });

  it('rates towns by their size', () => {
    expect(bortleOf(300_000, 2)).toBe(8);
    expect(bortleOf(60_000, 2)).toBe(7);
    expect(bortleOf(20_000, 1)).toBe(6);
    expect(bortleOf(3_000, 1)).toBe(5);
    expect(bortleOf(3_000, 5)).toBe(4);
  });

  it('gives a village a dark country sky, and an unknown place a suburb\'s', () => {
    expect(bortleOf(400, 3)).toBe(3);
    expect(bortleOf(null, null)).toBe(5);
  });
});
