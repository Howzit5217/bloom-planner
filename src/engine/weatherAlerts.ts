// The weather alerts, a little like a weather channel's: the morning forecast, a warning when the UV
// gets high (wear sunscreen), a heads-up an hour before rain, and the evening before a stormy, snowy,
// too hot or too cold day. Pure: the caller fetches the forecast, schedules the result, and says how
// temperatures and times read.
import { addDaysKey, type DayKey } from './dates';
import type { TempLimits } from './climate';

/** One day of the alert forecast, at the play location. */
export interface AlertDay {
  date: string;
  code: number | null;
  tmax: number | null;
  tmin: number | null;
  feelsMax: number | null;
  feelsMin: number | null;
  /** mm, and its % chance. */
  precip: number | null;
  precipChance: number | null;
  /** cm */
  snow: number | null;
  /** km/h */
  gusts: number | null;
  /** The UV index at its highest. */
  uvMax: number | null;
}

/** One hour of the alert forecast, its time on the place's own clock ("2026-11-06T13:00"). */
export interface AlertHour {
  time: string;
  precipChance: number | null;
  precip: number | null;
  uv: number | null;
  code: number | null;
}

export interface AlertForecast {
  days: AlertDay[];
  hours: AlertHour[];
}

export interface WeatherAlertPrefs {
  enabled: boolean;
  /** Each morning, at `hour`:`minute`. */
  forecast: boolean;
  hour: number;
  minute: number;
  uv: boolean;
  rain: boolean;
  /** Storms, heavy snow, heat and cold, the evening before. */
  severe: boolean;
}

export const DEFAULT_WEATHER_ALERTS: WeatherAlertPrefs = { enabled: false, forecast: true, hour: 7, minute: 30, uv: true, rain: true, severe: true };

export type WeatherAlertKind = 'forecast' | 'uv' | 'rain' | 'storm' | 'snow' | 'heat' | 'cold';

export interface WeatherAlert {
  date: DayKey;
  hour: number;
  minute: number;
  kind: WeatherAlertKind;
  title: string;
  body: string;
}

/** High from 6 (wear sunscreen), very high from 8 (the WHO's bands). */
export const UV_HIGH = 6;
export const UV_VERY_HIGH = 8;
/** Rain this likely (%) and this much in the hour (mm) is rain on the way. */
const RAIN_CHANCE = 60;
const RAIN_MM = 0.3;
/** More snow than this (cm) is worth a heads-up. */
const SNOW_CM = 2;
/** Rain alerts only for waking hours. */
const DAY_FROM = 7;
const DAY_TO = 21;
/** The evening heads-up, the day before. */
const EVENING_HOUR = 19;

export interface AlertText {
  t: (english: string, params?: Record<string, string | number>) => string;
  /** A temperature in °C, as the player reads them ("24°C", "75°F"). */
  temp: (celsius: number) => string;
  /** A time of day ("3:00 PM", "15:00"). */
  clock: (hour: number, minute: number) => string;
}

/** The forecast's weather in a word (from the WMO code). */
export function weatherWord(code: number | null, t: AlertText['t']): string {
  if (code == null) return t('Mixed');
  if (code >= 95) return t('Stormy');
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return t('Snowy');
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return t('Rainy');
  if (code === 45 || code === 48) return t('Foggy');
  if (code === 3) return t('Cloudy');
  if (code === 1 || code === 2) return t('Partly Cloudy');
  return t('Sunny');
}

const hourOf = (time: string) => Number(time.slice(11, 13));
const dayOf = (time: string) => time.slice(0, 10);

