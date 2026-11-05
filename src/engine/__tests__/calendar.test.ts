import { addMonths, monthGrid, uses12HourClock, weekdayHeadings, weekStartFor } from '../calendar';

describe('in-house calendar', () => {
  it('lays a month out in whole weeks from Sunday', () => {
    // November 2026 starts on a Sunday and has 30 days.
    const g = monthGrid({ year: 2026, month: 10 }, 0);
    expect(g[0][0]).toBe('2026-11-01');
    expect(g).toHaveLength(5);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g[4][1]).toBe('2026-11-30');
    expect(g[4][2]).toBeNull();
  });

  it('lays a month out from Monday', () => {
    const g = monthGrid({ year: 2026, month: 10 }, 1);
    expect(g[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(g[0][6]).toBe('2026-11-01');
    expect(g).toHaveLength(6);
  });

  it('handles leap years and February starting on the week start', () => {
    expect(monthGrid({ year: 2028, month: 1 }, 0).flat().filter(Boolean)).toHaveLength(29);
    // February 2026 starts on a Sunday: exactly 4 rows.
    expect(monthGrid({ year: 2026, month: 1 }, 0)).toHaveLength(4);
  });

  it('steps months across years', () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2027, month: 0 }, -1)).toEqual({ year: 2026, month: 11 });
    expect(addMonths({ year: 2026, month: 10 }, 26)).toEqual({ year: 2029, month: 0 });
  });

  it('starts the week where the phone region does', () => {
    expect(weekStartFor('en-US')).toBe(0);
    expect(weekStartFor('en-GB')).toBe(1);
    expect(weekStartFor('de-DE')).toBe(1);
    expect(weekStartFor('ja-JP')).toBe(0);
    expect(weekStartFor('zh-Hant-TW')).toBe(0);
    expect(weekStartFor('en')).toBe(0);
    expect(weekStartFor(undefined)).toBe(1);
    expect(weekdayHeadings(1)[0]).toEqual({ short: 'M', name: 'Monday' });
    expect(weekdayHeadings(0)[6].name).toBe('Saturday');
  });

  it('reads the clock style from a formatted 1 pm', () => {
    expect(uses12HourClock('1 PM')).toBe(true);
    expect(uses12HourClock('13')).toBe(false);
    expect(uses12HourClock('13:00')).toBe(false);
  });
});
