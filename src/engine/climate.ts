import { MONTHS, listJoin } from './format';
import type { SeasonRate, ThresholdPreset } from './types';

/** One historical day from Open-Meteo's archive API. */
export interface ClimateDay {
  date: string;
  precipitation_sum: number | null; // mm
  snowfall_sum: number | null; // cm
  temperature_2m_max: number | null; // °C
  temperature_2m_min?: number | null;
  daylight_duration: number | null; // s
  wind_speed_10m_max: number | null; // km/h
  /** Feels-like high (heat with humidity, wind chill): what the heat limits are judged on. */
  apparent_temperature_max?: number | null; // °C
}

export interface Thresholds {
  maxPrecip: number; // mm, blocked when above
  maxSnow: number; // cm, blocked when above
  minTmax: number; // °C, blocked when below
  maxTmax: number; // °C, blocked when above
  maxWind: number; // km/h, blocked when above
  minDaylight: number; // s, blocked when below
}

export const PRESETS: Record<ThresholdPreset, Thresholds> = {
  /** Stricter: no precipitation at all, at least 5°C, 11h of daylight. */
  fair: { maxPrecip: 0, maxSnow: 0, minTmax: 5, maxTmax: 35, maxWind: 50, minDaylight: 11 * 3600 },
  /** The defaults. */
  normal: { maxPrecip: 5, maxSnow: 1, minTmax: 2, maxTmax: 35, maxWind: 50, minDaylight: 34200 },
  /** Looser: up to 15mm rain, 3cm snow, down to -5°C, 8h daylight. */
  all: { maxPrecip: 15, maxSnow: 3, minTmax: -5, maxTmax: 35, maxWind: 50, minDaylight: 8 * 3600 },
};

export const PRESET_LABELS: Record<ThresholdPreset, string> = {
  fair: 'Fair weather',
  normal: 'Normal',
  all: 'All weather',
};

/** §9.3 with the normal thresholds, exactly as specified. */
export function isRideable(d: ClimateDay, th: Thresholds = PRESETS.normal): boolean {
  if ((d.snowfall_sum ?? 0) > th.maxSnow) return false;
  if ((d.precipitation_sum ?? 0) > th.maxPrecip) return false;
  if ((d.temperature_2m_max ?? 0) < th.minTmax) return false;
  if ((d.temperature_2m_max ?? 0) > th.maxTmax) return false;
  if ((d.wind_speed_10m_max ?? 0) > th.maxWind) return false;
  if ((d.daylight_duration ?? 0) < th.minDaylight) return false;
  return true;
}

// ─── Histogram cache ───
// Each day is binned on every edge any preset uses, so every preset can be re-derived exactly
// without the raw series. Bins:
//   precip   0: <=0   1: (0,5]   2: (5,15]   3: >15
//   snow     0: <=0   1: (0,1]   2: (1,3]    3: >3
//   tmax     0: <-5   1: [-5,2)  2: [2,5)    3: [5,35]   4: >35
//   wind     0: <=50  1: >50
//   daylight 0: <8h   1: [8h,9.5h)  2: [9.5h,11h)  3: >=11h
const NB = { p: 4, s: 4, t: 5, w: 2, d: 4 } as const;
// v2 adds the feels-like high in whole degrees, so a heat limit of any whole degree is exact:
//   h = ceil(feels-like) clamped to 10..50, stored as h - 10 (0..40). "Too hot above X" is h + 10 > X.
const H_MIN = 10;
const H_MAX = 50;
const NH = H_MAX - H_MIN + 1;

export interface Cell {
  p: number;
  s: number;
  t: number;
  w: number;
  d: number;
  /** v2: the feels-like high bucket (0 = 10°C or below ... 40 = 50°C or above). */
  h?: number;
}

export function binDay(day: ClimateDay): Cell | null {
  const { precipitation_sum: p, snowfall_sum: s, temperature_2m_max: t, wind_speed_10m_max: w, daylight_duration: d } = day;
  if (p == null || s == null || t == null || w == null || d == null) return null;
  const feels = day.apparent_temperature_max ?? t;
  return {
    p: p <= 0 ? 0 : p <= 5 ? 1 : p <= 15 ? 2 : 3,
    s: s <= 0 ? 0 : s <= 1 ? 1 : s <= 3 ? 2 : 3,
    t: t < -5 ? 0 : t < 2 ? 1 : t < 5 ? 2 : t <= 35 ? 3 : 4,
    w: w <= 50 ? 0 : 1,
    d: d < 28800 ? 0 : d < 34200 ? 1 : d < 39600 ? 2 : 3,
    h: Math.min(H_MAX, Math.max(H_MIN, Math.ceil(feels))) - H_MIN,
  };
}

