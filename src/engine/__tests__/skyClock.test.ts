import { LAPSE_FROM, LAPSE_STEP_MS, lapseSteps } from '../skyClock';

const H = 3600_000;

describe("the sky's run-through on coming back", () => {
  it('moves straight on after a short time away', () => {
    expect(lapseSteps(0, LAPSE_FROM - 1)).toEqual([LAPSE_FROM - 1]);
  });

  it('runs through a long time away in steps, always forward, ending at now', () => {
    const steps = lapseSteps(0, 3 * H);
    expect(steps[steps.length - 1]).toBe(3 * H);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it('ramps up and slows down again, with no step much bigger than the next', () => {
    const steps = [0, ...lapseSteps(0, 6 * H)];
    const moves = steps.slice(1).map((t, i) => t - steps[i]);
    const most = moves.indexOf(Math.max(...moves));
    // Slow off, fastest in the middle, slow into the present.
    expect(moves[0]).toBeLessThan(moves[most] / 4);
    expect(moves[moves.length - 1]).toBeLessThan(moves[most] / 4);
    expect(most).toBeGreaterThan(moves.length * 0.3);
    expect(most).toBeLessThan(moves.length * 0.7);
    // Smooth: each step close to the one before.
    for (let i = 1; i < moves.length; i++) expect(Math.abs(moves[i] - moves[i - 1])).toBeLessThan(moves[most] * 0.35);
  });

  it('takes longer the longer it has been, and goes faster at its height', () => {
    const short = lapseSteps(0, H);
    const long = lapseSteps(0, 12 * H);
    expect(long.length).toBeGreaterThan(short.length);
    expect(long.length * LAPSE_STEP_MS).toBeLessThanOrEqual(4000 + LAPSE_STEP_MS);
    const peak = (s: number[]) => Math.max(...s.map((t, i) => t - (i ? s[i - 1] : 0)));
    expect(peak(long)).toBeGreaterThan(peak(short) * 3);
  });

  it('runs through at most half a day', () => {
    const steps = lapseSteps(0, 5 * 24 * H);
    expect(steps[0]).toBeGreaterThan(5 * 24 * H - 12 * H);
  });
});
