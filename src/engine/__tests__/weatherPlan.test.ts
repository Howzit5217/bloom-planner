import { PRESETS } from '../climate';
import { buildPlan, plannedForDay } from '../plan';
import { forecastWeights, rideVerdict, toF, walkVerdict, type ForecastWeatherDay } from '../weatherPlan';
import { reqOf, table } from './helpers';

const day = (date: string, d: Partial<ForecastWeatherDay> = {}): ForecastWeatherDay => ({
  date,
  feelsMax: 22,
  tmax: 21,
  precip: 0,
  precipChance: 0,
  snow: 0,
  wind: 10,
  gusts: 20,
  humidity: 50,
  daylight: 12 * 3600,
  code: 1,
  ...d,
});
const heat = { walk: 32, bike: 30 };

describe('the forecast in the plan', () => {
  it('judges heat on the feels-like high, and the other weather for riding', () => {
    // 29 on the thermometer, 34 with the humidity: too hot for both.
    expect(walkVerdict(day('2026-07-01', { tmax: 29, feelsMax: 34 }), heat)).toBe('hot');
    expect(rideVerdict(day('2026-07-01', { tmax: 29, feelsMax: 31 }), PRESETS.normal, heat)).toBe('hot');
    expect(walkVerdict(day('2026-07-01', { tmax: 29, feelsMax: 31 }), heat)).toBe('good');
    expect(rideVerdict(day('2026-07-01', { precip: 8 }), PRESETS.normal, heat)).toBe('wet');
    expect(rideVerdict(day('2026-07-01', { wind: 30, gusts: 80 }), PRESETS.normal, heat)).toBe('wind');
    expect(walkVerdict(day('2026-07-01', { code: 95 }), heat)).toBe('storm');
    expect(walkVerdict(day('2026-07-01', { precip: 8 }), heat)).toBe('good');
  });

  it('weighs each forecast day, from today on', () => {
    const w = forecastWeights(
      [day('2026-07-01'), day('2026-07-02', { feelsMax: 36 }), day('2026-07-03', { precip: 7, precipChance: 30 }), day('2026-06-30')],
      PRESETS.normal,
      heat,
      false,
      '2026-07-01',
    );
    expect(w.walk).toEqual({ '2026-07-01': 1, '2026-07-02': 0.4, '2026-07-03': 1 });
    // Rain that may well not come is half a riding day.
    expect(w.ride).toEqual({ '2026-07-01': 1, '2026-07-02': 0, '2026-07-03': 0.5 });
    // A treadmill keeps more of a hot day.
    expect(forecastWeights([day('2026-07-02', { feelsMax: 36 })], PRESETS.normal, heat, true, '2026-07-01').walk['2026-07-02']).toBe(0.75);
  });

  it('moves steps off a hot day onto the good ones', () => {
    const t = table([{ level: 3, steps: 30000, flowers: 0 }]);
    const base = { start: { level: 2, steps: 0, flowers: 0 }, startKey: '2026-07-01', goalKey: '2026-07-03', goalLevel: 3, seasonRates: new Array(12).fill(1), req: reqOf(t) };
    const even = buildPlan(base);
    expect(plannedForDay(even, 1).steps).toBeCloseTo(10000);
    const hot = buildPlan({ ...base, walkDays: { '2026-07-02': 0.4 } });
    // 30,000 over 2.4 walking days: 12,500 on each good day, 5,000 on the hot one.
    expect(plannedForDay(hot, 0).steps).toBeCloseTo(12500);
    expect(plannedForDay(hot, 1).steps).toBeCloseTo(5000);
    expect(plannedForDay(hot, 0).steps + plannedForDay(hot, 1).steps + plannedForDay(hot, 2).steps).toBeCloseTo(30000);
  });

  it('shows a limit in Fahrenheit too', () => {
    expect(toF(35)).toBe(95);
    expect(toF(30)).toBe(86);
  });
});
