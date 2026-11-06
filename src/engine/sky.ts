// The backdrop's sky: what it looks like right now, from the time of day (sunrise and sunset at
// the play location) and the current weather. Pure maths; the drawing lives in ui/skia/Meadow.

export type SkyWeather = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';
export type SkyPhase = 'night' | 'dawn' | 'day' | 'dusk';

/** Sunrise and sunset as epoch milliseconds; null when the sun doesn't rise or set that day. */
export interface SunTimes {
  sunrise: number | null;
  sunset: number | null;
  /** Midnight sun or polar night. */
  polar: 'day' | 'night' | null;
  /** How high the sun stands at noon, in degrees: low in winter, high in summer (the seasons' path). */
  noonAltitude: number;
}

// ─── The sun ───

const RAD = Math.PI / 180;
const J1970 = 2440587.5;
const J2000 = 2451545;
const toJulian = (ms: number) => ms / 86_400_000 + J1970;
const fromJulian = (j: number) => (j - J1970) * 86_400_000;

/**
 * Sunrise and sunset on a calendar day (yyyy-MM-dd) at a place, by the standard sunrise equation.
 * Good to a minute or two, which is plenty for a sky.
 */
export function sunTimes(latitude: number, longitude: number, day: string): SunTimes {
  const [y, m, d] = day.split('-').map(Number);
  // Local solar noon of that date, as a Julian date.
  const noon = toJulian(Date.UTC(y, m - 1, d, 12) - (longitude / 360) * 86_400_000);
  const n = Math.round(noon - J2000 - 0.0008);
  const jStar = n - longitude / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = J2000 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const noonAltitude = 90 - Math.abs(latitude - Math.asin(sinDec) / RAD);
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(latitude * RAD) * sinDec) / (Math.cos(latitude * RAD) * cosDec);
  if (cosW > 1) return { sunrise: null, sunset: null, polar: 'night', noonAltitude };
  if (cosW < -1) return { sunrise: null, sunset: null, polar: 'day', noonAltitude };
  const w = Math.acos(cosW) / RAD / 360;
  return { sunrise: fromJulian(transit - w), sunset: fromJulian(transit + w), polar: null, noonAltitude };
}

/** The calendar day at a longitude right now (yyyy-MM-dd), by local solar time: the day whose sunrise and sunset matter. */
export function solarDay(now: number, longitude: number): string {
  return new Date(now + (longitude / 360) * 86_400_000).toISOString().slice(0, 10);
}

/** Where the seasons are taken from without a play location: a mid-northern latitude. */
export const DEFAULT_LATITUDE = 40;

/** Without a play location: 6:30 to 18:30 on the device's clock, the sun as high as at a mid-northern latitude. */
export function defaultSunTimes(now: Date): SunTimes {
  const at = (h: number, min: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min).getTime();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { sunrise: at(6, 30), sunset: at(18, 30), polar: null, noonAltitude: sunTimes(DEFAULT_LATITUDE, 0, day).noonAltitude };
}

// ─── The seasons ───

/** The ground by day through the year: winter straw, spring green, a deeper summer green, autumn gold. */
const SEASON_GROUND = {
  winter: { groundFar: '#CACBA4', groundMid: '#B3B88D', groundNear: '#9CA57A' },
  spring: { groundFar: '#B2DE84', groundMid: '#93CE64', groundNear: '#74BA4C' },
  summer: { groundFar: '#A6D879', groundMid: '#86C559', groundNear: '#66AE42' },
  fall: { groundFar: '#EBCB6A', groundMid: '#E0A94A', groundNear: '#CC8B3C' },
} as const;
type SeasonName = keyof typeof SEASON_GROUND;
type GroundKey = keyof (typeof SEASON_GROUND)['spring'];

/**
 * Each season at its height, by day of the year in the north (the south is half a year on): mid
 * January, late April, mid July, and the autumn colours at their peak in late October.
 */
