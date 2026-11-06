import { LAPSE_FROM, lapseSteps } from '../skyClock';

const H = 3600_000;

describe("the sky's run-through on coming back", () => {
  it('moves straight on after a short time away', () => {
    expect(lapseSteps(0, LAPSE_FROM - 1)).toEqual([LAPSE_FROM - 1]);
  });

  it('runs through a long time away in steps, always forward, ending at now', () => {
    const steps = lapseSteps(0, 3 * H);
    expect(steps.length).toBe(9);
    expect(steps[steps.length - 1]).toBe(3 * H);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    // Off quickly, slowing into the present: the first step covers more than the last.
    expect(steps[0]).toBeGreaterThan(3 * H - steps[steps.length - 2]);
  });

  it('runs through at most half a day, in at most 16 steps', () => {
    const steps = lapseSteps(0, 5 * 24 * H);
    expect(steps.length).toBe(16);
    expect(steps[0]).toBeGreaterThan(5 * 24 * H - 12 * H);
  });
});
