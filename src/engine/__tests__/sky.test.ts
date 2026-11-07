import { defaultPlace, fallLevelFromCode, lookKey, mistOfVisibility, moonPosition, seasonGround, skyLook, snowCoverOf, solarDay, sunPosition, sunTimes, weatherFromCode } from '../sky';

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

describe('where the sun is', () => {
  it('matches published positions', () => {
    // New York, midsummer solar noon (about 12:57 EDT): about 72.7 degrees up, due south.
    const noon = sunPosition(utc('2026-06-21T16:57:00Z'), 40.71, -74.0);
    expect(noon.altitude).toBeCloseTo(72.7, 0);
    expect(Math.abs(noon.azimuth - 180)).toBeLessThan(3);
    // At sunset the top of the disc is going: the centre about 0.83 degrees down, in the north-west.
    const ny = sunTimes(40.71, -74.0, '2026-06-21');
    const set = sunPosition(ny.sunset!, 40.71, -74.0);
    expect(set.altitude).toBeCloseTo(-0.83, 0);
    expect(set.azimuth).toBeGreaterThan(290);
    expect(set.azimuth).toBeLessThan(305);
    expect(sunPosition(ny.sunrise! + 3_600_000, 40.71, -74.0).morning).toBe(true);
  });

  it('without a play location, has the sun at its highest about 12:30 on the phone', () => {
    const p = defaultPlace(utc('2026-11-06T18:00:00Z'));
    expect(p.latitude).toBe(40);
    expect(p.longitude).toBeGreaterThanOrEqual(-180);
    expect(p.longitude).toBeLessThanOrEqual(180);
  });
});

describe('the moon', () => {
  it('goes through its real phases', () => {
    // 2026: new moon Nov 9, first quarter Nov 17, full moon Nov 24.
    expect(moonPosition(utc('2026-11-09T07:00:00Z'), 40, -90).fraction).toBeLessThan(0.03);
    const quarter = moonPosition(utc('2026-11-17T12:00:00Z'), 40, -90);
    expect(quarter.fraction).toBeGreaterThan(0.4);
    expect(quarter.fraction).toBeLessThan(0.6);
    expect(quarter.phase).toBeGreaterThan(0.2);
    expect(quarter.phase).toBeLessThan(0.3);
    expect(moonPosition(utc('2026-11-24T14:00:00Z'), 40, -90).fraction).toBeGreaterThan(0.97);
  });

  it('rises and sets like the sun, a full moon up all night and a new one by day', () => {
    // A full moon stands high at midnight and is down at noon.
    const place = { latitude: 40, longitude: -90 };
    expect(skyLook(utc('2026-11-25T06:00:00Z'), place, 'clear').moon!.altitude).toBeGreaterThan(40);
    expect(skyLook(utc('2026-11-24T18:00:00Z'), place, 'clear').moon).toBeNull();
    // A waxing crescent after sunset is low in the west (right, facing south), lit on its right, toward the sun.
    const evening = skyLook(utc('2026-11-12T23:30:00Z'), place, 'clear').moon!;
    expect(evening.x).toBeGreaterThan(0.6);
    expect(Math.cos(evening.tilt)).toBeGreaterThan(0.3);
    expect(evening.fraction).toBeLessThan(0.2);
  });
});

describe('snow on the ground', () => {
  it('whitens the ground with its depth', () => {
    expect(snowCoverOf(0, false)).toBe(0);
    expect(snowCoverOf(null, false)).toBe(0);
    expect(snowCoverOf(null, true)).toBeGreaterThan(0);
    expect(snowCoverOf(1, false)).toBeGreaterThan(0.2);
    expect(snowCoverOf(1, false)).toBeLessThan(0.4);
    expect(snowCoverOf(10, false)).toBeGreaterThan(0.95);
    const place = { latitude: 45, longitude: -93 };
    const noon = utc('2027-01-15T18:00:00Z');
    const bright = (h: string) => [1, 3, 5].reduce((n, i) => n + parseInt(h.slice(i, i + 2), 16), 0);
    const bare = skyLook(noon, place, 'clear');
    const white = skyLook(noon, place, 'clear', 0, 20);
    expect(white.snowCover).toBeGreaterThan(0.99);
    expect(bright(white.groundNear)).toBeGreaterThan(bright(bare.groundNear) + 150);
  });
});