const SEASON_PEAKS: Array<{ day: number; season: SeasonName }> = [
  { day: 15, season: 'winter' },
  { day: 112, season: 'spring' },
  { day: 196, season: 'summer' },
  { day: 293, season: 'fall' },
];

const dayOfYear = (ms: number) => {
  const d = new Date(ms);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
};

/**
 * The ground's colours for the season at a place: between the two seasons either side of the date,
 * half a year on south of the equator, and less of it the nearer the equator (none in the tropics,
 * where it stays summer green). `turn` is how far it has turned from green (autumn and winter).
 */
export function seasonGround(now: number, latitude: number): Record<GroundKey, string> & { turn: number } {
  const south = latitude < 0;
  const day = (dayOfYear(now) + (south ? 182 : 0) - 1) % 365 + 1;
  let i = SEASON_PEAKS.length - 1;
  while (i > 0 && SEASON_PEAKS[i].day > day) i--;
  const a = SEASON_PEAKS[i];
  const b = SEASON_PEAKS[(i + 1) % SEASON_PEAKS.length];
  const span = (b.day - a.day + 365) % 365 || 365;
  const f = ((day - a.day + 365) % 365) / span;
  // Eased, so each season lingers round its peak and the change comes between.
  const k = f * f * (3 - 2 * f);
  // How seasonal the place is: none within about 12 degrees of the equator, all of it from 32.
  const strength = Math.max(0, Math.min(1, (Math.abs(latitude) - 12) / 20));
  const turnOf = (n: SeasonName) => (n === 'fall' || n === 'winter' ? 1 : 0);
  const out = {} as Record<GroundKey, string>;
  for (const key of ['groundFar', 'groundMid', 'groundNear'] as const) {
    const here = mix(SEASON_GROUND[a.season][key], SEASON_GROUND[b.season][key], k);
    out[key] = mix(SEASON_GROUND.summer[key], here, strength);
  }
  return { ...out, turn: strength * (turnOf(a.season) * (1 - k) + turnOf(b.season) * k) };
}

// ─── The weather ───

/** WMO weather codes (as Open-Meteo reports them) to the skies drawn here. */
export function weatherFromCode(code: number | null | undefined, cloudCover?: number | null): SkyWeather {
  if (code == null) return 'clear';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'cloudy';
  if (code === 2) return 'partly';
  if (code === 1) return cloudCover != null && cloudCover > 40 ? 'partly' : 'clear';
  return 'clear';
}

// ─── The look ───

/** Sky top, middle and horizon; the ground from the horizon down. */
interface Palette {
  top: string;
  mid: string;
  horizon: string;
  groundFar: string;
  groundMid: string;
  groundNear: string;
}

// Pikmin Bloom's skies: clear blues by day, peach and pink at sunrise and sunset, deep blue at night.
export const SKY_PALETTES: Record<SkyPhase, Palette> = {
  day: { top: '#5DB6EE', mid: '#9ED7F6', horizon: '#E3F6FF', groundFar: '#B2DE84', groundMid: '#93CE64', groundNear: '#74BA4C' },
  dawn: { top: '#7F8BDA', mid: '#E9A9C4', horizon: '#FFD7A8', groundFar: '#B4D58A', groundMid: '#8FC264', groundNear: '#70AC4D' },
  dusk: { top: '#5B67C4', mid: '#EC93A2', horizon: '#FFC078', groundFar: '#AFCB7A', groundMid: '#8AB55B', groundNear: '#6E9E47' },
  night: { top: '#141C45', mid: '#25336C', horizon: '#45558F', groundFar: '#3E6553', groundMid: '#2F5545', groundNear: '#234536' },
};

// Overcast, rain and snow wash the sky toward grey (day and night versions).
const WASH: Record<SkyWeather, { amount: number; day: string; night: string }> = {
  clear: { amount: 0, day: '#B4C0CE', night: '#30384C' },
  partly: { amount: 0.12, day: '#B4C0CE', night: '#30384C' },
  cloudy: { amount: 0.55, day: '#AEB9C7', night: '#30384C' },
  fog: { amount: 0.68, day: '#D6DCE3', night: '#3A4152' },
  rain: { amount: 0.62, day: '#8F9AAA', night: '#262D3D' },
  snow: { amount: 0.5, day: '#D3DAE4', night: '#363E52' },
  storm: { amount: 0.74, day: '#6E7787', night: '#1E2432' },
};

