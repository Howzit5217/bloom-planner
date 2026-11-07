// The backdrop's sky: what it looks like right now, from the time of day (sunrise and sunset at
// the play location) and the current weather. Pure maths; the drawing lives in ui/skia/Meadow.

import { siderealDeg, starLimit, type StarSky } from './stars';

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

/**
 * Without a play location: a mid-northern place whose noon falls at about 12:30 on the device's
 * clock, so the sun rises, climbs and sets about when it does where the phone is.
 */
export function defaultPlace(now: number): { latitude: number; longitude: number } {
  const hours = -new Date(now).getTimezoneOffset() / 60;
  const longitude = 15 * (hours - 0.5);
  return { latitude: DEFAULT_LATITUDE, longitude: ((longitude + 540) % 360) - 180 };
}

/**
 * Where the sun stands at a place and moment, in degrees: its altitude above the horizon (negative
 * below it) and its bearing from north, by the standard low-precision solar formulas (good to a
 * fraction of a degree); its declination; and whether it's still the morning (the sun climbing).
 */
const TILT = 23.4397 * RAD;

/** The sun's right ascension and declination (radians) `d` days from J2000. */
function sunCoords(d: number) {
  const M = (357.5291 + 0.98560028 * d) * RAD;
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
  const L = M + C + (102.9372 + 180) * RAD;
  return { dec: Math.asin(Math.sin(TILT) * Math.sin(L)), ra: Math.atan2(Math.sin(L) * Math.cos(TILT), Math.cos(L)) };
}

/** Where something at (ra, dec) stands in a place's sky `d` days from J2000: altitude, bearing from north (degrees) and its hour angle. */
function skyPlace(d: number, latitude: number, longitude: number, ra: number, dec: number) {
  // The hour angle: how far it has gone round since it was due south (or north).
  const H = (280.16 + 360.9856235 * d + longitude) * RAD - ra;
  const phi = latitude * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // Measured from the south, westward; turned to a bearing from north.
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { altitude: alt / RAD, azimuth: (((az / RAD + 180) % 360) + 360) % 360, H };
}

export function sunPosition(now: number, latitude: number, longitude: number): { altitude: number; azimuth: number; declination: number; morning: boolean } {
  const d = toJulian(now) - J2000;
  const { ra, dec } = sunCoords(d);
  const at = skyPlace(d, latitude, longitude, ra, dec);
  return { altitude: at.altitude, azimuth: at.azimuth, declination: dec / RAD, morning: Math.sin(at.H) < 0 };
}

/**
 * Where the moon stands at a place and moment (altitude and bearing, degrees), and its phase: how
 * much of it is lit (`fraction`, 0 new to 1 full) and where it is in its month (`phase`, 0 new,
 * 0.25 first quarter, 0.5 full, 0.75 last quarter). By the standard low-precision lunar formulas:
 * to about a degree, and a phase to within a few hours, which is plenty for a sky.
 */
export function moonPosition(now: number, latitude: number, longitude: number): { altitude: number; azimuth: number; fraction: number; phase: number } {
  const d = toJulian(now) - J2000;
  const L = (218.316 + 13.176396 * d) * RAD;
  const M = (134.963 + 13.064993 * d) * RAD;
  const F = (93.272 + 13.22935 * d) * RAD;
  const lon = L + 6.289 * RAD * Math.sin(M);
  const lat = 5.128 * RAD * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);
  const ra = Math.atan2(Math.sin(lon) * Math.cos(TILT) - Math.tan(lat) * Math.sin(TILT), Math.cos(lon));
  const dec = Math.asin(Math.sin(lat) * Math.cos(TILT) + Math.cos(lat) * Math.sin(TILT) * Math.sin(lon));
  const at = skyPlace(d, latitude, longitude, ra, dec);
  // How the sun lights it: the angle between them seen from here, then from the moon.
  const sun = sunCoords(d);
  const SUN_KM = 149598000;
  const apart = Math.acos(Math.sin(sun.dec) * Math.sin(dec) + Math.cos(sun.dec) * Math.cos(dec) * Math.cos(sun.ra - ra));
  const inc = Math.atan2(SUN_KM * Math.sin(apart), dist - SUN_KM * Math.cos(apart));
  const side = Math.atan2(Math.cos(sun.dec) * Math.sin(sun.ra - ra), Math.sin(sun.dec) * Math.cos(dec) - Math.cos(sun.dec) * Math.sin(dec) * Math.cos(sun.ra - ra));
  return { altitude: at.altitude, azimuth: at.azimuth, fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (side < 0 ? -1 : 1)) / Math.PI };
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

