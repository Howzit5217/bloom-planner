import { PRESETS } from '../climate';
import { buildPlan, plannedForDay } from '../plan';
import { forecastWeights, rainShare, rideVerdict, walkVerdict, walkWeight, type ForecastWeatherDay } from '../weatherPlan';
import { fmtTemp } from '../units';
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
const limits = { hot: 31, cold: 2 };

describe('the forecast in the plan', () => {
  it('judges heat and cold on the feels-like high, the same for walking and riding', () => {
    // 29 on the thermometer, 34 with the humidity: too hot for both.
    expect(walkVerdict(day('2026-07-01', { tmax: 29, feelsMax: 34 }), limits)).toBe('hot');
    expect(rideVerdict(day('2026-07-01', { tmax: 29, feelsMax: 34 }), PRESETS.normal, limits)).toBe('hot');
    expect(walkVerdict(day('2026-07-01', { tmax: 29, feelsMax: 31 }), limits)).toBe('good');
    expect(rideVerdict(day('2026-07-01', { tmax: 29, feelsMax: 31 }), PRESETS.normal, limits)).toBe('good');
    // 4 on the thermometer, 0 with the wind: too cold for both; the cold limit is the player's, not the preset's.
    expect(walkVerdict(day('2026-01-10', { tmax: 4, feelsMax: 0 }), limits)).toBe('cold');
    expect(rideVerdict(day('2026-01-10', { tmax: 4, feelsMax: 0 }), PRESETS.fair, limits)).toBe('cold');
    expect(rideVerdict(day('2026-01-10', { tmax: 4, feelsMax: 3 }), PRESETS.fair, limits)).toBe('good');
    expect(walkVerdict(day('2026-01-10', { tmax: 4, feelsMax: 0 }), { hot: 31, cold: -5 })).toBe('good');
    expect(rideVerdict(day('2026-07-01', { precip: 8 }), PRESETS.normal, limits)).toBe('wet');
    expect(rideVerdict(day('2026-07-01', { wind: 30, gusts: 80 }), PRESETS.normal, limits)).toBe('wind');
    expect(walkVerdict(day('2026-07-01', { code: 95 }), limits)).toBe('storm');
    expect(walkVerdict(day('2026-07-01', { precip: 8 }), limits)).toBe('good');
  });

  it('weighs each forecast day, from today on', () => {
    const w = forecastWeights(
      [day('2026-07-01'), day('2026-07-02', { feelsMax: 36 }), day('2026-07-03', { precip: 7, precipChance: 30 }), day('2026-06-30')],
      PRESETS.normal,
      limits,
      false,
      '2026-07-01',
    );
    // Rain that may not come (30%) trims a walking day by its chance: 7 mm leaves 58% of a day if it comes.
    expect(w.walk['2026-07-01']).toBe(1);
    expect(w.walk['2026-07-02']).toBe(0.4);
    expect(w.walk['2026-07-03']).toBeCloseTo(1 - 0.42 * 0.3);
    // Rain that may well not come is half a riding day.
    expect(w.ride).toEqual({ '2026-07-01': 1, '2026-07-02': 0, '2026-07-03': 0.5 });
    // A treadmill keeps more of a hot day.
    expect(forecastWeights([day('2026-07-02', { feelsMax: 36 })], PRESETS.normal, limits, true, '2026-07-01').walk['2026-07-02']).toBe(0.75);
  });

  it('makes a walking day lighter for rain that is likely, by how much falls and how likely it is', () => {
    expect(walkVerdict(day('2026-07-01', { precip: 3, precipChance: 80 }), limits)).toBe('rain');
    expect(walkVerdict(day('2026-07-01', { precip: 3, precipChance: 20 }), limits)).toBe('good');
    expect(walkVerdict(day('2026-07-01', { precip: 0.5, precipChance: 90 }), limits)).toBe('good');
    expect(walkVerdict(day('2026-07-01', { precip: 20, precipChance: 90 }), limits)).toBe('wet');
    // A shower trims a day, steady rain takes more, a downpour the most (less with a treadmill).
    expect(rainShare(0.5, false)).toBe(1);
    expect(rainShare(3, false)).toBeCloseTo(0.79);
    expect(rainShare(10, false)).toBeCloseTo(0.58);
    expect(rainShare(20, false)).toBe(0.4);
    expect(rainShare(20, true)).toBe(0.75);
    // Certain steady rain, then the same rain at a 50% chance.
    expect(walkWeight(day('2026-07-01', { precip: 10, precipChance: 100 }), limits, false)).toBeCloseTo(0.58);
    expect(walkWeight(day('2026-07-01', { precip: 10, precipChance: 50 }), limits, false)).toBeCloseTo(0.79);
    // A storm, or heat on top of rain, is a bad day whatever the rain.
    expect(walkWeight(day('2026-07-01', { precip: 3, precipChance: 80, feelsMax: 36 }), limits, false)).toBe(0.4);
  });

  it('asks less of a rainy day and spreads the rest over the others, so the goal still holds', () => {
    const t = table([{ level: 3, steps: 30000, flowers: 0 }]);
    const base = { start: { level: 2, steps: 0, flowers: 0 }, startKey: '2026-07-01', goalKey: '2026-07-03', goalLevel: 3, seasonRates: new Array(12).fill(1), req: reqOf(t) };
    const rain = forecastWeights([day('2026-07-01'), day('2026-07-02', { precip: 10, precipChance: 100 }), day('2026-07-03')], PRESETS.normal, limits, false, '2026-07-01');
    const plan = buildPlan({ ...base, walkDays: rain.walk });
    const [a, b, c] = [0, 1, 2].map((i) => plannedForDay(plan, i).steps);
    // 30,000 over 2.58 walking days: about 11,600 on each dry day, 6,700 on the rainy one.
    expect(b).toBeLessThan(a);
    expect(a).toBeCloseTo(c);
    expect(b).toBeCloseTo(a * 0.58);
    expect(a + b + c).toBeCloseTo(30000);
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
    expect(fmtTemp(35, true)).toBe('95°F');
    expect(fmtTemp(30, true)).toBe('86°F');
  });
});
