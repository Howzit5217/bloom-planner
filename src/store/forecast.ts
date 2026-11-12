import { create } from 'zustand';
import { todayKey } from '@/engine/dates';
import type { ForecastWeatherDay } from '@/engine/weatherPlan';
import { fetchPlanForecast } from '@/services/climateApi';
import * as db from '@/storage/db';

/** The next 16 days at the play location, for the plan. Kept on the phone so it works offline too. */
export interface SavedForecast {
  days: ForecastWeatherDay[];
  at: number;
  latitude: number;
  longitude: number;
}

/** An older forecast is no help: the plan goes back to the usual weather for each month. */
const STALE = 2 * 24 * 3600_000;

type Place = { latitude: number; longitude: number };

interface ForecastState {
  days: ForecastWeatherDay[] | null;
  saved: SavedForecast | null;
  loaded: boolean;
  /** The saved forecast, read at startup with the rest of the app's data, so the first plan shown already follows it. */
  seed: (saved: SavedForecast | null, place: Place | null) => void;
  refresh: (place: { latitude: number; longitude: number; timezone: string } | null) => Promise<void>;
}

/** Counts the forecasts asked for, so only the latest one's answer is kept. */
let asked = 0;

const near = (s: SavedForecast | null, p: Place) => !!s && Math.abs(s.latitude - p.latitude) < 0.05 && Math.abs(s.longitude - p.longitude) < 0.05;
const usable = (s: SavedForecast | null, p: Place | null): s is SavedForecast => !!p && near(s, p) && Date.now() - s!.at < STALE;

/**
 * The forecast the plan follows. It's fetched once a day (and again when the play place moves):
 * the day's first forecast stays until tomorrow, so Today's target holds still all day. A fresh one
 * every few hours moved it, by thousands of steps when a day's chance of rain crossed a half (a day
 * to ride, then not). Until the day's is in, the last one saved stands in.
 */
export const useForecast = create<ForecastState>((set, get) => ({
  days: null,
  saved: null,
  loaded: false,
  seed: (saved, place) => set({ loaded: true, saved, days: usable(saved, place) ? saved.days : null }),
  refresh: async (place) => {
    if (!get().loaded) {
      const saved = await db.kvGet<SavedForecast>('forecast').catch(() => null);
      set({ loaded: true, saved });
    }
    const ask = ++asked;
    if (!place) {
      set({ days: null });
      return;
    }
    const saved = get().saved;
    const days = usable(saved, place) ? saved.days : null;
    if (get().days !== days) set({ days });
    // Today's forecast is in: the plan keeps to it until tomorrow.
    if (days && todayKey(new Date(saved!.at)) === todayKey()) return;
    try {
      const fetched = await fetchPlanForecast(place.latitude, place.longitude, place.timezone);
      // A newer ask (the place moved meanwhile) wins, even if this answer came back last.
      if (ask !== asked) return;
      const next: SavedForecast = { days: fetched, at: Date.now(), latitude: place.latitude, longitude: place.longitude };
      set({ days: fetched, saved: next });
      await db.kvSet('forecast', next).catch(() => {});
    } catch {
      // Offline or the service is down: the last forecast (or the months' usual weather) stands in.
    }
  },
}));
