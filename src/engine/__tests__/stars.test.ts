import { limitOfBortle, milkyWay, seenStars, siderealDeg, starLimit, type StarSky } from '../stars';
import { STAR_COUNT } from '../starData';

const sky = (at: string, latitude: number, longitude: number, limit = 6.5, facing = 180): StarSky => ({ lst: siderealDeg(Date.parse(at), longitude), latitude, facing, limit, milky: 1 });

describe('the night sky', () => {
  it('holds the whole bright star catalogue', () => {
    expect(STAR_COUNT).toBeGreaterThan(9000);
  });

  it('works out sidereal time', () => {
    // At J2000.0 (noon UTC, 1 January 2000) Greenwich mean sidereal time was 280.46 degrees.
    expect(siderealDeg(Date.parse('2000-01-01T12:00:00Z'), 0)).toBeCloseTo(280.46, 1);
    // A degree of longitude east is a degree on.
    expect(siderealDeg(Date.parse('2000-01-01T12:00:00Z'), 10)).toBeCloseTo(290.46, 1);
  });

  it('puts the pole star at the latitude, all night', () => {
    for (const at of ['2026-01-15T03:00:00Z', '2026-07-15T03:00:00Z']) {
      // Polaris (magnitude 2, a little fainter through the air) is the one bright star due north.
      const north = seenStars(sky(at, 40, 0, 2.5, 0)).filter((s) => Math.abs(s.right) < 2);
      expect(north).toHaveLength(1);
      expect(north[0].alt).toBeGreaterThan(38.5);
      expect(north[0].alt).toBeLessThan(41.5);
    }
  });

  it('shows the season\'s stars: Sirius on a winter evening, not a summer one', () => {
    // Sirius is the brightest star of all; 10 pm at Greenwich, 40 degrees north.
    const brightest = (at: string) => seenStars(sky(at, 40, 0)).filter((s) => s.mag < -1);
    expect(brightest('2026-01-20T22:00:00Z').length).toBe(1);
    expect(brightest('2026-07-20T22:00:00Z').length).toBe(0);
  });

  it('shows fainter stars the darker the sky, and fewer toward the horizon', () => {
    const at = '2026-11-06T04:30:00Z';
    const city = seenStars(sky(at, 33.4, -112.1, limitOfBortle(9))).length;
    const country = seenStars(sky(at, 33.4, -112.1, limitOfBortle(2))).length;
    expect(city).toBeGreaterThan(3);
    expect(country).toBeGreaterThan(city * 10);
    // Seen through more air, a low star is fainter than its catalogue magnitude.
    const low = seenStars(sky(at, 33.4, -112.1, 6)).filter((s) => s.alt < 10);
    expect(low.length).toBeGreaterThan(0);
  });

  it('dims the stars in twilight, in moonlight and in a city', () => {
    expect(limitOfBortle(1)).toBeCloseTo(7.6);
    expect(limitOfBortle(9)).toBeCloseTo(3.6);
    const dark = starLimit(2, -30, null, false);
    expect(starLimit(2, -3, null, false)).toBeLessThan(0);
    expect(starLimit(2, -9, null, false)).toBeLessThan(dark);
    expect(starLimit(2, -30, { altitude: 40, fraction: 1 }, false)).toBeLessThan(dark - 1);
    // A city sky is bright already: the moon takes less away there.
    expect(starLimit(9, -30, null, false) - starLimit(9, -30, { altitude: 40, fraction: 1 }, false)).toBeLessThan(dark - starLimit(2, -30, { altitude: 40, fraction: 1 }, false));
  });

  it('lays the Milky Way along the galaxy, brightest toward its centre', () => {
    // A July evening: Sagittarius, where the centre is, low in the south.
    const summer = milkyWay(sky('2026-07-20T22:00:00Z', 40, 0));
    expect(summer.length).toBeGreaterThan(10);
    const south = summer.filter((m) => Math.abs(m.right) < 30 && m.alt < 30);
    expect(Math.max(...south.map((m) => m.glow))).toBeGreaterThan(0.6);
    // None under a sky too bright for it.
    expect(milkyWay({ ...sky('2026-07-20T22:00:00Z', 40, 0), milky: 0 })).toEqual([]);
  });
});
