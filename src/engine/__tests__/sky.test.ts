import { defaultSunTimes, skyLook, SKY_PALETTES, solarDay, sunTimes, weatherFromCode } from '../sky';

const utc = (iso: string) => new Date(iso).getTime();
const near = (ms: number | null, iso: string, minutes = 6) => {
  expect(ms).not.toBeNull();
  expect(Math.abs((ms as number) - utc(iso)) / 60_000).toBeLessThan(minutes);
};

describe('sun times', () => {
  it('matches published sunrise and sunset', () => {
    // London, midsummer: about 04:43 and 21:21 BST.
    const london = sunTimes(51.5074, -0.1278, '2026-06-21');
    near(london.sunrise, '2026-06-21T03:43:00Z');
    near(london.sunset, '2026-06-21T20:21:00Z');
    // New York, midwinter: about 07:17 and 16:32 EST.
    const ny = sunTimes(40.7128, -74.006, '2026-12-21');
    near(ny.sunrise, '2026-12-21T12:17:00Z');
    near(ny.sunset, '2026-12-21T21:32:00Z');
    // Tokyo, east of Greenwich: about 06:43 and 16:47 JST in late November.
    const tokyo = sunTimes(35.6762, 139.6503, '2026-11-30');
    near(tokyo.sunrise, '2026-11-29T21:35:00Z', 10);
    near(tokyo.sunset, '2026-11-30T07:28:00Z', 10);
  });

  it("takes the day from the place's own clock, not the phone's", () => {
    // 00:30 UTC on the 6th is still the afternoon of the 5th in Seattle, and the morning of the 6th in Tokyo.
    expect(solarDay(utc('2026-11-06T00:30:00Z'), -122.33)).toBe('2026-11-05');
    expect(solarDay(utc('2026-11-06T00:30:00Z'), 139.65)).toBe('2026-11-06');
  });

  it('knows the midnight sun and the polar night', () => {
    expect(sunTimes(78.22, 15.65, '2026-06-21').polar).toBe('day');
    expect(sunTimes(78.22, 15.65, '2026-12-21').polar).toBe('night');
  });
});

describe('the sky', () => {
  const sun = defaultSunTimes(new Date(2026, 10, 5));
  const at = (h: number, m = 0) => new Date(2026, 10, 5, h, m).getTime();

  it('follows the day: night, sunrise, day, sunset, night', () => {
    expect(skyLook(at(3), sun, 'clear').phase).toBe('night');
    expect(skyLook(at(6, 25), sun, 'clear').phase).toBe('dawn');
    expect(skyLook(at(12), sun, 'clear').phase).toBe('day');
    expect(skyLook(at(18, 35), sun, 'clear').phase).toBe('dusk');
    expect(skyLook(at(22), sun, 'clear').phase).toBe('night');
  });

  it('uses the palette as is on a clear midday, with the sun high and no stars', () => {
    const noon = skyLook(at(12, 30), sun, 'clear');
    expect(noon.top).toBe(SKY_PALETTES.day.top);
    expect(noon.stars).toBe(0);
    expect(noon.sun!.height).toBeGreaterThan(0.95);
    expect(noon.darkSky).toBe(false);
  });

  it('shows stars on a clear night and none behind clouds', () => {
    expect(skyLook(at(23), sun, 'clear').stars).toBe(1);
    expect(skyLook(at(23), sun, 'cloudy').stars).toBe(0);
    expect(skyLook(at(23), sun, 'clear').darkSky).toBe(true);
  });

  it('greys the sky for bad weather and hides the sun', () => {
    const rain = skyLook(at(12), sun, 'rain');
    expect(rain.top).not.toBe(SKY_PALETTES.day.top);
    expect(rain.sun).toBeNull();
    expect(rain.rain).toBe(true);
    expect(skyLook(at(12), sun, 'snow').snow).toBe(true);
  });

  it('reads Open-Meteo weather codes', () => {
    expect(weatherFromCode(0)).toBe('clear');
    expect(weatherFromCode(2)).toBe('partly');
    expect(weatherFromCode(3)).toBe('cloudy');
    expect(weatherFromCode(45)).toBe('fog');
    expect(weatherFromCode(63)).toBe('rain');
    expect(weatherFromCode(81)).toBe('rain');
    expect(weatherFromCode(73)).toBe('snow');
    expect(weatherFromCode(95)).toBe('storm');
    expect(weatherFromCode(null)).toBe('clear');
  });
});
