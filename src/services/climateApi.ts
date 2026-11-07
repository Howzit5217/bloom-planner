import { subDays, subYears } from 'date-fns';
import { buildHistograms, type ClimateCache, type ClimateDay } from '@/engine/climate';
import { toKey } from '@/engine/dates';
import type { AlertForecast } from '@/engine/weatherAlerts';
import type { ForecastWeatherDay } from '@/engine/weatherPlan';

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
      apparent_temperature_max: d.apparent_temperature_max?.[i] ?? null,
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
      `&daily=precipitation_sum,snowfall_sum,temperature_2m_max,temperature_2m_min,daylight_duration,wind_speed_10m_max,apparent_temperature_max` +
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

/**
 * The next two days in detail, for the weather alerts: each day's weather, highs and lows (and how
 * they feel), rain and its chance, snow, gusts and the UV index at its highest; and hour by hour, the
 * chance of rain, how much, the UV index and the weather. Times are the place's own clock.
 */
export async function fetchAlertForecast(latitude: number, longitude: number, timezone: string): Promise<AlertForecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,snowfall_sum,wind_gusts_10m_max,uv_index_max` +
    `&hourly=precipitation_probability,precipitation,uv_index,weather_code` +
    `&timezone=${encodeURIComponent(timezone || 'auto')}&forecast_days=3`;
  const json = await getJson(url, 12000);
  const d = json?.daily;
  const h = json?.hourly;
  if (!d || !Array.isArray(d.time) || !h || !Array.isArray(h.time)) throw new ClimateError('No forecast');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    days: d.time.map((date: string, i: number) => ({
      date,
      code: num(d.weather_code?.[i]),
      tmax: num(d.temperature_2m_max?.[i]),
      tmin: num(d.temperature_2m_min?.[i]),
      feelsMax: num(d.apparent_temperature_max?.[i]),
      feelsMin: num(d.apparent_temperature_min?.[i]),
      precip: num(d.precipitation_sum?.[i]),
      precipChance: num(d.precipitation_probability_max?.[i]),
      snow: num(d.snowfall_sum?.[i]),
      gusts: num(d.wind_gusts_10m_max?.[i]),
      uvMax: num(d.uv_index_max?.[i]),
    })),
    hours: h.time.map((time: string, i: number) => ({
      time,
      precipChance: num(h.precipitation_probability?.[i]),
      precip: num(h.precipitation?.[i]),
      uv: num(h.uv_index?.[i]),
      code: num(h.weather_code?.[i]),
    })),
  };
}

/** The weather right now, for the backdrop's sky. Two decimals (about 1 km) is plenty for a sky. */
export async function fetchCurrentWeather(latitude: number, longitude: number): Promise<{ code: number; cloudCover: number | null; snowDepth: number | null; wind: number | null; visibility: number | null }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&current=weather_code,cloud_cover,snow_depth,wind_speed_10m,visibility&timezone=auto`;
  const json = await getJson(url, 10000);
  const cur = json?.current;
  if (!cur || typeof cur.weather_code !== 'number') throw new ClimateError('No current weather');
  const n = (v: unknown) => (typeof v === 'number' ? v : null);
  // Snow lying on the ground in metres, the wind in km/h, how far you can see in metres.
  return { code: cur.weather_code, cloudCover: n(cur.cloud_cover), snowDepth: n(cur.snow_depth), wind: n(cur.wind_speed_10m), visibility: n(cur.visibility) };
}

/**
 * How big the town a place is named for is, and how far the place is from its middle (km): the
 * nearest place of that name the geocoder knows. Null when it doesn't know one near (or its size).
 */
export async function fetchTownSize(name: string, latitude: number, longitude: number): Promise<{ population: number; km: number } | null> {
  const q = name.split(',')[0].trim();
  if (q.length < 2) return null;
  const json = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`, 10000);
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  const r = Math.PI / 180;
  const km = (lat: number, lon: number) => {
    const h = Math.sin(((lat - latitude) * r) / 2) ** 2 + Math.cos(lat * r) * Math.cos(latitude * r) * Math.sin(((lon - longitude) * r) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const near = results
    .filter((x) => typeof x.latitude === 'number' && typeof x.longitude === 'number' && typeof x.population === 'number')
    .map((x) => ({ population: x.population as number, km: km(x.latitude, x.longitude) }))
    .sort((a, b) => a.km - b.km)[0];
  return near && near.km < 60 ? near : null;
}

/**
 * The next 16 days, for planning around the weather: feels-like high (humidity and wind in it),
 * rain and its chance, snow, wind and gusts, humidity, daylight and the weather code.
 */
export async function fetchPlanForecast(latitude: number, longitude: number, timezone: string): Promise<ForecastWeatherDay[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}` +
    `&daily=apparent_temperature_max,temperature_2m_max,precipitation_sum,precipitation_probability_max,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_mean,daylight_duration,weather_code` +
    `&timezone=${encodeURIComponent(timezone || 'auto')}&forecast_days=16`;
  const json = await getJson(url, 12000);
  const d = json?.daily;
  if (!d || !Array.isArray(d.time)) throw new ClimateError('No forecast');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return d.time.map((date: string, i: number) => ({
    date,
    feelsMax: num(d.apparent_temperature_max?.[i]),
    tmax: num(d.temperature_2m_max?.[i]),
    precip: num(d.precipitation_sum?.[i]),
    precipChance: num(d.precipitation_probability_max?.[i]),
    snow: num(d.snowfall_sum?.[i]),
    wind: num(d.wind_speed_10m_max?.[i]),
    gusts: num(d.wind_gusts_10m_max?.[i]),
    humidity: num(d.relative_humidity_2m_mean?.[i]),
    daylight: num(d.daylight_duration?.[i]),
    code: num(d.weather_code?.[i]),
  }));
}
