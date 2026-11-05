import { nextOnLoop, turnsOff } from '../skia/digitLoop';

describe('rolling digits', () => {
  it('rolls forward when the number goes up: 9 to 0 is one step, like 5 to 6', () => {
    expect(nextOnLoop(5, 6, 1)).toBe(6);
    expect(nextOnLoop(9, 0, 1)).toBe(10);
    // 105 to 112: the last digit runs on through 6, 7, 8, 9, 0, 1 to 2.
    expect(nextOnLoop(5, 2, 1)).toBe(12);
  });

  it('rolls back when the number goes down: 0 to 9 is one step, like 6 to 5', () => {
    expect(nextOnLoop(6, 5, -1)).toBe(5);
    expect(nextOnLoop(0, 9, -1)).toBe(-1);
    expect(nextOnLoop(2, 8, -1)).toBe(-2);
  });

  it("doesn't move a digit that stays the same, and goes the short way when there's no direction", () => {
    expect(nextOnLoop(7, 7, 1)).toBe(7);
    expect(nextOnLoop(7, 7, -1)).toBe(7);
    expect(nextOnLoop(9, 0, 0)).toBe(10);
    expect(nextOnLoop(1, 8, 0)).toBe(-2);
  });

  it('keeps a place near 0..9 in whole turns, showing the same digit', () => {
    expect(turnsOff(12)).toBe(10);
    expect(turnsOff(-1)).toBe(-10);
    expect(turnsOff(7)).toBe(0);
    expect(((12 - turnsOff(12)) % 10 + 10) % 10).toBe(2);
  });
});
