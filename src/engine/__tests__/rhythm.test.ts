import { addDaysKey, fromKey } from '../dates';
import { buildPlan, plannedForDay } from '../plan';
import { DEFAULT_RHYTHM, EASY_SHARE, isEasyDay, makeRhythm } from '../rhythm';
import { cToF, fmtTemp, fToC, usesF } from '../units';
import { ALL_RIDEABLE, reqOf, table } from './helpers';

describe("the week's rhythm", () => {
  const rhythm = makeRhythm(DEFAULT_RHYTHM)!;
  // 2 November 2026 is a Monday.
  const days = Array.from({ length: 28 }, (_, i) => fromKey(addDaysKey('2026-11-02', i)));

  it('asks less on the easy days and a little more on the others, about even over a week', () => {
    for (const d of days) {
      const share = rhythm(d);
      if (d.getDay() === 0 || d.getDay() === 3) expect(share).toBeLessThan(EASY_SHARE * 1.08);
      else expect(share).toBeGreaterThan(1.05);
    }
    const mean = days.reduce((n, d) => n + rhythm(d), 0) / days.length;
    expect(mean).toBeGreaterThan(0.97);
    expect(mean).toBeLessThan(1.03);
  });

  it('never asks the same two days running', () => {
    for (let i = 1; i < days.length; i++) expect(Math.abs(rhythm(days[i]) - rhythm(days[i - 1]))).toBeGreaterThan(0.001);
    // The same date always asks the same.
    expect(rhythm(fromKey('2026-11-05'))).toBe(rhythm(fromKey('2026-11-05')));
  });

  it('can be turned off, and treats every day easy as none', () => {
    expect(makeRhythm({ vary: false, easyDays: [0] })).toBeUndefined();
    const even = makeRhythm({ vary: true, easyDays: [0, 1, 2, 3, 4, 5, 6] })!;
    for (const d of days) expect(Math.abs(even(d) - 1)).toBeLessThan(0.08);
    expect(isEasyDay(DEFAULT_RHYTHM, fromKey('2026-11-08'))).toBe(true);
    expect(isEasyDay(DEFAULT_RHYTHM, fromKey('2026-11-09'))).toBe(false);
  });

  it('shapes the plan: lighter easy days, and still there on time', () => {
    const t = table([{ level: 3, steps: 100000, flowers: 20000 }]);
    const input = { start: { level: 2, steps: 0, flowers: 0 }, startKey: '2026-11-02', goalKey: '2026-11-29', goalLevel: 3, seasonRates: ALL_RIDEABLE, req: reqOf(t) };
    const flat = buildPlan(input);
    const plan = buildPlan({ ...input, rhythm });
    expect(plan.status).toBe('ok');
    const steps = Array.from({ length: plan.calendarDays }, (_, i) => plannedForDay(plan, i).steps);
    const flowers = Array.from({ length: plan.calendarDays }, (_, i) => plannedForDay(plan, i).flowersIfRiding);
    // Sunday 8th and Wednesday 4th against Monday 2nd and Thursday 5th.
    expect(steps[6]).toBeLessThan(steps[0] * 0.65);
    expect(steps[2]).toBeLessThan(steps[3] * 0.65);
    expect(flowers[6]).toBeLessThan(flowers[0] * 0.65);
    // The whole plan still comes to what's left, by the goal date.
    expect(steps.reduce((a, b) => a + b, 0)).toBeCloseTo(100000, -1);
    expect(plan.endT).toBeLessThanOrEqual(plan.calendarDays + 1e-6);
    // An even plan asks the same every day.
    expect(plannedForDay(flat, 0).steps).toBeCloseTo(plannedForDay(flat, 6).steps, 6);
  });
});

describe('temperatures', () => {
  it('follow the setting, or the phone where it says so', () => {
    expect(usesF('f')).toBe(true);
    expect(usesF('c', 'en-US')).toBe(false);
    expect(usesF('auto', 'en-US')).toBe(true);
    expect(usesF('auto', 'en-GB')).toBe(false);
    expect(fmtTemp(35, true)).toBe('95°F');
    expect(fmtTemp(35, false)).toBe('35°C');
    expect(fToC(cToF(27.5))).toBeCloseTo(27.5);
  });
});