describe('the sky', () => {
  // Memphis-ish, early November: sunrise about 6:20, sunset about 16:57 (UTC-6).
  const place = { latitude: 35, longitude: -90 };
  const pad = (n: number) => String(n).padStart(2, '0');
  const at = (h: number, m = 0) => utc(`2026-11-06T${pad(h)}:${pad(m)}:00-06:00`);
  const look = (h: number, m = 0, weather: Parameters<typeof skyLook>[2] = 'clear') => skyLook(at(h, m), place, weather);
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  it('follows the sun: night, dawn, day, dusk, night', () => {
    expect(look(3).phase).toBe('night');
    expect(look(6, 15).phase).toBe('dawn');
    expect(look(12).phase).toBe('day');
    expect(look(17, 10).phase).toBe('dusk');
    expect(look(21).phase).toBe('night');
  });

  it('keeps the twilight as long as the sun takes to sink: the glow after sunset, then night', () => {
    const justSet = look(17, 5);
    expect(justSet.sun).toBeNull();
    expect(justSet.glow.strength).toBeGreaterThan(0.6);
    expect(justSet.night).toBeLessThan(0.2);
    expect(look(17, 40).night).toBeGreaterThan(0.5);
    expect(look(19).night).toBe(1);
    expect(look(19).glow.strength).toBe(0);
  });

  it('has a deep blue sky by day, paling to the horizon, the sun white-hot and no stars', () => {
    const noon = look(11, 45);
    const [r, , b] = rgb(noon.top);
    expect(b).toBeGreaterThan(r * 2);
    expect(rgb(noon.horizon)[0]).toBeGreaterThan(r + 60);
    expect(noon.stars).toBe(0);
    expect(noon.sun!.power).toBe(1);
    expect(noon.darkSky).toBe(false);
    // November at 35 degrees north: the sun stands about 39 degrees up at noon.
    expect(noon.sun!.altitude).toBeGreaterThan(37);
    expect(noon.sun!.altitude).toBeLessThan(41);
  });

  it('turns the low sun gold and orange, and lights the field warm', () => {
    const late = look(16, 40);
    const [r, g, b] = rgb(late.sun!.color);
    expect(r).toBe(255);
    expect(b).toBeLessThan(g - 40);
    expect(rgb(late.light)[2]).toBeLessThan(rgb(late.light)[0] - 30);
    expect(late.sun!.power).toBeLessThan(0.7);
  });

  it('rises on the left and sets on the right, further round in summer', () => {
    expect(look(7).sun!.x).toBeLessThan(0.35);
    expect(look(16).sun!.x).toBeGreaterThan(0.65);
    const june = sunTimes(40.71, -74.0, '2026-06-21');
    const december = sunTimes(40.71, -74.0, '2026-12-21');
    const ny = { latitude: 40.71, longitude: -74.0 };
    const early = (t: typeof june) => t.sunrise! + 3_600_000;
    expect(skyLook(early(june), ny, 'clear').sun!.x).toBeLessThan(skyLook(early(december), ny, 'clear').sun!.x);
    // Higher at a summer noon than a winter one.
    const noonOf = (t: typeof june) => (t.sunrise! + t.sunset!) / 2;
    expect(skyLook(noonOf(june), ny, 'clear').sun!.height).toBeGreaterThan(0.95);
    expect(skyLook(noonOf(december), ny, 'clear').sun!.height).toBeLessThan(0.4);
  });

  it('runs right to left south of the equator, facing the noon sun in the north', () => {
    const sydney = { latitude: -33.87, longitude: 151.21 };
    const morning = skyLook(utc('2026-11-06T21:00:00Z'), sydney, 'clear');
    const afternoon = skyLook(utc('2026-11-07T05:00:00Z'), sydney, 'clear');
    expect(morning.sun!.x).toBeGreaterThan(0.6);
    expect(afternoon.sun!.x).toBeLessThan(0.4);
  });

  it('turns the ground gold in autumn and straw in winter, half a year on in the south, green in the tropics', () => {
    const october = new Date(2026, 9, 20).getTime();
    const april = new Date(2026, 3, 20).getTime();
    const north = seasonGround(october, 45);
    expect(north.turn).toBeGreaterThan(0.9);
    // Gold: more red than green in the near field.
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r, g] = rgb(north.groundNear);
    expect(r).toBeGreaterThan(g);
    // The same day in the south is spring there: green.
    expect(seasonGround(october, -35).turn).toBeLessThan(0.1);
    expect(seasonGround(april, 45).turn).toBeLessThan(0.1);
    // Near the equator it stays summer green all year.
    expect(seasonGround(october, 5)).toMatchObject({ groundNear: '#66AE42', turn: 0 });
  });

  it('shows stars on a clear night and none behind clouds', () => {
    expect(look(23).stars).toBe(1);
    expect(look(23, 0, 'cloudy').stars).toBe(0);
    expect(look(23).darkSky).toBe(true);
  });

  it('greys the sky for bad weather, the sun still up there behind the cloud', () => {
    const rain = look(12, 0, 'rain');
    expect(rain.top).not.toBe(look(12).top);
    expect(rain.sun).not.toBeNull();
    expect(rain.veil).toBeGreaterThan(0.7);
    expect(look(12).veil).toBe(0);
    expect(rain.rain).toBe(true);
    expect(look(12, 0, 'snow').snow).toBe(true);
  });

  it('falls light, moderate or heavy, under thinner or thicker cloud', () => {
    const light = skyLook(at(12), place, 'rain', 1);
    const heavy = skyLook(at(12), place, 'rain', 3);
    expect(light.fall).toBe(1);
    expect(heavy.fall).toBe(3);
    expect(heavy.veil).toBeGreaterThan(light.veil);
    expect(heavy.clouds).toBeGreaterThan(light.clouds);
    expect(look(12).fall).toBe(0);
    expect(fallLevelFromCode(61)).toBe(1);
    expect(fallLevelFromCode(63)).toBe(2);
    expect(fallLevelFromCode(65)).toBe(3);
    expect(fallLevelFromCode(71)).toBe(1);
    expect(fallLevelFromCode(75)).toBe(3);
    expect(fallLevelFromCode(0)).toBe(0);
  });

  it('lies in fog and mist, from how far you can see', () => {
    expect(mistOfVisibility(null)).toBe(0);
    expect(mistOfVisibility(40000)).toBe(0);
    expect(mistOfVisibility(4000)).toBeGreaterThan(0);
    expect(mistOfVisibility(500)).toBeGreaterThan(mistOfVisibility(4000));
    const fog = skyLook(at(9), place, 'fog');
    expect(fog.mist).toBeGreaterThan(0.5);
    expect(fog.fog).toBe(true);
    // The sky above is lost in it: no clouds to see.
    expect(fog.clouds).toBe(0);
    // A clear morning with thick ground fog all the same.
    expect(skyLook(at(9), place, 'clear', 0, null, { visibility: 150 }).fog).toBe(true);
    expect(look(12).mist).toBe(0);
  });

  it('carries the wind, lightning and hail', () => {
    expect(skyLook(at(12), place, 'storm', 2).lightning).toBe(true);
    expect(look(12).lightning).toBe(false);
    expect(skyLook(at(12), place, 'storm', 3, null, { hail: true, wind: 40 })).toMatchObject({ hail: true, wind: 40 });
    expect(look(12).wind).toBe(0);
  });

  it('shows the real stars by night, fewer under a city\'s glow, none under cloud', () => {
    const night = utc('2026-11-06T04:30:00Z');
    const phoenix = { latitude: 33.45, longitude: -112.07 };
    const city = skyLook(night, { ...phoenix, bortle: 9 }, 'clear');
    const desert = skyLook(night, { ...phoenix, bortle: 2 }, 'clear');
    expect(city.starSky!.limit).toBeLessThan(desert.starSky!.limit);
    expect(desert.starSky!.milky).toBeGreaterThan(0);
    expect(city.starSky!.milky).toBe(0);
    // The city's light glows on its sky; a dark place's doesn't.
    expect(city.skyglow).toBeGreaterThan(0.5);
    expect(desert.skyglow).toBe(0);
    expect(skyLook(night, phoenix, 'cloudy').starSky).toBeNull();
    // None by day.
    expect(skyLook(utc('2026-11-06T19:00:00Z'), phoenix, 'clear').starSky).toBeNull();
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

describe('drawing the sky again', () => {
  it('only when it visibly changes', () => {
    const place = { latitude: 40, longitude: -90 };
    const pad = (n: number) => String(n).padStart(2, '0');
    const at = (h: number, m: number) => skyLook(utc(`2026-07-01T${pad(h)}:${pad(m)}:00-05:00`), place, 'clear');
    // An hour of five-minute ticks round a summer noon, when the sun swings across fastest: drawn
    // afresh only every seven or eight minutes instead of at every tick, and an hour on it has moved enough to see.
    const keys = new Set(Array.from({ length: 12 }, (_, i) => lookKey(at(12, i * 5))));
    expect(keys.size).toBeGreaterThan(1);
    expect(keys.size).toBeLessThanOrEqual(8);
    expect(lookKey(at(12, 0))).not.toBe(lookKey(at(13, 0)));
    // Weather always counts.
    expect(lookKey(at(12, 0))).not.toBe(lookKey(skyLook(utc('2026-07-01T12:00:00-05:00'), place, 'rain')));
  });
});
