import { STAR_COUNT, STARS } from './starData';

/**
 * The night sky as it really is from a place: every star the eye can see (the Yale Bright Star
 * Catalog), where it stands at that moment (it turns with the Earth, so the season decides which
 * stars are up in the evening) and how bright, dimmed toward the horizon by the thicker air there;
 * and the Milky Way along the plane of the galaxy.
 */

const RAD = Math.PI / 180;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

interface Catalog {
  ra: Float64Array;
  sinDec: Float64Array;
  cosDec: Float64Array;
  mag: Float32Array;
  bv: Float32Array;
}

let catalog: Catalog | null = null;

/** The stars, unpacked the first time they're needed (radians; brightest first). */
function stars(): Catalog {
  if (catalog) return catalog;
  const at = new Int8Array(128);
  for (let i = 0; i < ALPHA.length; i++) at[ALPHA.charCodeAt(i)] = i;
  const c: Catalog = { ra: new Float64Array(STAR_COUNT), sinDec: new Float64Array(STAR_COUNT), cosDec: new Float64Array(STAR_COUNT), mag: new Float32Array(STAR_COUNT), bv: new Float32Array(STAR_COUNT) };
  for (let i = 0; i < STAR_COUNT; i++) {
    // 42 bits: past what bit operators hold, so by plain arithmetic.
    let v = 0;
    for (let k = 0; k < 7; k++) v = v * 64 + at[STARS.charCodeAt(i * 7 + k)];
    const a = Math.floor(v / 2 ** 27);
    const rest = v - a * 2 ** 27;
    const d = Math.floor(rest / 2 ** 13);
    const low = rest - d * 2 ** 13;
    const dec = ((d / 16383) * 180 - 90) * RAD;
    c.ra[i] = (a / 32768) * 2 * Math.PI;
    c.sinDec[i] = Math.sin(dec);
    c.cosDec[i] = Math.cos(dec);
    c.mag[i] = Math.floor(low / 64) / 10 - 1.5;
    c.bv[i] = (low % 64) / 20 - 0.5;
  }
  catalog = c;
  return c;
}

/** The local sidereal time (degrees): which part of the sky is due south (or north) overhead. */
export function siderealDeg(now: number, longitude: number) {
  const days = now / 86_400_000 + 2440587.5 - 2451545.0;
  return (((280.46061837 + 360.98564736629 * days + longitude) % 360) + 360) % 360;
}

/** What the night sky shows at a place: where it's turned to, and how faint a star can be and still show. */
export interface StarSky {
  /** Local sidereal time, degrees. */
  lst: number;
  latitude: number;
  /** The bearing the view faces (degrees, 180 south). */
  facing: number;
  /** The faintest magnitude seen overhead (dark country sky about 7, a city 4 or less, twilight less). */
  limit: number;
  /** How plain the Milky Way is (0 none: it needs a dark sky). */
  milky: number;
}

/** A star in the sky: degrees above the horizon and to the right of the way the view faces, its magnitude as seen, its colour. */
export interface SeenStar {
  alt: number;
  right: number;
  mag: number;
  bv: number;
}

/** Fainter toward the horizon, through more air: about a quarter of a magnitude for each air mass. */
const EXTINCTION = 0.25;

/** Altitude and bearing (degrees, azimuth from north round through east) of a point at right ascension `ra`. */
function place(ra: number, sinDec: number, cosDec: number, lst: number, sinLat: number, cosLat: number) {
  const h = lst - ra;
  const cosH = Math.cos(h);
  const sinAlt = sinLat * sinDec + cosLat * cosDec * cosH;
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(-cosDec * Math.sin(h), sinDec * cosLat - cosDec * sinLat * cosH);
  return { alt: alt / RAD, az: ((az / RAD) % 360 + 360) % 360 };
}

const rightOf = (azimuth: number, facing: number) => ((azimuth - facing + 540) % 360) - 180;

/** The stars up and bright enough to see, `wide` degrees either side of the way the view faces. */
export function seenStars(sky: StarSky, wide = 180): SeenStar[] {
  const c = stars();
  const lst = sky.lst * RAD;
  const sinLat = Math.sin(sky.latitude * RAD);
  const cosLat = Math.cos(sky.latitude * RAD);
  const out: SeenStar[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    // Brightest first: past the limit, none of the rest show.
    if (c.mag[i] > sky.limit) break;
    const p = place(c.ra[i], c.sinDec[i], c.cosDec[i], lst, sinLat, cosLat);
    if (p.alt <= 0.5) continue;
    const right = rightOf(p.az, sky.facing);
    if (Math.abs(right) > wide) continue;
    // Air mass (Kasten and Young's, close enough here).
    const s = Math.sin(p.alt * RAD);
    const airMass = 1 / (s + 0.50572 * Math.pow(p.alt + 6.07995, -1.6364));
    const mag = c.mag[i] + EXTINCTION * (airMass - 1);
    if (mag > sky.limit) continue;
    out.push({ alt: p.alt, right, mag, bv: c.bv[i] });
  }
  return out;
}

