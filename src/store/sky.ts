import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { defaultSunTimes, skyLook, solarDay, sunTimes, weatherFromCode, type SkyLook } from '@/engine/sky';
import { fetchCurrentWeather } from '@/services/climateApi';
import * as db from '@/storage/db';
import { useApp } from './app';

/** The last weather fetched for the play location. */
interface Weather {
  code: number;
  cloudCover: number | null;
  at: number;
  latitude: number;
  longitude: number;
}

const FRESH = 30 * 60_000;
/** Older than this, the weather is a guess: the sky goes back to clear. */
const STALE = 3 * 3600_000;

interface WeatherState {
  weather: Weather | null;
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useWeather = create<WeatherState>((set, get) => ({
  weather: null,
  loaded: false,
  refresh: async () => {
    if (!get().loaded) {
      const saved = await db.kvGet<Weather>('weather').catch(() => null);
      set({ weather: saved ?? get().weather, loaded: true });
    }
    const loc = useApp.getState().location;
    if (!loc) return;
    const w = get().weather;
    const same = w && Math.abs(w.latitude - loc.latitude) < 0.05 && Math.abs(w.longitude - loc.longitude) < 0.05;
    if (w && same && Date.now() - w.at < FRESH) return;
    try {
      const cur = await fetchCurrentWeather(loc.latitude, loc.longitude);
      const next: Weather = { ...cur, at: Date.now(), latitude: loc.latitude, longitude: loc.longitude };
      set({ weather: next });
      await db.kvSet('weather', next).catch(() => {});
    } catch {
      // Offline or the service is down: keep what we have; it goes clear once it's stale.
    }
  },
}));

/**
 * The sky right now: the time of day at the play location (sunrise and sunset worked out on the
 * device) and its current weather. Without a location, the default day (6:30 to 18:30) and a
 * clear sky. Looks again every five minutes and whenever the app comes back.
 */
export function useSkyLook(): SkyLook {
  const location = useApp((s) => s.location);
  const weather = useWeather((s) => s.weather);
  const refresh = useWeather((s) => s.refresh);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    void refresh();
    const tick = () => {
      setNow(Date.now());
      void refresh();
    };
    const id = setInterval(tick, 5 * 60_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refresh, location]);
  return useMemo(() => {
    const date = new Date(now);
    // The play location's own date, which can differ from the phone's near midnight.
    const sun = location ? sunTimes(location.latitude, location.longitude, solarDay(now, location.longitude)) : defaultSunTimes(date);
    const live = location && weather && now - weather.at < STALE && Math.abs(weather.latitude - location.latitude) < 0.05 ? weatherFromCode(weather.code, weather.cloudCover) : 'clear';
    // The seasons (the sun's path, the ground's colours) are the play location's, or a mid-northern place's.
    return skyLook(now, sun, live, location?.latitude);
  }, [now, location, weather]);
}
