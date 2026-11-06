import { useMemo } from 'react';
import { create } from 'zustand';
import bundledJson from '@/data/bloom-levels.json';
import { PRESETS, seasonRatesFromClimate, walkRatesFromClimate, type ClimateCache } from '@/engine/climate';
import { DEFAULT_LIMITS, forecastWeights, walkFallback, type TempLimits } from '@/engine/weatherPlan';
import { useForecast } from './forecast';
import { todayKey, type DayKey } from '@/engine/dates';
import { makeReq, overridesKey, parseLevelTable } from '@/engine/levels';
import { replayLog } from '@/engine/progress';
import { DEFAULT_RHYTHM, easyDaysOf, makeRhythm, type RhythmPrefs } from '@/engine/rhythm';
import { computeDashboard, type Dashboard } from '@/engine/summary';
import { usesF, type TempUnit } from '@/engine/units';
import type { DayEntry, LevelTable, Overrides, PlayLocation, Profile, Rates, SeasonRate, ThresholdPreset } from '@/engine/types';
import * as db from '@/storage/db';
import type { LangPref } from '@/i18n';

export type ThemePref = 'system' | 'light' | 'dark';

export interface NotificationPrefs {
  enabled: boolean;
  hour: number;
  minute: number;
  nudges: boolean;
  behind: boolean;
  milestones: boolean;
  /** When we asked after the first log (so we ask once). */
  askedAt: string | null;
  lastBehindAlert: DayKey | null;
  nudgeDates: DayKey[];
  lastMilestoneLevel: number | null;
}

export interface AppUpdateInfo {
  version: string;
  url: string;
  apkUrl: string | null;
  notes: string;
}

/** How each day is logged: today's steps and flowers, or what the game shows still to go. */
export type LogMode = 'daily' | 'left';

export interface Settings {
  theme: ThemePref;
  logMode: LogMode;
  /** 'system' follows the phone's language. */
  language: LangPref;
  preset: ThresholdPreset;
  notifications: NotificationPrefs;
  dismissed: Record<string, boolean>;
  updates: { enabled: boolean; lastCheck: string | null; latest: AppUpdateInfo | null; dismissedVersion: string | null };
  /** Beta builds only: take new test builds (GitHub pre-releases) as well as releases. */
  dev: { betaUpdates: boolean };
  /** Too hot above, too cold below these feels-like highs (°C), for walking far and for riding. */
  limits: TempLimits;
  /** The week's rhythm: easy days, and whether the days vary at all. */
  plan: RhythmPrefs;
  /** How temperatures show: the phone's way, or °C or °F. */
  temp: TempUnit;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  logMode: 'daily',
  language: 'system',
  preset: 'normal',
  notifications: {
    enabled: false,
    hour: 20,
    minute: 30,
    nudges: true,
    behind: true,
    milestones: true,
    askedAt: null,
    lastBehindAlert: null,
    nudgeDates: [],
    lastMilestoneLevel: null,
  },
  dismissed: {},
  updates: { enabled: true, lastCheck: null, latest: null, dismissedVersion: null },
  dev: { betaUpdates: true },
  limits: DEFAULT_LIMITS,
  plan: DEFAULT_RHYTHM,
  temp: 'auto',
};

/**
 * The hot and cold limits from saved settings. Before there was one pair for walking and riding there
 * were two heat limits: the riding one (else the walking one) becomes the hot limit.
 */
function limitsFrom(saved: Partial<Settings> | null | undefined): TempLimits {
  if (saved?.limits) return { ...DEFAULT_LIMITS, ...saved.limits };
  const old = (saved as { heat?: { walk?: number | null; bike?: number | null } } | null | undefined)?.heat;
  return { hot: old?.bike ?? old?.walk ?? DEFAULT_LIMITS.hot, cold: DEFAULT_LIMITS.cold };
}

export const ALL_DAYS_RIDEABLE: SeasonRate[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, rideable: 1, source: 'default' as const }));

export const BUNDLED_TABLE: LevelTable = parseLevelTable(bundledJson);

export interface Celebration {
  level: number;
  goal: boolean;
  maxed: boolean;
}

export interface OnboardingResult {
  profile: Profile;
  seasonRates: SeasonRate[];
  location: PlayLocation | null;
  climate: ClimateCache | null;
}

interface AppState {
  ready: boolean;
  loadError: string | null;
  profile: Profile | null;
  entries: DayEntry[];
  /** Bumped on every log change, for memo keys. */
  entriesRev: number;
  /** Always empty: the app uses the game's own level numbers (level corrections are gone). */
  overrides: Overrides;
  seasonRates: SeasonRate[];
  location: PlayLocation | null;
  climate: ClimateCache | null;
  settings: Settings;
  table: LevelTable;
  today: DayKey;
  celebration: Celebration | null;