/** How hard rain or snow comes down, 1 light, 2 moderate, 3 heavy (WMO codes, as Open-Meteo reports them); 0 for none. */
export type FallLevel = 0 | 1 | 2 | 3;
export function fallLevelFromCode(code: number | null | undefined): FallLevel {
  if (code == null) return 0;
  if ([51, 53, 56, 61, 71, 77, 80, 85].includes(code)) return 1;
  if ([55, 57, 63, 66, 73, 81, 95].includes(code)) return 2;
  if ([65, 67, 75, 82, 86, 96, 99].includes(code)) return 3;
  return 0;
}

// ─── The look ───

/**
 * A clear sky by the sun's altitude (degrees), as skies really go: a deep blue overhead by day,
 * paling to a hazy white at the horizon; warmer as the sun gets low; at sunset and in the twilight
 * after it, an orange glow on the horizon under the sun (`glow`) while the rest of the horizon turns
 * pink and the sky above deepens; then night's deep blue. Sunrise is the same the other way round.
 * `ground` is how the field is lit (white: full daylight); `cloud` is the light on the clouds.
 */
interface SkyStop {
  at: number;
  top: string;
  mid: string;
  horizon: string;
  glow: string;
  glowAlpha: number;
  ground: string;
  cloud: string;
}
const SKY_BY_SUN: SkyStop[] = [
  { at: -18, top: '#0F1840', mid: '#1D2A5E', horizon: '#34437A', glow: '#34437A', glowAlpha: 0, ground: '#597AA1', cloud: '#4B5578' },
  { at: -12, top: '#132050', mid: '#24356A', horizon: '#414E82', glow: '#5E4C7C', glowAlpha: 0.3, ground: '#6280A8', cloud: '#565A82' },
  { at: -8, top: '#1A2B66', mid: '#34477F', horizon: '#5E5E8E', glow: '#B0607A', glowAlpha: 0.5, ground: '#6E86AE', cloud: '#86698C' },
  { at: -4, top: '#28408A', mid: '#5868A4', horizon: '#9C88A8', glow: '#F28A58', glowAlpha: 0.7, ground: '#8890B2', cloud: '#E39A88' },
  { at: -1, top: '#3754A2', mid: '#7D89BE', horizon: '#D8A8AE', glow: '#FF9C5A', glowAlpha: 0.85, ground: '#ACA0AC', cloud: '#FFB48C' },
  { at: 2, top: '#4166B4', mid: '#90A5D2', horizon: '#E4C3B8', glow: '#FFB26C', glowAlpha: 0.75, ground: '#D6B8A2', cloud: '#FFCDA6' },
  { at: 6, top: '#4878C4', mid: '#8EB4E0', horizon: '#E6D9CE', glow: '#FFD49A', glowAlpha: 0.5, ground: '#EFD6BC', cloud: '#FFE5CC' },
  { at: 12, top: '#4581D0', mid: '#86B9E7', horizon: '#D9E5EC', glow: '#FFEBCC', glowAlpha: 0.22, ground: '#FBEEDF', cloud: '#FFF5EA' },
  { at: 25, top: '#3F85D8', mid: '#7DB7EB', horizon: '#D0E6F4', glow: '#FFF6E6', glowAlpha: 0.06, ground: '#FFFFFF', cloud: '#FFFFFF' },
  { at: 60, top: '#3A7FD4', mid: '#76B2E9', horizon: '#CBE3F3', glow: '#FFFFFF', glowAlpha: 0, ground: '#FFFFFF', cloud: '#FFFFFF' },
];

/**
 * The sun by its altitude: the colour of its light and of its disc (white high up; yellow, orange and
 * then red-orange low down, through ever more air), and how strong it is (`power`, 0..1).
 */
interface SunStop {
  at: number;
  light: string;
  disc: string;
  power: number;
}
const SUN_BY_ALTITUDE: SunStop[] = [
  { at: -1, light: '#FF7A3A', disc: '#FF8C4C', power: 0.4 },
  { at: 1, light: '#FF9248', disc: '#FFA05C', power: 0.5 },
  { at: 4, light: '#FFB060', disc: '#FFC27C', power: 0.65 },
  { at: 8, light: '#FFCE8A', disc: '#FFE2AE', power: 0.8 },
  { at: 15, light: '#FFE6BC', disc: '#FFF5DE', power: 0.92 },
  { at: 30, light: '#FFF4DE', disc: '#FFFDF6', power: 1 },
];