/** A point of the Milky Way: where it is, how bright (0..1) and how wide (degrees). */
export interface MilkyPatch {
  alt: number;
  right: number;
  glow: number;
  size: number;
}

// The galaxy's plane, in equatorial coordinates (J2000): its north pole and the bearing of the
// celestial pole from it.
const GAL_POLE_RA = 192.85948 * RAD;
const GAL_POLE_DEC = 27.12825 * RAD;
const GAL_NCP_L = 122.93192 * RAD;

/** Galactic longitude and latitude (radians) to right ascension and the sine and cosine of declination. */
function fromGalactic(l: number, b: number) {
  const sinDec = Math.sin(b) * Math.sin(GAL_POLE_DEC) + Math.cos(b) * Math.cos(GAL_POLE_DEC) * Math.cos(GAL_NCP_L - l);
  const dec = Math.asin(sinDec);
  const y = Math.cos(b) * Math.sin(GAL_NCP_L - l);
  const x = Math.sin(b) * Math.cos(GAL_POLE_DEC) - Math.cos(b) * Math.sin(GAL_POLE_DEC) * Math.cos(GAL_NCP_L - l);
  return { ra: Math.atan2(y, x) + GAL_POLE_RA, sinDec, cosDec: Math.cos(dec) };
}

/**
 * How bright the Milky Way is along its length (galactic longitude, degrees): brightest toward the
 * galaxy's centre in Sagittarius and Scorpius, bright again through Cygnus, faint the other way.
 */
const milkyGlow = (l: number) => {
  const toCentre = Math.cos(l * RAD);
  const cygnus = Math.exp(-(((((l - 75) % 360) + 540) % 360 - 180) ** 2) / 900);
  return Math.max(0.18, 0.35 + 0.45 * toCentre + 0.3 * cygnus);
};

/** The Milky Way's patches up in the sky, along the galaxy's plane and a little either side of it. */
export function milkyWay(sky: StarSky, wide = 180): MilkyPatch[] {
  if (sky.milky <= 0) return [];
  const lst = sky.lst * RAD;
  const sinLat = Math.sin(sky.latitude * RAD);
  const cosLat = Math.cos(sky.latitude * RAD);
  const out: MilkyPatch[] = [];
  for (let l = 0; l < 360; l += 3) {
    // Wider and brighter toward the centre, where the bulge is.
    const thick = 6 + 6 * Math.max(0, Math.cos(l * RAD));
    for (const b of [-thick * 0.6, 0, thick * 0.6]) {
      const g = fromGalactic(l * RAD, b * RAD);
      const p = place(g.ra, g.sinDec, g.cosDec, lst, sinLat, cosLat);
      if (p.alt <= 2) continue;
      const right = rightOf(p.az, sky.facing);
      if (Math.abs(right) > wide) continue;
      // Thinner air higher up shows it better.
      const air = Math.min(1, p.alt / 25);
      out.push({ alt: p.alt, right, glow: milkyGlow(l) * (b === 0 ? 1 : 0.55) * air * sky.milky, size: thick * (b === 0 ? 1 : 0.7) });
    }
  }
  return out;
}

/**
 * How dark the sky is at a place, on the Bortle scale (1 the darkest country sky, 9 a city centre),
 * to the faintest star seen overhead on a clear, moonless night there.
 */
export const limitOfBortle = (bortle: number) => 7.6 - 0.5 * (Math.max(1, Math.min(9, bortle)) - 1);

/**
 * The faintest star showing overhead: the place's dark-sky limit, less in twilight (the brightest
 * stars first, the rest as it darkens), with a bright moon up (which matters less where the sky is
 * already bright), and through a scattering of cloud.
 */
export function starLimit(bortle: number, sunAltitude: number, moon: { altitude: number; fraction: number } | null, partly: boolean) {
  const site = limitOfBortle(bortle);
  // The brightest stars show soon after sunset (magnitude 1 by the end of civil twilight, at 6
  // degrees down), the faintest only once the sun is 18 down.
  const e = -sunAltitude;
  const twilight = e <= 1 ? -9 : e <= 6 ? -1.5 + ((e - 1) / 5) * 2.5 : e <= 12 ? 1 + ((e - 6) / 6) * 3.5 : 4.5 + (Math.min(e, 18) - 12) / 6 * 3.1;
  const darkness = Math.max(0, Math.min(1, (site - 3.5) / 4));
  const moonlight = moon && moon.altitude > 0 ? 1.8 * moon.fraction * Math.min(1, moon.altitude / 25) * darkness : 0;
  return Math.min(site, twilight) - moonlight - (partly ? 0.3 : 0);
}