  hydrate: () => Promise<void>;
  refreshToday: () => void;
  completeOnboarding: (r: OnboardingResult) => Promise<void>;
  saveEntry: (e: DayEntry) => Promise<void>;
  deleteEntry: (date: DayKey) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  setRates: (rates: Rates) => Promise<void>;
  setSeasonRates: (rates: SeasonRate[]) => Promise<void>;
  setLocationAndClimate: (location: PlayLocation | null, climate: ClimateCache | null) => Promise<void>;
  setPreset: (preset: ThresholdPreset) => Promise<void>;
  setLimits: (limits: TempLimits) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  setRemoteTable: (json: unknown) => Promise<boolean>;
  dismissCelebration: () => void;
  resetEverything: () => Promise<void>;
}

function pickTable(remote: unknown): LevelTable {
  if (!remote) return BUNDLED_TABLE;
  try {
    const t = parseLevelTable(remote);
    return t.version > BUNDLED_TABLE.version && t.maxLevel >= BUNDLED_TABLE.maxLevel ? t : BUNDLED_TABLE;
  } catch {
    return BUNDLED_TABLE;
  }
}

const normaliseSeasons = (rates: SeasonRate[]): SeasonRate[] => (rates.length === 12 ? rates : ALL_DAYS_RIDEABLE);

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  loadError: null,
  profile: null,
  entries: [],
  entriesRev: 0,
  overrides: {},
  seasonRates: ALL_DAYS_RIDEABLE,
  location: null,
  climate: null,
  settings: DEFAULT_SETTINGS,
  table: BUNDLED_TABLE,
  today: todayKey(),
  celebration: null,

  hydrate: async () => {
    try {
      const [profile, entries, seasons, location, climate, settings, remote] = await Promise.all([
        db.kvGet<Profile>('profile'),
        db.getEntries(),
        db.getSeasonRates(),
        db.kvGet<PlayLocation>('location'),
        db.kvGet<ClimateCache>('climate'),
        db.kvGet<Settings>('settings'),
        db.kvGet<unknown>('remoteLevels'),
      ]);
      set({
        ready: true,
        loadError: null,
        profile,
        entries,
        entriesRev: get().entriesRev + 1,
        // Levels are always the game's own numbers: corrections are no longer part of the app, and
        // any saved before are left unused.
        overrides: {},
        seasonRates: normaliseSeasons(seasons),
        location,
        climate,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(settings ?? {}),
          notifications: { ...DEFAULT_SETTINGS.notifications, ...(settings?.notifications ?? {}) },
          updates: { ...DEFAULT_SETTINGS.updates, ...(settings?.updates ?? {}) },
          dev: { ...DEFAULT_SETTINGS.dev, ...(settings?.dev ?? {}) },
          limits: limitsFrom(settings),
          plan: (() => {
            // At most two easy days a week (a pick saved before the limit keeps its first two).
            const plan = { ...DEFAULT_SETTINGS.plan, ...(settings?.plan ?? {}) };
            return { ...plan, easyDays: easyDaysOf(plan) };
          })(),
          dismissed: settings?.dismissed ?? {},
        },
        table: pickTable(remote),
        today: todayKey(),
      });
    } catch (e) {
      set({ ready: true, loadError: e instanceof Error ? e.message : String(e) });
    }
  },

  refreshToday: () => {
    const k = todayKey();
    if (k !== get().today) set({ today: k });
  },

  completeOnboarding: async ({ profile, seasonRates, location, climate }) => {
    await db.kvSet('profile', profile);
    await db.setSeasonRates(seasonRates);
    if (location) await db.kvSet('location', location);
    if (climate) await db.kvSet('climate', climate);
    set({ profile, seasonRates: normaliseSeasons(seasonRates), location, climate, today: todayKey() });
  },

  saveEntry: async (e) => {
    const { profile, entries, table, overrides } = get();
    if (!profile) return;
    const req = makeReq(table, overrides);
    const before = replayLog(profile, entries, req, table.maxLevel).state.level;
    await db.upsertEntry(e);
    const next = [...entries.filter((x) => x.date !== e.date), e].sort((a, b) => (a.date < b.date ? -1 : 1));
    const after = replayLog(profile, next, req, table.maxLevel).state.level;
    set({
      entries: next,
      entriesRev: get().entriesRev + 1,
      celebration: after > before ? { level: after, goal: after >= profile.goalLevel && before < profile.goalLevel, maxed: after >= table.maxLevel } : null,
    });
  },

  deleteEntry: async (date) => {
    await db.deleteEntry(date);
    set({ entries: get().entries.filter((e) => e.date !== date), entriesRev: get().entriesRev + 1 });
  },

  updateProfile: async (patch) => {
    const p = get().profile;
    if (!p) return;
    const profile = { ...p, ...patch };
    // The screen changes at once and the save follows: saved first, a ruler being slid was handed
    // the value from before for a moment and slid back to it.
    set({ profile });
    await db.kvSet('profile', profile);
  },

  setRates: async (rates) => get().updateProfile({ rates }),

  setSeasonRates: async (rates) => {
    set({ seasonRates: normaliseSeasons(rates) });
    await db.setSeasonRates(rates);
  },

  setLocationAndClimate: async (location, climate) => {
    if (location) await db.kvSet('location', location);
    else await db.kvDelete('location');
    if (climate) await db.kvSet('climate', climate);
    else await db.kvDelete('climate');
    set({ location, climate });
    // A new place: its forecast now, not at the next start.
    void useForecast.getState().refresh(location);
    if (climate) await get().setSeasonRates(seasonRatesFromClimate(climate, get().settings.preset, get().settings.limits));
  },

  setLimits: async (limits) => {
    await get().updateSettings({ limits });
    const climate = get().climate;
    if (climate && get().seasonRates.every((r) => r.source === 'climate')) await get().setSeasonRates(seasonRatesFromClimate(climate, get().settings.preset, limits));
  },

  setPreset: async (preset) => {
    await get().updateSettings({ preset });
    const climate = get().climate;
    // Changing the preset re-derives from the stored histograms; manual edits are replaced only when they came from climate.
    if (climate && get().seasonRates.every((r) => r.source === 'climate')) await get().setSeasonRates(seasonRatesFromClimate(climate, preset, get().settings.limits));
  },

  updateSettings: async (patch) => {
    const settings = { ...get().settings, ...patch };
    // As with the profile: the screen first (and two changes close together both keep), then the save.
    set({ settings });
    await db.kvSet('settings', settings);
  },

  setRemoteTable: async (json) => {
    const t = pickTable(json);
    if (t === BUNDLED_TABLE || t.version <= get().table.version) return false;
    await db.kvSet('remoteLevels', json);
    set({ table: t });
    return true;
  },

  dismissCelebration: () => set({ celebration: null }),

  resetEverything: async () => {
    await db.wipeEverything();
    set({
      profile: null,
      entries: [],
      entriesRev: get().entriesRev + 1,
      overrides: {},
      seasonRates: ALL_DAYS_RIDEABLE,
      location: null,
      climate: null,
      settings: DEFAULT_SETTINGS,
      table: BUNDLED_TABLE,
      celebration: null,
    });
  },
}));

