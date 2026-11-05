import type { DayEntry, LevelOverride, Overrides, SeasonRate } from '@/engine/types';

/**
 * The web version's storage (the iPhone web app): the same functions as db.ts, kept in the
 * browser's local storage. SQLite in the browser needs headers GitHub Pages can't send, and the
 * data here is small. Safari keeps a home-screen web app's storage for as long as it's installed.
 */
const PREFIX = 'bloom-planner:';
const K = { entries: `${PREFIX}entries`, overrides: `${PREFIX}overrides`, seasons: `${PREFIX}seasons`, kv: (key: string) => `${PREFIX}kv:${key}` };

// Ask the browser to keep this data rather than clear it under storage pressure.
try {
  void navigator.storage?.persist?.();
} catch {
  // Not available: storage still works, just without the extra promise.
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── key/value (profile, settings, location, climate cache, downloaded level data) ───
export async function kvGet<T>(key: string): Promise<T | null> {
  return read<T | null>(K.kv(key), null);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  write(K.kv(key), value);
}

export async function kvDelete(key: string): Promise<void> {
  localStorage.removeItem(K.kv(key));
}

// ─── the log ───
export async function getEntries(): Promise<DayEntry[]> {
  const all = read<Record<string, DayEntry>>(K.entries, {});
  return Object.values(all).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function upsertEntry(e: DayEntry): Promise<void> {
  const all = read<Record<string, DayEntry>>(K.entries, {});
  all[e.date] = { ...e, steps: Math.round(e.steps), flowers: Math.round(e.flowers) };
  write(K.entries, all);
}

export async function deleteEntry(date: string): Promise<void> {
  const all = read<Record<string, DayEntry>>(K.entries, {});
  delete all[date];
  write(K.entries, all);
}

// ─── level overrides (never touch the bundled JSON) ───
export async function getOverrides(): Promise<Overrides> {
  return read<Overrides>(K.overrides, {});
}

export async function upsertOverride(o: LevelOverride): Promise<void> {
  const all = read<Overrides>(K.overrides, {});
  all[o.level] = o;
  write(K.overrides, all);
}

export async function deleteOverride(level: number): Promise<void> {
  const all = read<Overrides>(K.overrides, {});
  delete all[level];
  write(K.overrides, all);
}

// ─── seasons ───
export async function getSeasonRates(): Promise<SeasonRate[]> {
  return read<SeasonRate[]>(K.seasons, []).sort((a, b) => a.month - b.month);
}

export async function setSeasonRates(rates: SeasonRate[]): Promise<void> {
  write(K.seasons, rates);
}

export async function wipeEverything(): Promise<void> {
  for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
}