/** A value between the stops either side of `at` (held at the ends). */
function between<S extends { at: number }>(stops: S[], at: number, pick: (s: S) => string): string;
function between<S extends { at: number }>(stops: S[], at: number, pick: (s: S) => number): number;
function between<S extends { at: number }>(stops: S[], at: number, pick: (s: S) => string | number): string | number {
  if (at <= stops[0].at) return pick(stops[0]);
  const last = stops[stops.length - 1];
  if (at >= last.at) return pick(last);
  let i = 0;
  while (stops[i + 1].at < at) i++;
  const a = stops[i];
  const b = stops[i + 1];
  const f = (at - a.at) / (b.at - a.at);
  const x = pick(a);
  const y = pick(b);
  return typeof x === 'number' ? x + ((y as number) - x) * f : mix(x, y as string, f);
}

// Overcast, rain and snow wash the sky toward grey (day and night versions).
const WASH: Record<SkyWeather, { amount: number; day: string; night: string }> = {
  clear: { amount: 0, day: '#B4C0CE', night: '#30384C' },
  partly: { amount: 0.12, day: '#B4C0CE', night: '#30384C' },
  cloudy: { amount: 0.6, day: '#AEB9C7', night: '#30384C' },
  fog: { amount: 0.72, day: '#D6DCE3', night: '#3A4152' },
  rain: { amount: 0.68, day: '#8F9AAA', night: '#262D3D' },
  snow: { amount: 0.55, day: '#D3DAE4', night: '#363E52' },
  storm: { amount: 0.78, day: '#6E7787', night: '#1E2432' },
};

/** How many clouds there are: none to see in fog, the sky above is lost in it. */
const CLOUDS: Record<SkyWeather, number> = { clear: 2, partly: 5, cloudy: 8, fog: 0, rain: 8, snow: 7, storm: 9 };
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
  /** How the scene is lit, as a colour to multiply by (white: full daylight; warm low sun, blue night). */
  light: string;
  /** How far the ground has turned from green with the season (autumn, winter), 0..1, for the grass. */
  turn: number;
  /** 0 by day, 1 deep in the night: dims flowers, lights fireflies. */
  night: number;
  /** How bright the stars are (0..1); none behind clouds. */
  stars: number;
  /** The real night sky there and then (which stars, how faint they show), while any stars are out. */
  starSky: StarSky | null;
  /** City light on the night sky, 0 a dark country sky to 1 a city centre's orange-grey glow. */
  skyglow: number;
  /**
   * The sun while any of it is above the horizon: x 0..1 left to right (it rises on the left facing
   * the noon sun), height 0..1 above the horizon, its altitude in degrees, the colour of its light and
   * of its disc, and its strength (weaker low down).
   */
  sun: { x: number; height: number; altitude: number; color: string; disc: string; power: number } | null;
  /**
   * The moon while it's above the horizon, by day as well (fainter): where it is (as the sun), how much
   * of it is lit (`fraction`), and `tilt`, the way its lit side faces on screen, toward the sun (radians,
   * 0 to the right, a quarter turn down).
   */
  moon: { x: number; height: number; altitude: number; fraction: number; tilt: number } | null;
  /** How much snow lies on the ground, 0 none to 1 all white (from the snow's depth there). */
  snowCover: number;
  /** The sunrise or sunset glow on the horizon under the sun (x 0..1), there before it rises and after it sets. */
  glow: { x: number; color: string; strength: number };
  /** How much the cloud cover hides the sun or moon (and its light), 0 clear to 1 hidden. */
  veil: number;
  clouds: number;
  /** Cloud colour: white by day, lit gold, peach and pink round sunrise and sunset, slate at night, grey in bad weather. */
  cloudColor: string;
  rain: boolean;
  snow: boolean;
  /** How hard the rain or snow comes down: 1 light, 2 moderate, 3 heavy (0 when nothing falls). */
  fall: FallLevel;
  fog: boolean;
  /** How thick the mist or fog is, 0 none to 1 thick fog (from how far you can see). */
  mist: number;
  /** The wind, km/h (0 when it isn't known). */
  wind: number;
  /** A thunderstorm: lightning. */
  lightning: boolean;
  /** Hail falling. */
  hail: boolean;
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
    // Low down the sun sinks fast and changes colour: to half a degree there, to a degree and a half
    // higher up (and no higher than 70, where it's drawn as high as it goes).
    sun: l.sun && { ...l.sun, x: r(l.sun.x, 0.025), height: r(l.sun.height, 0.02), altitude: l.sun.altitude < 8 ? r(l.sun.altitude, 0.5) : r(Math.min(70, l.sun.altitude), 1.5), power: r(l.sun.power, 0.05) },
    moon: l.moon && { x: r(l.moon.x, 0.025), height: r(l.moon.height, 0.02), altitude: l.moon.altitude < 8 ? r(l.moon.altitude, 0.5) : r(Math.min(70, l.moon.altitude), 1.5), fraction: r(l.moon.fraction, 0.02), tilt: r(l.moon.tilt, 0.1) },
    snowCover: r(l.snowCover, 0.05),
    glow: { ...l.glow, x: r(l.glow.x, 0.025), strength: r(l.glow.strength, 0.05) },
    // The stars turn a degree every four minutes: drawn again for that, not for every second.
    starSky: l.starSky && { ...l.starSky, lst: r(l.starSky.lst, 1), limit: r(l.starSky.limit, 0.25), milky: r(l.starSky.milky, 0.1) },
    skyglow: r(l.skyglow, 0.05),
    mist: r(l.mist, 0.05),
    wind: r(l.wind, 5),
  });
}

