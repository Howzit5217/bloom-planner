import bundled from '../../data/bloom-levels.json';
import { buildHistograms, cellIndex, climateSummary, deriveMonths, explainMonth, isRideable, PRESETS, seasonRatesFromClimate, walkRatesFromClimate, type ClimateDay } from '../climate';
import { entriesToCsv } from '../csv';
import { fmt, fmtHours, roundNice } from '../format';
import { makeReq, parseLevelTable } from '../levels';
import { progressFromInput } from '../onboarding';
import { observedRates, resolveRates } from '../rates';
import { streak } from '../streak';
import { timeCost } from '../timecost';
import { entry } from './helpers';

const day = (date: string, d: Partial<ClimateDay>): ClimateDay => ({
  date,
  precipitation_sum: 0,
  snowfall_sum: 0,
  temperature_2m_max: 20,
  daylight_duration: 14 * 3600,
  wind_speed_10m_max: 10,
  ...d,
});

describe('climate', () => {
  it('isRideable applies the spec thresholds', () => {
    expect(isRideable(day('2020-06-01', {}))).toBe(true);
    expect(isRideable(day('2020-06-01', { snowfall_sum: 1.1 }))).toBe(false);
    expect(isRideable(day('2020-06-01', { precipitation_sum: 5.0 }))).toBe(true);
    expect(isRideable(day('2020-06-01', { precipitation_sum: 5.1 }))).toBe(false);
    expect(isRideable(day('2020-06-01', { temperature_2m_max: 1.9 }))).toBe(false);
    expect(isRideable(day('2020-06-01', { temperature_2m_max: 35.1 }))).toBe(false);
    expect(isRideable(day('2020-06-01', { wind_speed_10m_max: 50.1 }))).toBe(false);
    expect(isRideable(day('2020-06-01', { daylight_duration: 34199 }))).toBe(false);
  });

  it('histograms re-derive every preset exactly as the raw test would', () => {
    const days: ClimateDay[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const m = (i % 12) + 1;
      days.push(
        day(`2020-${String(m).padStart(2, '0')}-10`, {
          precipitation_sum: rnd() < 0.4 ? 0 : Math.round(rnd() * 250) / 10,
          snowfall_sum: rnd() < 0.8 ? 0 : Math.round(rnd() * 50) / 10,
          temperature_2m_max: Math.round((rnd() * 50 - 12) * 10) / 10,
          daylight_duration: 25000 + rnd() * 30000,
          wind_speed_10m_max: rnd() * 70,
        }),
      );
    }
    const cache = buildHistograms(days, 10);
    for (const preset of ['fair', 'normal', 'all'] as const) {
      const months = deriveMonths(cache, preset);
      for (const m of months) {
        const inMonth = days.filter((d) => Number(d.date.slice(5, 7)) === m.month);
        const ok = inMonth.filter((d) => isRideable(d, PRESETS[preset])).length;
        expect(m.rideable).toBe(ok);
        expect(m.days).toBe(inMonth.length);
      }
    }
    // The feels-like bucket (v2) makes it a little bigger; still small enough to keep on the phone.
    expect(JSON.stringify(cache).length).toBeLessThan(12 * 2400);
  });

  it('applies the hot and cold limits on the feels-like high, for riding and walking alike', () => {
    const at = (date: string, feels: number) => day(date, { temperature_2m_max: feels - 3, apparent_temperature_max: feels });
    const days = [at('2020-07-01', 25), at('2020-07-02', 30.2), at('2020-07-03', 33), at('2020-07-04', 38)];
    const cache = buildHistograms(days, 1);
    expect(cache.v).toBe(3);
    // Riding up to 30 feels-like: 25 only (30.2 rounds up past 30). Up to 35: three of four.
    expect(deriveMonths(cache, 'normal', { hot: 30, cold: 2 })[6].rideable).toBe(1);
    expect(deriveMonths(cache, 'normal', { hot: 35, cold: 2 })[6].rideable).toBe(3);
    // Without limits: the old 35°C rule on the actual high (35 is fine, 38 - 3 = 35 too).
    expect(deriveMonths(cache, 'normal')[6].rideable).toBe(4);
    // Walking up to 32 feels-like: two good days of four; the others give 0.4 of a day.
    expect(walkRatesFromClimate(cache, { hot: 32, cold: 2 }, 0.4)[6]).toBeCloseTo(0.5 + 0.5 * 0.4);
    // An old (v1) history has no feels-like bucket: heat can't count, downpours still do.
    expect(walkRatesFromClimate({ ...cache, v: undefined, months: cache.months.map(() => ({})) }, { hot: 32, cold: 2 }, 0.4)[6]).toBe(1);

    // Cold, from -25°C up: a 0°C limit leaves the -8 and -1 days out, for riding and walking.
    const winter = buildHistograms([at('2020-01-01', -8), at('2020-01-02', -1), at('2020-01-03', 1), at('2020-01-04', 6)].map((d) => ({ ...d, daylight_duration: 40000 })), 1);
    expect(deriveMonths(winter, 'all', { hot: 35, cold: 0 })[0].rideable).toBe(2);
    expect(deriveMonths(winter, 'all', { hot: 35, cold: 0 })[0].blockedShare.cold).toBe(0.5);
    expect(walkRatesFromClimate(winter, { hot: 35, cold: 0 }, 0.4)[0]).toBeCloseTo(0.5 + 0.5 * 0.4);
    expect(walkRatesFromClimate(winter, { hot: 35, cold: -10 }, 0.4)[0]).toBe(1);
  });

  it('clamps to 5%-95% and explains why', () => {
    const days = Array.from({ length: 31 }, (_, i) => day(`2021-01-${String(i + 1).padStart(2, '0')}`, { snowfall_sum: 5, temperature_2m_max: -3, daylight_duration: 30000 }));
    const cache = buildHistograms(days, 1);
    const jan = deriveMonths(cache, 'normal')[0];
    expect(jan.rawRate).toBe(0);
    expect(jan.rate).toBe(0.05);
    expect(explainMonth(jan)).toMatch(/^January: 1\.6 rideable days .*Blocked by snow on 100% of days, cold on 100%, short daylight on 100%\.$/);
  });

  it('summarises best and worst months', () => {
    const good = String(cellIndex({ p: 0, s: 0, t: 3, w: 0, d: 3 }));
    const bad = String(cellIndex({ p: 3, s: 0, t: 3, w: 0, d: 3 }));
    const rates = seasonRatesFromClimate(
      { months: Array.from({ length: 12 }, (_, i) => ({ [good]: i === 5 || i === 6 ? 9 : 1, [bad]: i === 0 || i === 1 ? 9 : 1 })), sampleDays: 0, years: 1 },
      'normal',
    );
    const s = climateSummary(rates);
    expect(s.best).toEqual(expect.arrayContaining([6, 7]));
    expect(s.worst).toEqual(expect.arrayContaining([1, 2]));
  });
});