const CLOUDS: Record<SkyWeather, number> = { clear: 2, partly: 5, cloudy: 8, fog: 3, rain: 8, snow: 7, storm: 9 };
/** How much of the sun (or moon) the weather's cloud hides: it's always up there, just behind more or less cloud. */
const VEIL: Record<SkyWeather, number> = { clear: 0, partly: 0.12, cloudy: 0.72, fog: 0.8, rain: 0.82, snow: 0.75, storm: 0.92 };

export interface SkyLook {
  phase: SkyPhase;
  top: string;
  mid: string;
  horizon: string;
  groundFar: string;
  groundMid: string;
  groundNear: string;
  /** How far the ground has turned from green with the season (autumn, winter), 0..1, for the grass. */
  turn: number;
  /** 0 by day, 1 deep in the night: dims flowers, lights fireflies. */
  night: number;
  /** How bright the stars are (0..1); none behind clouds. */
  stars: number;
  /** The sun or moon across the sky: x 0..1 left to right, height 0..1 above the horizon; null when it's set. */
  sun: { x: number; height: number; color: string } | null;
  moon: { x: number; height: number } | null;
  /** How much the cloud cover hides the sun or moon (and its light), 0 clear to 1 hidden. */
  veil: number;
  clouds: number;
  /** Cloud colour: white by day, warm at dawn and dusk, slate at night, grey in bad weather. */
  cloudColor: string;
  rain: boolean;
  snow: boolean;
  fog: boolean;
  weather: SkyWeather;
  /** Light text and icons go on top (night, storms). */
  darkSky: boolean;
}

/**
 * What of a sky look shows: its colours and weather as they are, the sun and moon to the nearest
 * 2% of the sky, the night and stars to the nearest 5%. Two looks with the same key draw the same,
 * so the meadow isn't drawn again every few minutes for a change nobody could see.
 */
export function lookKey(l: SkyLook): string {
  const r = (n: number, step: number) => Math.round(n / step) * step;
  return JSON.stringify({
    ...l,
    night: r(l.night, 0.05),
    stars: r(l.stars, 0.05),
    sun: l.sun && { ...l.sun, x: r(l.sun.x, 0.02), height: r(l.sun.height, 0.02) },
    moon: l.moon && { x: r(l.moon.x, 0.02), height: r(l.moon.height, 0.02) },
  });
}

const MIN = 60_000;

/** Phase keyframes, in minutes from sunrise (R) and sunset (S). */
function keyframes(sun: SunTimes): Array<{ at: number; phase: SkyPhase }> {
  const R = sun.sunrise!;
  const S = sun.sunset!;
  return [
    { at: R - 75 * MIN, phase: 'night' },
    { at: R - 10 * MIN, phase: 'dawn' },
    { at: R + 60 * MIN, phase: 'day' },
    { at: S - 60 * MIN, phase: 'day' },
    { at: S + 5 * MIN, phase: 'dusk' },
    { at: S + 70 * MIN, phase: 'night' },
  ];
}