/**
 * Across the sky, 0..1 left to right, for a bearing: looking toward the noon sun (south in the
 * north, north in the south), east to the left there and west to the right, squeezed so even a
 * midsummer sunrise far round to the north-east stays in view.
 */
function acrossSky(azimuth: number, facing: number): number {
  return 0.5 + 0.45 * Math.max(-1, Math.min(1, rightOf(azimuth, facing) / 135));
}

/** How far to the right of the way you face a bearing is, in degrees (-180..180): clockwise is to your right, facing south or north. */
const rightOf = (azimuth: number, facing: number) => ((azimuth - facing + 540) % 360) - 180;

/** Snow on the ground (cm) to how white the ground is: patchy at a centimetre, nearly all white from about six. */
export const snowCoverOf = (cm: number | null | undefined, snowing: boolean) => (cm != null && cm > 0.2 ? 1 - Math.exp(-cm / 3) : snowing ? 0.15 : 0);
/** Snow as it looks lying in daylight: white with a little blue. */
const SNOW_GROUND = { groundFar: '#F3F6FA', groundMid: '#EEF2F7', groundNear: '#E6ECF3' } as const;

/** A place on the globe, in degrees, and how dark its night sky is (Bortle 1 to 9; about 5 when not known). */
export interface Place {
  latitude: number;
  longitude: number;
  bortle?: number;
}

/** What else the weather there is doing: the wind (km/h), how far you can see (m), hail. */
export interface SkyExtras {
  wind?: number | null;
  visibility?: number | null;
  hail?: boolean;
}

/** How thick mist or fog is from how far you can see (m): fog under a kilometre, mist or haze to a few. */
export const mistOfVisibility = (m: number | null | undefined) => (m == null ? 0 : m < 200 ? 1 : m < 1000 ? 0.8 : m < 3000 ? 0.45 : m < 6000 ? 0.2 : 0);

