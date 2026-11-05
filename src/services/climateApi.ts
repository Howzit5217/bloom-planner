import { subDays, subYears } from 'date-fns';
import { buildHistograms, type ClimateCache, type ClimateDay } from '@/engine/climate';
import { toKey } from '@/engine/dates';

/**
 * Open-Meteo: free, no key, no account. Coordinates go to Open-Meteo and nowhere else.
 * https://open-meteo.com (CC BY 4.0)
 */

export interface Place {
  id: string;
  name: string;
  admin1: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  elevation: number | null;
  label: string;
}

export class ClimateError extends Error {}

async function getJson(url: string, timeoutMs: number, signal?: AbortSignal): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new ClimateError(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export const placeLabel = (p: { name: string; admin1?: string | null; country?: string | null }) =>
  [p.name, p.admin1, p.country].filter((x, i, a) => !!x && a.indexOf(x) === i).join(', ');

/** §9.1 Geocoding search (the UI debounces calls at 300ms). */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
  const json = await getJson(url, 10000, signal);
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  return results
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .map((r) => {
      const p = {
        id: String(r.id ?? `${r.latitude},${r.longitude}`),
        name: String(r.name ?? ''),
        admin1: r.admin1 ? String(r.admin1) : null,
        country: r.country ? String(r.country) : null,
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: typeof r.timezone === 'string' ? r.timezone : 'auto',
        elevation: typeof r.elevation === 'number' ? r.elevation : null,
      };
      return { ...p, label: placeLabel(p) };
    });
}

function parseDaily(json: any): ClimateDay[] {
  const d = json?.daily;
  if (!d || !Array.isArray(d.time)) throw new ClimateError('No daily data');
  const n = d.time.length;
  const days: ClimateDay[] = new Array(n);
  for (let i = 0; i < n; i++) {
    days[i] = {
      date: d.time[i],
      precipitation_sum: d.precipitation_sum?.[i] ?? null,
      snowfall_sum: d.snowfall_sum?.[i] ?? null,
      temperature_2m_max: d.temperature_2m_max?.[i] ?? null,
      temperature_2m_min: d.temperature_2m_min?.[i] ?? null,
      daylight_duration: d.daylight_duration?.[i] ?? null,
      wind_speed_10m_max: d.wind_speed_10m_max?.[i] ?? null,
    };
  }
  return days;
}

/**
 * §9.2 Climate history. Ten years first; on a slow or failed request, five years.
 * Only the compact per-month histograms are kept, never the raw series.
 */
export async function fetchClimate(latitude: number, longitude: number, timezone: string, now = new Date()): Promise<ClimateCache> {
  const end = toKey(subDays(now, 1));
  const attempt = async (years: number, timeoutMs: number) => {
    const start = toKey(subYears(now, years));
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
      `&start_date=${start}&end_date=${end}` +
      `&daily=precipitation_sum,snowfall_sum,temperature_2m_max,temperature_2m_min,daylight_duration,wind_speed_10m_max` +
      `&timezone=${encodeURIComponent(timezone || 'auto')}`;
    const cache = buildHistograms(parseDaily(await getJson(url, timeoutMs)), years);
    if (cache.sampleDays < 300) throw new ClimateError('Too little data');
    return cache;
  };
  try {
    return await attempt(10, 15000);
  } catch {
    try {
      return await attempt(5, 15000);
    } catch (e) {
      throw new ClimateError(e instanceof Error ? e.message : 'Climate lookup failed');
    }
  }
}

export interface ForecastDay {
  date: string;
  precipitation: number;
  precipitationChance: number;
  snowfall: number;
  tmax: number;
  wind: number;
  daylight: number;
}

/** Short forecast for the "good day for a ride" nudge. */
export async function fetchForecast(latitude: number, longitude: number, timezone: string): Promise<ForecastDay[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
    `&daily=precipitation_sum,precipitation_probability_max,snowfall_sum,temperature_2m_max,wind_speed_10m_max,daylight_duration` +
    `&timezone=${encodeURIComponent(timezone || 'auto')}&forecast_days=3`;
  const json = await getJson(url, 10000);
  const d = json?.daily;
  if (!d || !Array.isArray(d.time)) return [];
  return d.time.map((t: string, i: number) => ({
    date: t,
    precipitation: d.precipitation_sum?.[i] ?? 0,
    precipitationChance: d.precipitation_probability_max?.[i] ?? 0,
    snowfall: d.snowfall_sum?.[i] ?? 0,
    tmax: d.temperature_2m_max?.[i] ?? 0,
    wind: d.wind_speed_10m_max?.[i] ?? 0,
    daylight: d.daylight_duration?.[i] ?? 0,
  }));
}
