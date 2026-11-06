import { DEFAULT_WEATHER_ALERTS, planWeatherAlerts, weatherWord, type AlertDay, type AlertForecast, type AlertHour } from '../weatherAlerts';

const fill = (s: string, p?: Record<string, string | number>) => (p ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m)) : s);
const text = { t: fill, temp: (c: number) => `${Math.round(c)}°C`, clock: (h: number, m: number) => `${h}:${String(m).padStart(2, '0')}` };
const limits = { hot: 32, cold: 2 };

const day = (date: string, d: Partial<AlertDay> = {}): AlertDay => ({ date, code: 1, tmax: 22, tmin: 12, feelsMax: 22, feelsMin: 11, precip: 0, precipChance: 10, snow: 0, gusts: 20, uvMax: 3, ...d });
/** Hours 0-23 of a day, each as `at(hour)` says. */
const hours = (date: string, at: (h: number) => Partial<AlertHour> = () => ({})): AlertHour[] =>
  Array.from({ length: 24 }, (_, h) => ({ time: `${date}T${String(h).padStart(2, '0')}:00`, precipChance: 5, precip: 0, uv: 1, code: 1, ...at(h) }));

const TODAY = '2026-07-01';
const TOMORROW = '2026-07-02';
const DAY_AFTER = '2026-07-03';
const early = new Date(2026, 6, 1, 6, 0);
const plan = (forecast: AlertForecast, prefs = { ...DEFAULT_WEATHER_ALERTS, enabled: true }, now = early) => planWeatherAlerts({ prefs, forecast, limits, today: TODAY, now, text });

describe('weather alerts', () => {
  it('sends nothing until turned on', () => {
    expect(planWeatherAlerts({ prefs: DEFAULT_WEATHER_ALERTS, forecast: { days: [day(TODAY)], hours: hours(TODAY) }, limits, today: TODAY, now: early, text })).toEqual([]);
  });

  it('gives a morning forecast for today and tomorrow, with sunscreen when the UV is high', () => {
    const out = plan({ days: [day(TODAY, { uvMax: 7.4, tmax: 27, tmin: 15, precipChance: 20 }), day(TOMORROW)], hours: [...hours(TODAY), ...hours(TOMORROW)] });
    const forecasts = out.filter((a) => a.kind === 'forecast');
    expect(forecasts.map((a) => a.date)).toEqual([TODAY, TOMORROW]);
    expect(forecasts[0]).toMatchObject({ hour: 7, minute: 30, title: 'Today: Partly Cloudy', body: 'High 27°C, low 15°C. Rain 20%. UV 7: wear sunscreen.' });
    expect(forecasts[1].body).toBe('High 22°C, low 12°C. Rain 10%. UV 3.');
  });

  it('warns a little before the UV gets high, and not on a low-UV day', () => {
    const out = plan({ days: [day(TODAY, { uvMax: 9 }), day(TOMORROW, { uvMax: 4 })], hours: [...hours(TODAY, (h) => ({ uv: h >= 11 && h <= 15 ? 8 : 2 })), ...hours(TOMORROW)] });
    const uv = out.filter((a) => a.kind === 'uv');
    expect(uv).toHaveLength(1);
    expect(uv[0]).toMatchObject({ date: TODAY, hour: 10, minute: 30, title: 'Very High UV Today', body: 'UV reaches 9 around 11:00. Wear sunscreen and a hat when you head out.' });
  });

  it('says an hour before likely rain in the waking day, but not for rain at night', () => {
    const wet = (h: number) => (h === 3 || h === 15 ? { precipChance: 80, precip: 2 } : {});
    const out = plan({ days: [day(TODAY), day(TOMORROW)], hours: [...hours(TODAY, wet), ...hours(TOMORROW)] });
    const rain = out.filter((a) => a.kind === 'rain');
    expect(rain).toHaveLength(1);
    expect(rain[0]).toMatchObject({ date: TODAY, hour: 14, minute: 0, body: 'Rain is likely from about 15:00. A good time to get your walk in first.' });
  });

  it('gives a heads-up the evening before storms, snow, heat or cold', () => {
    const out = plan({ days: [day(TODAY), day(TOMORROW, { code: 95 }), day(DAY_AFTER, { feelsMax: 36 })], hours: [...hours(TODAY), ...hours(TOMORROW)] });
    expect(out.filter((a) => a.kind === 'storm')).toMatchObject([{ date: TODAY, hour: 19, title: 'Storms Tomorrow' }]);
    expect(out.filter((a) => a.kind === 'heat')).toMatchObject([{ date: TOMORROW, hour: 19, body: 'Tomorrow feels like 36°C. Walk early or late, and bring water.' }]);
    const cold = plan({ days: [day(TODAY), day(TOMORROW, { feelsMax: -3 })], hours: [] });
    expect(cold.filter((a) => a.kind === 'cold')).toMatchObject([{ date: TODAY, title: 'Cold Day Tomorrow' }]);
  });

  it('leaves out what has already gone by today, and each kind that is turned off', () => {
    const forecast = { days: [day(TODAY, { uvMax: 7 }), day(TOMORROW)], hours: [...hours(TODAY, (h) => ({ uv: h >= 12 ? 7 : 1 })), ...hours(TOMORROW)] };
    const noon = new Date(2026, 6, 1, 12, 0);
    const out = plan(forecast, { ...DEFAULT_WEATHER_ALERTS, enabled: true }, noon);
    // Today's 7:30 forecast and 11:30 UV warning have passed; tomorrow's forecast is still ahead.
    expect(out.map((a) => `${a.date} ${a.kind}`)).toEqual([`${TOMORROW} forecast`]);
    expect(plan(forecast, { ...DEFAULT_WEATHER_ALERTS, enabled: true, forecast: false, uv: false })).toEqual([]);
  });

  it('names the weather in a word', () => {
    expect([0, 2, 3, 45, 61, 73, 95, null].map((c) => weatherWord(c, fill))).toEqual(['Sunny', 'Partly Cloudy', 'Cloudy', 'Foggy', 'Rainy', 'Snowy', 'Stormy', 'Mixed']);
  });
});
