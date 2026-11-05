// The weather's say in the plan. The forecast's next two weeks get a weight each for walking and for
// riding; beyond that, each month's share of good days from ten years of history. Heat is judged on
// the feels-like high, so humidity (and wind) count as well as the thermometer.
import type { Thresholds } from './climate';
import type { DayWeights } from './plan';

/** One forecast day (Open-Meteo daily). */
export interface ForecastWeatherDay {
  date: string;
  /** Feels-like high, °C. */
  feelsMax: number | null;
  tmax: number | null;
  /** mm and % chance. */
  precip: number | null;
  precipChance: number | null;
  /** cm */
  snow: number | null;
  /** km/h */
  wind: number | null;
  gusts: number | null;
  /** Average relative humidity, %. */
  humidity: number | null;
  /** Seconds of daylight. */
  daylight: number | null;
  /** WMO code (95+ is a thunderstorm). */
  code: number | null;
}

export interface HeatLimits {
  /** Too hot to walk far above this feels-like high, °C (null: no limit). */
  walk: number | null;
  /** Too hot to ride above this feels-like high, °C. */
  bike: number | null;
}

export const DEFAULT_HEAT: HeatLimits = { walk: 35, bike: 35 };

/**
 * How much of a full walking day is left when it's too hot, or pouring: some steps still happen
 * (errands, a short walk), more with a treadmill or indoor walking.
 */
export const walkFallback = (indoor: boolean) => (indoor ? 0.75 : 0.4);

export type DayVerdict = 'good' | 'hot' | 'wet' | 'snow' | 'storm' | 'wind' | 'cold' | 'dark';

export interface ForecastWeights {
  walk: DayWeights;
  ride: DayWeights;
  /** The forecast itself, by date, for showing it. */
  day: Record<string, ForecastWeatherDay>;
  /** Why each day is weighed as it is, for walking and for riding. */
  why: Record<string, { walk: DayVerdict; ride: DayVerdict }>;
}

const feels = (d: ForecastWeatherDay) => d.feelsMax ?? d.tmax;

/** A day for walking: too hot (feels-like), a downpour, heavy snow or a storm cuts it down. */
export function walkVerdict(d: ForecastWeatherDay, heat: HeatLimits): DayVerdict {
  if ((d.code ?? 0) >= 95) return 'storm';
  if ((d.snow ?? 0) > 3) return 'snow';
  if ((d.precip ?? 0) > 15) return 'wet';
  const f = feels(d);
  if (heat.walk != null && f != null && f > heat.walk) return 'hot';
  return 'good';
}

/** A day for riding: the weather threshold preset (rain, snow, cold, wind, daylight) plus the heat limit. */
export function rideVerdict(d: ForecastWeatherDay, th: Thresholds, heat: HeatLimits): DayVerdict {
  if ((d.code ?? 0) >= 95) return 'storm';
  if ((d.snow ?? 0) > th.maxSnow) return 'snow';
  if ((d.precip ?? 0) > th.maxPrecip) return 'wet';
  const f = feels(d);
  if (f != null && heat.bike != null && f > heat.bike) return 'hot';
  if (d.tmax != null && d.tmax < th.minTmax) return 'cold';
  if (Math.max(d.wind ?? 0, (d.gusts ?? 0) * 0.75) > th.maxWind) return 'wind';
  if (d.daylight != null && d.daylight < th.minDaylight) return 'dark';
  return 'good';
}

/**
 * Weights for the forecast's days. Riding: 1 on a good day, 0 on a bad one, except rain that may not
 * come (under a 50% chance) is half a day. Walking: 1, or the fallback share on a hot or wet day.
 * Days from `from` on only (earlier ones are already logged).
 */
export function forecastWeights(days: ForecastWeatherDay[], th: Thresholds, heat: HeatLimits, indoor: boolean, from: string): ForecastWeights {
  const walk: DayWeights = {};
  const ride: DayWeights = {};
  const why: ForecastWeights['why'] = {};
  const day: ForecastWeights['day'] = {};
  for (const d of days) {
    if (d.date < from) continue;
    day[d.date] = d;
    const w = walkVerdict(d, heat);
    const r = rideVerdict(d, th, heat);
    walk[d.date] = w === 'good' ? 1 : walkFallback(indoor);
    ride[d.date] = r === 'good' ? 1 : r === 'wet' && (d.precipChance ?? 100) < 50 ? 0.5 : 0;
    why[d.date] = { walk: w, ride: r };
  }
  return { walk, ride, why, day };
}

/** °C to °F, for showing a limit both ways. */
export const toF = (c: number) => Math.round((c * 9) / 5 + 32);