describe('onboarding progress', () => {
  const req = makeReq(parseLevelTable(bundled), {});
  it('converts what the game shows as remaining', () => {
    expect(progressFromInput({ level: 110, remainingMode: true, steps: 479200, flowers: 294900, lifetimeSteps: null }, req)).toMatchObject({ stepsIntoLevel: 0, flowersIntoLevel: 0 });
    expect(progressFromInput({ level: 110, remainingMode: true, steps: 79200, flowers: 4900, lifetimeSteps: null }, req)).toMatchObject({ stepsIntoLevel: 400000, flowersIntoLevel: 290000 });
  });
  it('recovers a lifetime bank below level 100', () => {
    // Level 49 -> 50 needs a lifetime 1,000,000. With 1.2M lifetime the game shows 0 to go; the bank is 245,000.
    const r = progressFromInput({ level: 49, remainingMode: true, steps: 0, flowers: 1000, lifetimeSteps: 1_200_000 }, req);
    expect(r.stepsIntoLevel).toBe(1_200_000 - 955_000);
    expect(r.fromLifetime).toBe(true);
  });
});

describe('time cost (§7.4)', () => {
  const rates = resolveRates({ walkStepsPerHour: 6000, bikeFlowersPerHour: 20000, walkFlowersPerHour: 6000, treadmillAvailable: true });
  it('biking plants the flowers, walking earns every step', () => {
    const c = timeCost(20000, 12600, rates);
    expect(c.bikeHours).toBeCloseTo(0.63);
    // A ride earns no steps, so the walking is the same on a ride day as on any other.
    expect(c.walkHours).toBeCloseTo(20000 / 6000);
    expect(c.totalRideDay).toBeCloseTo(0.63 + 20000 / 6000);
    expect(c.walkWhere).toBe('indoor');
    expect(c.implausible).toBe(false);
  });
  it('flags more than 6 hours a day', () => {
    expect(timeCost(37000, 0, rates).implausible).toBe(true);
    expect(timeCost(20000, 60000, rates).implausible).toBe(true);
    expect(timeCost(20000, 20000, rates).implausible).toBe(false);
  });
});

describe('observed rates (§7.7)', () => {
  it('needs a week of logs and never invents per-hour rates without time logged', () => {
    const rates = resolveRates({ walkStepsPerHour: null, bikeFlowersPerHour: null, walkFlowersPerHour: null, treadmillAvailable: false });
    const few = observedRates([entry('2026-11-01', 20000, 10000)], rates);
    expect(few.ready).toBe(false);
    const week = Array.from({ length: 7 }, (_, i) => entry(`2026-11-0${i + 1}`, 20000 + i * 1000, 10000, i < 4 ? { minutesOut: 30, outMode: 'bike' } : {}));
    const o = observedRates(week, rates);
    expect(o.ready).toBe(true);
    expect(o.medianSteps).toBe(23000);
    expect(o.bikeFlowersPerHour).toBe(20000);
    expect(o.walkFlowersPerHour).toBeNull();
    expect(rates.estimated).toHaveLength(3);
  });
});

describe('streak, csv, format', () => {
  it('counts consecutive days, allowing today to be unlogged', () => {
    const e = ['2026-11-01', '2026-11-02', '2026-11-03'].map((d) => entry(d, 1, 1));
    expect(streak(e, '2026-11-04')).toBe(3);
    expect(streak(e, '2026-11-05')).toBe(0);
  });
  it('escapes CSV safely', () => {
    const csv = entriesToCsv([entry('2026-11-04', 100, 5, { note: '=cmd, "hi"' })]);
    expect(csv.split('\n')[1]).toBe(`2026-11-04,100,5,0,,,,,,,"'=cmd, ""hi"""`);
  });
  it('formats numbers and durations', () => {
    expect(fmt(479200)).toBe('479,200');
    expect(fmtHours(0.63)).toBe('38 min');
    expect(fmtHours(2.3333)).toBe('2h 20m');
    expect(roundNice(23412)).toBe(23500);
  });
});