/** The feels-like high a v2 cell stands for, in °C (its upper bound). */
export const cellFeels = (c: Cell) => (c.h == null ? null : c.h + H_MIN);

const coarseIndex = (c: Cell) => (((c.p * NB.s + c.s) * NB.t + c.t) * NB.w + c.w) * NB.d + c.d;
/** A cell's key: v2 cells (with h) carry the feels-like bucket too. */
export const cellIndex = (c: Cell) => (c.h == null ? coarseIndex(c) : coarseIndex(c) * NH + c.h);

export function cellFromIndex(i: number, v2 = false): Cell {
  let h: number | undefined;
  if (v2) {
    h = i % NH;
    i = Math.floor(i / NH);
  }
  const d = i % NB.d;
  i = Math.floor(i / NB.d);
  const w = i % NB.w;
  i = Math.floor(i / NB.w);
  const t = i % NB.t;
  i = Math.floor(i / NB.t);
  const s = i % NB.s;
  const p = Math.floor(i / NB.s);
  return h == null ? { p, s, t, w, d } : { p, s, t, w, d, h };
}

/** Sparse joint histogram for one month: cellIndex -> day count. */
export type MonthHistogram = Record<string, number>;

export interface ClimateCache {
  /** 12 histograms, January first. */
  months: MonthHistogram[];
  sampleDays: number;
  years: number;
  /** 2: cells carry the feels-like high (heat limits apply). Older caches are re-fetched when online. */
  v?: 2;
}

export function buildHistograms(days: ClimateDay[], years: number): ClimateCache {
  const months: MonthHistogram[] = Array.from({ length: 12 }, () => ({}));
  let sampleDays = 0;
  for (const day of days) {
    const cell = binDay(day);
    if (!cell) continue;
    const m = Number(day.date.slice(5, 7)) - 1;
    if (!(m >= 0 && m < 12)) continue;
    const key = String(cellIndex(cell));
    months[m][key] = (months[m][key] ?? 0) + 1;
    sampleDays++;
  }
  return { months, sampleDays, years, v: 2 };
}

export type Reason = 'snow' | 'rain' | 'cold' | 'heat' | 'wind' | 'dark';

/**
 * Which thresholds of a preset block a binned day. Exact on the bin edges by construction. With a
 * biking heat limit (°C, feels-like) and a v2 cell, heat is judged on that; otherwise on 35°C.
 */
function blocked(c: Cell, preset: ThresholdPreset, bikeMax?: number | null): Reason[] {
  const r: Reason[] = [];
  const pMax = preset === 'fair' ? 0 : preset === 'normal' ? 1 : 2;
  const sMax = preset === 'fair' ? 0 : preset === 'normal' ? 1 : 2;
  const tMin = preset === 'fair' ? 3 : preset === 'normal' ? 2 : 1;
  const dMin = preset === 'fair' ? 3 : preset === 'normal' ? 2 : 1;
  if (c.s > sMax) r.push('snow');
  if (c.p > pMax) r.push('rain');
  if (c.t < tMin) r.push('cold');
  if (bikeMax != null && c.h != null ? c.h + H_MIN > bikeMax : c.t > 3) r.push('heat');
  if (c.w > 0) r.push('wind');
  if (c.d < dMin) r.push('dark');
  return r;
}

export const RATE_MIN = 0.05;
export const RATE_MAX = 0.95;
export const clampRate = (x: number) => Math.min(RATE_MAX, Math.max(RATE_MIN, x));

export interface MonthClimate {
  month: number; // 1-12
  rate: number; // clamped
  rawRate: number;
  days: number;
  rideable: number;
  blockedShare: Record<Reason, number>;
}

export function deriveMonths(cache: ClimateCache, preset: ThresholdPreset, bikeMax?: number | null): MonthClimate[] {
  const v2 = cache.v === 2;
  return cache.months.map((hist, i) => {
    let total = 0;
    let ok = 0;
    const counts: Record<Reason, number> = { snow: 0, rain: 0, cold: 0, heat: 0, wind: 0, dark: 0 };
    for (const [k, n] of Object.entries(hist)) {
      const reasons = blocked(cellFromIndex(Number(k), v2), preset, bikeMax);
      total += n;
      if (reasons.length === 0) ok += n;
      for (const r of reasons) counts[r] += n;
    }
    const rawRate = total > 0 ? ok / total : 0;
    const blockedShare = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, total > 0 ? n / total : 0])) as Record<Reason, number>;
    return { month: i + 1, rate: total > 0 ? clampRate(rawRate) : 0.5, rawRate, days: total, rideable: ok, blockedShare };
  });
}