/** The one place the engine runs for the UI. Memoised on (profile, log revision, overrides, seasons, table, day). */
export function useDashboard(): Dashboard | null {
  const profile = useApp((s) => s.profile);
  const entries = useApp((s) => s.entries);
  const entriesRev = useApp((s) => s.entriesRev);
  const overrides = useApp((s) => s.overrides);
  const seasonRates = useApp((s) => s.seasonRates);
  const table = useApp((s) => s.table);
  const today = useApp((s) => s.today);
  const climate = useApp((s) => s.climate);
  const limits = useApp((s) => s.settings.limits);
  const preset = useApp((s) => s.settings.preset);
  const rhythmPrefs = useApp((s) => s.settings.plan);
  const forecast = useForecast((s) => s.days);
  const oKey = overridesKey(overrides);
  const sKey = seasonRates.map((r) => r.rideable.toFixed(4)).join(',');
  const pKey = profile ? JSON.stringify(profile) : '';
  const wKey = `${limits.hot}|${limits.cold}|${preset}|${rhythmPrefs.vary}|${rhythmPrefs.easyDays.join('')}|${climate?.sampleDays ?? 0}|${climate?.v ?? 1}|${forecast?.map((d) => d.date + (d.feelsMax ?? '') + (d.precip ?? '')).join(',') ?? ''}`;
  return useMemo(
    () => {
      if (!profile) return null;
      const indoor = profile.rates.treadmillAvailable;
      // The weather's say: walking days from the history, the next fortnight from the forecast.
      const walkRates = climate ? walkRatesFromClimate(climate, limits, walkFallback(indoor)) : undefined;
      const weights = forecast?.length ? forecastWeights(forecast, PRESETS[preset], limits, indoor, today) : null;
      return computeDashboard({ table, overrides, profile, entries, seasonRates: seasonRates.map((r) => r.rideable), today, walkRates, forecast: weights, rhythm: makeRhythm(rhythmPrefs) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pKey, entriesRev, oKey, sKey, table.version, today, wKey],
  );
}

/** Whether temperatures show in °F: the player's setting, or the phone's region. */
export function useTempF(): boolean {
  const unit = useApp((s) => s.settings.temp);
  return usesF(unit);
}
