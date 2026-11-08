import { create } from 'zustand';
import type { ForecastWeatherDay } from '@/engine/weatherPlan';
import { fetchPlanForecast } from '@/services/climateApi';
import * as db from '@/storage/db';

/** The next 16 days at the play location, for the plan. Kept on the phone so it works offline too. */
interface Saved {
  days: ForecastWeatherDay[];
  at: number;
  latitude: number;
  longitude: number;
}

/** Fetched again after this long. */
const FRESH = 3 * 3600_000;
/** An older forecast is no help: the plan goes back to the usual weather for each month. */
const STALE = 2 * 24 * 3600_000;

interface ForecastState {
  days: ForecastWeatherDay[] | null;
  saved: Saved | null;
  loaded: boolean;
  refresh: (place: { latitude: number; longitude: number; timezone: string } | null) => Promise<void>;
}

/** Counts the forecasts asked for, so only the latest one's answer is kept. */
let asked = 0;

const near = (s: Saved | null, p: { latitude: number; longitude: number }) => !!s && Math.abs(s.latitude - p.latitude) < 0.05 && Math.abs(s.longitude - p.longitude) < 0.05;

export const useForecast = create<ForecastState>((set, get) => ({
  days: null,
  saved: null,
  loaded: false,
  refresh: async (place) => {
    if (!get().loaded) {
      const saved = await db.kvGet<Saved>('forecast').catch(() => null);
      set({ loaded: true, saved });
    }
    const ask = ++asked;
    if (!place) {
      set({ days: null });
      return;
    }
    const saved = get().saved;
    const usable = near(saved, place) && Date.now() - saved!.at < STALE;
    set({ days: usable ? saved!.days : null });
    if (usable && Date.now() - saved!.at < FRESH) return;
    try {
      const days = await fetchPlanForecast(place.latitude, place.longitude, place.timezone);
      // A newer ask (the place moved meanwhile) wins, even if this answer came back last.
      if (ask !== asked) return;
      const next: Saved = { days, at: Date.now(), latitude: place.latitude, longitude: place.longitude };
      set({ days, saved: next });
      await db.kvSet('forecast', next).catch(() => {});
    } catch {
      // Offline or the service is down: the months' usual weather stands in.
    }
  },
}));