export function planWeatherAlerts(args: { prefs: WeatherAlertPrefs; forecast: AlertForecast; limits: TempLimits; today: DayKey; now: Date; text: AlertText }): WeatherAlert[] {
  const { prefs, forecast, limits, today, now, text } = args;
  const { t, temp, clock } = text;
  if (!prefs.enabled) return [];
  const out: WeatherAlert[] = [];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Only what's still ahead: a time today already gone is dropped (the scheduler skips it too).
  const ahead = (date: DayKey, hour: number, minute: number) => date !== today || hour * 60 + minute > nowMinutes + 1;
  const push = (a: WeatherAlert) => {
    if (ahead(a.date, a.hour, a.minute)) out.push(a);
  };
  // Today and tomorrow: further out, the forecast would be stale by the time it showed.
  for (const date of [today, addDaysKey(today, 1)]) {
    const day = forecast.days.find((d) => d.date === date);
    if (!day) continue;
    const hours = forecast.hours.filter((h) => dayOf(h.time) === date);
    const uv = day.uvMax != null ? Math.round(day.uvMax) : null;

    if (prefs.forecast) {
      const high = day.tmax != null ? temp(day.tmax) : '–';
      const low = day.tmin != null ? temp(day.tmin) : '–';
      const rain = Math.round(day.precipChance ?? 0);
      const uvLine = uv == null ? '' : uv >= UV_HIGH ? ` ${t('UV {uv}: wear sunscreen.', { uv })}` : ` ${t('UV {uv}.', { uv })}`;
      push({
        date,
        hour: prefs.hour,
        minute: prefs.minute,
        kind: 'forecast',
        title: t('Today: {weather}', { weather: weatherWord(day.code, t) }),
        body: `${t('High {high}, low {low}. Rain {rain}%.', { high, low, rain })}${uvLine}`,
      });
    }

    // High UV: a little before it first gets high, in daylight.
    if (prefs.uv && uv != null && uv >= UV_HIGH) {
      const first = hours.find((h) => (h.uv ?? 0) >= UV_HIGH);
      const at = first ? hourOf(first.time) : 11;
      const alertHour = Math.max(prefs.forecast ? prefs.hour + 1 : 8, at - 1);
      push({
        date,
        hour: alertHour,
        minute: 30,
        kind: 'uv',
        title: uv >= UV_VERY_HIGH ? t('Very High UV Today') : t('High UV Today'),
        body: t('UV reaches {uv} around {time}. Wear sunscreen and a hat when you head out.', { uv, time: clock(at, 0) }),
      });
    }

    // Rain on the way: an hour before the first likely rain of the waking day.
    if (prefs.rain) {
      const wet = hours.find((h) => {
        const hr = hourOf(h.time);
        return hr >= DAY_FROM && hr <= DAY_TO && (h.precipChance ?? 0) >= RAIN_CHANCE && (h.precip ?? 0) >= RAIN_MM;
      });
      if (wet) {
        const at = hourOf(wet.time);
        push({
          date,
          hour: Math.max(DAY_FROM - 1, at - 1),
          minute: 0,
          kind: 'rain',
          title: t('Rain on the Way'),
          body: t('Rain is likely from about {time}. A good time to get your walk in first.', { time: clock(at, 0) }),
        });
      }
    }
  }

  // The evening before a hard day: its storms, snow, heat or cold (the worst of them), tonight for
  // tomorrow and tomorrow evening for the day after.
  for (const evening of prefs.severe ? [today, addDaysKey(today, 1)] : []) {
    const day = forecast.days.find((d) => d.date === addDaysKey(evening, 1));
    if (day) {
      const storm = (day.code ?? 0) >= 95;
      const snow = (day.snow ?? 0) > SNOW_CM;
      const heat = day.feelsMax != null && day.feelsMax > limits.hot;
      const cold = day.feelsMax != null && day.feelsMax < limits.cold;
      const alert = (kind: WeatherAlertKind, title: string, body: string) => push({ date: evening, hour: EVENING_HOUR, minute: 0, kind, title, body });
      if (storm) alert('storm', t('Storms Tomorrow'), t('Storms are forecast tomorrow. The plan already asks for less, so take it easy.'));
      else if (snow) alert('snow', t('Snow Tomorrow'), t('Snow is forecast tomorrow. Dress warm and watch your step.'));
      else if (heat) alert('heat', t('Hot Day Tomorrow'), t('Tomorrow feels like {temp}. Walk early or late, and bring water.', { temp: temp(day.feelsMax!) }));
      else if (cold) alert('cold', t('Cold Day Tomorrow'), t('Tomorrow feels like {temp}. Wrap up warm for your walk.', { temp: temp(day.feelsMax!) }));
    }
  }
  return out;
}
