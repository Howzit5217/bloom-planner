import { PRESETS } from '../climate';
import { severeName, severeOf } from '../severe';
import { rideVerdict, walkVerdict, walkWeight, type ForecastWeatherDay } from '../weatherPlan';

const day = (d: Partial<ForecastWeatherDay> = {}): ForecastWeatherDay => ({
  date: '2026-07-01',
  feelsMax: 24,
  tmax: 24,
  precip: 0,
  precipChance: 0,
  snow: 0,
  wind: 10,
  gusts: 20,
  humidity: 50,
  daylight: 14 * 3600,
  code: 1,
  ...d,
});
const limits = { hot: 35, cold: 2 };

describe('severe weather', () => {
  it('knows a dangerous day from an ordinary bad one', () => {
    expect(severeOf(day())).toEqual([]);
    // A thunderstorm alone is just a stormy day; with hail, or strong gusts, it's a severe one.
    expect(severeOf(day({ code: 95, gusts: 40 }))).toEqual([]);
    expect(severeOf(day({ code: 96 }))).toEqual(['hail']);
    expect(severeOf(day({ code: 95, gusts: 85 }))).toEqual(['thunderstorm']);
    expect(severeOf(day({ gusts: 95 }))).toEqual(['wind']);
    expect(severeOf(day({ snow: 20 }))).toEqual(['snowstorm']);
    expect(severeOf(day({ snow: 5 }))).toEqual([]);
    expect(severeOf(day({ feelsMax: 43 }))).toEqual(['heat']);
    expect(severeOf(day({ feelsMax: -22 }))).toEqual(['cold']);
    // The worst first.
    expect(severeOf(day({ code: 99, gusts: 100 }))).toEqual(['hail', 'wind']);
  });

  it('asks very little of a severe day, less than of a merely stormy one', () => {
    const severe = day({ code: 96 });
    expect(walkVerdict(severe, limits)).toBe('severe');
    expect(rideVerdict(severe, PRESETS.normal, limits)).toBe('severe');
    expect(walkWeight(severe, limits, false)).toBeLessThan(walkWeight(day({ code: 95 }), limits, false));
    expect(walkWeight(severe, limits, false)).toBeCloseTo(0.15);
    // Indoors (a treadmill), a fair amount still.
    expect(walkWeight(severe, limits, true)).toBeCloseTo(0.6);
  });

  it('names it as a forecast would', () => {
    const t = (s: string) => s;
    expect(severeName('hail', t)).toBe('Thunderstorms with hail');
    expect(severeName('snowstorm', t)).toBe('Heavy snow');
  });
});