export function seasonRatesFromClimate(cache: ClimateCache, preset: ThresholdPreset, bikeMax?: number | null): SeasonRate[] {
  return deriveMonths(cache, preset, bikeMax).map((m) => ({ month: m.month, rideable: m.rate, source: 'climate', sampleDays: m.days }));
}

/**
 * How much of a normal walking day each month allows, from the history: a day too hot to walk (feels
 * like more than `walkMax`) or with a downpour or heavy snow still gives `fallback` of one (indoors,
 * errands, a short walk). Without a v2 history, only downpours and snow count.
 */
export function walkRatesFromClimate(cache: ClimateCache, walkMax: number | null, fallback: number): number[] {
  const v2 = cache.v === 2;
  return cache.months.map((hist) => {
    let total = 0;
    let good = 0;
    for (const [k, n] of Object.entries(hist)) {
      const c = cellFromIndex(Number(k), v2);
      total += n;
      const severe = c.p >= 3 || c.s >= 3;
      const hot = walkMax != null && c.h != null && c.h + H_MIN > walkMax;
      if (!severe && !hot) good += n;
    }
    const share = total > 0 ? good / total : 1;
    return share + (1 - share) * fallback;
  });
}

const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const rideableDaysInMonth = (month: number, rate: number) => rate * DAYS_IN_MONTH[month - 1];

const REASON_TEXT: Record<Reason, string> = {
  snow: 'snow',
  rain: 'rain',
  cold: 'cold',
  heat: 'heat',
  wind: 'wind',
  dark: 'short daylight',
};

/** "January: 8.1 rideable days. Blocked by snow on 31% of days, cold on 44%, short daylight on 18%." */
export function explainMonth(m: MonthClimate): string {
  const days = rideableDaysInMonth(m.month, m.rate).toFixed(1);
  const parts = (Object.keys(m.blockedShare) as Reason[])
    .filter((r) => m.blockedShare[r] >= 0.01)
    .sort((a, b) => m.blockedShare[b] - m.blockedShare[a])
    .map((r, i) => `${REASON_TEXT[r]} on ${Math.round(m.blockedShare[r] * 100)}%${i === 0 ? ' of days' : ''}`);
  const clampNote = m.rawRate !== m.rate ? ` (kept between ${RATE_MIN * 100}% and ${RATE_MAX * 100}%)` : '';
  return `${MONTHS[m.month - 1]}: ${days} rideable days${clampNote}.${parts.length ? ` Blocked by ${parts.join(', ')}.` : ' Nothing in the record blocks it.'}`;
}

/** Best and worst months for the summary card. */
export function climateSummary(rates: SeasonRate[]) {
  const withDays = rates.map((r) => ({ month: r.month, days: rideableDaysInMonth(r.month, r.rideable) }));
  const sorted = [...withDays].sort((a, b) => b.days - a.days);
  const top = sorted[0].days;
  const bottom = sorted[sorted.length - 1].days;
  const best = sorted.filter((m) => m.days >= top - 1.5).slice(0, 3).sort((a, b) => a.month - b.month);
  const worst = sorted.filter((m) => m.days <= bottom + 1.5).slice(-3).sort((a, b) => a.month - b.month);
  const avg = (xs: { days: number }[]) => Math.round(xs.reduce((s, x) => s + x.days, 0) / xs.length);
  return {
    best: best.map((m) => m.month),
    worst: worst.map((m) => m.month),
    bestDays: avg(best),
    worstDays: avg(worst),
    bestText: listJoin(best.map((m) => MONTHS[m.month - 1])),
    worstText: listJoin(worst.map((m) => MONTHS[m.month - 1])),
  };
}

/** Temperate-northern default for the manual sliders (Jan 25%, Jul 90%). */
export const DEFAULT_MANUAL_RATES = [0.25, 0.3, 0.45, 0.6, 0.75, 0.85, 0.9, 0.88, 0.8, 0.65, 0.4, 0.25];
export const SAME_ALL_YEAR = 0.85;