export function skyLook(now: number, sun: SunTimes, weather: SkyWeather, latitude: number = DEFAULT_LATITUDE): SkyLook {
  // Where we are between two keyframes, and how far.
  let a: SkyPhase = 'day';
  let b: SkyPhase = 'day';
  let f = 0;
  if (sun.polar) {
    a = b = sun.polar === 'day' ? 'day' : 'night';
  } else {
    const ks = keyframes(sun);
    if (now <= ks[0].at || now >= ks[ks.length - 1].at) {
      a = b = 'night';
    } else {
      for (let i = 0; i < ks.length - 1; i++) {
        if (now >= ks[i].at && now < ks[i + 1].at) {
          a = ks[i].phase;
          b = ks[i + 1].phase;
          f = (now - ks[i].at) / (ks[i + 1].at - ks[i].at);
          break;
        }
      }
    }
  }
  const pa = SKY_PALETTES[a];
  const pb = SKY_PALETTES[b];
  const phase = f < 0.5 ? a : b;
  const nightOf = (p: SkyPhase) => (p === 'night' ? 1 : p === 'day' ? 0 : 0.35);
  const night = nightOf(a) * (1 - f) + nightOf(b) * f;
  const wash = WASH[weather];
  const washColor = mix(wash.day, wash.night, night);
  const sky = (k: keyof Palette, w: number) => mix(mix(pa[k], pb[k], f), washColor, w);
  // The ground in the season's colours, lit as the time of day lights it (dawn, dusk and night keep
  // their own share of the day's colour), then greyed by the weather.
  const season = seasonGround(now, latitude);
  const lit = (p: Palette, k: GroundKey) => {
    const day = hex(SKY_PALETTES.day[k]);
    const at = hex(p[k]);
    const s = hex(season[k]);
    return toHex(s.map((v, i) => v * (at[i] / Math.max(1, day[i]))));
  };
  const ground = (k: GroundKey) => mix(mix(lit(pa, k), lit(pb, k), f), '#7C8A80', wash.amount * 0.25);

  // The sun's arc through the day; low and golden near sunrise and sunset. It's there whatever the
  // weather, behind as much cloud as there is (`veil`).
  let sunPos: SkyLook['sun'] = null;
  let moon: SkyLook['moon'] = null;
  // The seasons' path: as high at noon as the sun really stands there that day (low in winter, high in
  // summer), and across more of the sky the longer the day.
  const peak = Math.max(0.3, Math.min(1, sun.noonAltitude / 70));
  if (sun.sunrise != null && sun.sunset != null) {
    const p = (now - sun.sunrise) / (sun.sunset - sun.sunrise);
    if (p > -0.02 && p < 1.02) {
      const height = Math.max(0, Math.sin(Math.min(1, Math.max(0, p)) * Math.PI)) * peak;
      const dayShare = (sun.sunset - sun.sunrise) / 86_400_000;
      const half = Math.max(0.24, Math.min(0.44, 0.14 + 0.55 * dayShare));
      sunPos = { x: 0.5 - half + 2 * half * Math.min(1, Math.max(0, p)), height, color: mix('#FFB36B', '#FFF4C2', Math.min(1, height * 2.2)) };
    }
    if (night > 0.6) moon = { x: 0.84, height: 0.3 };
  } else if (sun.polar === 'day') {
    sunPos = { x: 0.5, height: Math.max(0.2, peak * 0.6), color: '#FFF4C2' };
  } else if (sun.polar === 'night') {
    moon = { x: 0.84, height: 0.3 };
  }
  const cloudColor = mix(mix(mix('#FFFFFF', '#FFE2CF', phase === 'dawn' || phase === 'dusk' ? 0.6 : 0), '#4B5578', night), '#9AA3B1', Math.max(0, wash.amount - 0.2));
  return {
    phase,
    top: sky('top', wash.amount),
    mid: sky('mid', wash.amount),
    horizon: sky('horizon', wash.amount * 0.8),
    groundFar: ground('groundFar'),
    groundMid: ground('groundMid'),
    groundNear: ground('groundNear'),
    turn: season.turn,
    night,
    stars: weather === 'clear' ? night : weather === 'partly' ? night * 0.6 : 0,
    sun: sunPos,
    moon,
    veil: VEIL[weather],
    clouds: CLOUDS[weather],
    cloudColor,
    rain: weather === 'rain' || weather === 'storm',
    snow: weather === 'snow',
    fog: weather === 'fog',
    weather,
    darkSky: night > 0.5 || weather === 'storm',
  };
}

// ─── colour helpers ───

const hex = (h: string) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const toHex = (v: number[]) => '#' + v.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Mix two #RRGGBB colours: t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return toHex(x.map((v, i) => v + (y[i] - v) * k));
}