export function skyLook(now: number, place: Place, weather: SkyWeather, level: FallLevel = 2, snowCm: number | null = null, extra: SkyExtras = {}): SkyLook {
  const pos = sunPosition(now, place.latitude, place.longitude);
  // To half a degree: the sky doesn't visibly change for less, so it isn't drawn again for less.
  const e = Math.round(pos.altitude * 2) / 2;
  const at = (pick: (s: SkyStop) => string) => between(SKY_BY_SUN, e, pick);
  // 0 by day; deepening through the twilight after sunset, full night once the sun is 12 degrees down.
  const dark = Math.max(0, Math.min(1, (-1 - e) / 11));
  const night = dark * dark * (3 - 2 * dark);
  const phase: SkyPhase = e > 6 ? 'day' : e < -10 ? 'night' : pos.morning ? 'dawn' : 'dusk';
  const falls = weather === 'rain' || weather === 'snow' || weather === 'storm';
  const fall: FallLevel = falls ? (level || 2) : 0;
  // Light rain or snow under a paler, thinner cloud; heavy under a darker, thicker one.
  const harder = falls ? fall - 2 : 0;
  const wash = { ...WASH[weather], amount: Math.min(0.9, WASH[weather].amount + 0.09 * harder) };
  const veil = Math.min(0.97, VEIL[weather] + 0.07 * harder);
  const washColor = mix(wash.day, wash.night, night);
  const sky = (k: 'top' | 'mid' | 'horizon', w: number) => mix(at((s) => s[k]), washColor, w);
  // The ground in the season's colours, lit as the sun lights it, then greyed by the weather.
  const lit = at((s) => s.ground);
  const light = mix(lit, greyOf(lit), wash.amount * 0.6);
  const season = seasonGround(now, place.latitude);
  // Snow lying on the ground whitens it (the near field keeps a little of the grass showing through).
  const snowCover = snowCoverOf(snowCm, weather === 'snow');
  const covered = (k: GroundKey) => mix(season[k], SNOW_GROUND[k], snowCover * (k === 'groundNear' ? 0.82 : 0.9));
  const ground = (k: GroundKey) => mix(multiply(covered(k), light), '#7C8A80', wash.amount * 0.25);
  // Facing the noon sun: south of the equator (or in the tropics with the sun overhead to the north), north.
  const facing = place.latitude >= pos.declination ? 180 : 0;
  const x = acrossSky(pos.azimuth, facing);
  // Up while any of it shows: the last of its top edge goes at 0.83 degrees down.
  const sun: SkyLook['sun'] =
    e > -0.9
      ? {
          x,
          height: Math.max(0, Math.min(1, e / 70)),
          altitude: e,
          color: between(SUN_BY_ALTITUDE, e, (s) => s.light),
          disc: between(SUN_BY_ALTITUDE, e, (s) => s.disc),
          power: between(SUN_BY_ALTITUDE, e, (s) => s.power),
        }
      : null;
  // The moon where it really is, lit on its side toward the sun.
  const m = moonPosition(now, place.latitude, place.longitude);
  const moonAlt = Math.round(m.altitude * 2) / 2;
  const tilt = Math.atan2(-(pos.altitude - m.altitude), rightOf(pos.azimuth, facing) - rightOf(m.azimuth, facing));
  const moon: SkyLook['moon'] = moonAlt > -1 ? { x: acrossSky(m.azimuth, facing), height: Math.max(0, Math.min(1, moonAlt / 70)), altitude: moonAlt, fraction: m.fraction, tilt } : null;
  // A bright moon up hides the fainter stars.
  const moonlit = moon ? 1 - 0.4 * m.fraction * Math.min(1, Math.max(0, moonAlt / 10)) : 1;
  // Through cloud the glow is mostly lost: a faint warmth on that side.
  const glow = { x, color: mix(at((s) => s.glow), washColor, wash.amount * 0.5), strength: between(SKY_BY_SUN, e, (s) => s.glowAlpha) * (1 - 0.8 * veil) };
  // City light: an orange-grey glow on the night sky, lighting the clouds from below.
  const bortle = place.bortle ?? 5;
  const skyglow = Math.max(0, Math.min(1, (bortle - 3) / 6)) * night;
  const cloudColor = mix(mix(mix(at((s) => s.cloud), '#9AA3B1', Math.max(0, wash.amount - 0.2)), washColor, wash.amount * 0.2), '#6E625E', skyglow * 0.45);
  // The real stars, as many as show through the twilight, the moonlight and the city's glow.
  const limit = starLimit(bortle, pos.altitude, moon, weather === 'partly');
  const starSky: StarSky | null = (weather === 'clear' || weather === 'partly') && limit > -1 ? { lst: siderealDeg(now, place.longitude), latitude: place.latitude, facing, limit, milky: Math.max(0, Math.min(1, (limit - 5.6) / 1.5)) } : null;
  const mist = Math.max(weather === 'fog' ? 0.8 : 0, mistOfVisibility(extra.visibility), weather === 'rain' && fall === 1 ? 0.15 : 0);
  return {
    phase,
    top: sky('top', wash.amount),
    mid: sky('mid', wash.amount),
    horizon: sky('horizon', wash.amount * 0.8),
    groundFar: ground('groundFar'),
    groundMid: ground('groundMid'),
    groundNear: ground('groundNear'),
    light,
    turn: season.turn,
    night,
    stars: (weather === 'clear' ? night : weather === 'partly' ? night * 0.6 : 0) * moonlit,
    starSky,
    skyglow,
    sun,
    moon,
    snowCover,
    glow,
    veil,
    clouds: CLOUDS[weather] + harder,
    cloudColor,
    rain: weather === 'rain' || weather === 'storm',
    snow: weather === 'snow',
    fall,
    fog: weather === 'fog' || mist >= 0.7,
    mist,
    wind: Math.max(0, extra.wind ?? 0),
    lightning: weather === 'storm',
    hail: !!extra.hail,
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

/** A colour lit by a light: each channel scaled by the light's (white leaves it as it is). */
export function multiply(a: string, light: string): string {
  const x = hex(a);
  const y = hex(light);
  return toHex(x.map((v, i) => (v * y[i]) / 255));
}

/** The grey as bright as a colour. */
const greyOf = (a: string) => {
  const [r, g, b] = hex(a);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  return toHex([l, l, l]);
};

/** Mix two #RRGGBB colours: t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return toHex(x.map((v, i) => v + (y[i] - v) * k));
}
