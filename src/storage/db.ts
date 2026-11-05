import * as SQLite from 'expo-sqlite';
import type { DayEntry, LevelOverride, Overrides, SeasonRate } from '@/engine/types';

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS day_entries (
     date TEXT PRIMARY KEY NOT NULL,
     steps INTEGER NOT NULL,
     flowers INTEGER NOT NULL,
     leveled_up INTEGER NOT NULL DEFAULT 0,
     new_level INTEGER,
     note TEXT,
     minutes_out INTEGER,
     out_mode TEXT,
     game_steps_to_go INTEGER,
     game_flowers_to_go INTEGER,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS level_overrides (
     level INTEGER PRIMARY KEY NOT NULL,
     steps INTEGER,
     flowers INTEGER,
     recorded_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS season_rates (
     month INTEGER PRIMARY KEY NOT NULL,
     rideable REAL NOT NULL,
     source TEXT NOT NULL,
     sample_days INTEGER
   );`,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('bloom-planner.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[i]);
      await db.execAsync(`PRAGMA user_version = ${i + 1}`);
    });
  }
  return db;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open().catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

// ─── key/value (profile, settings, location, climate cache, downloaded level data) ───
export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

export async function kvDelete(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM kv WHERE key = ?', key);
}

// ─── the log ───
interface EntryRow {
  date: string;
  steps: number;
  flowers: number;
  leveled_up: number;
  new_level: number | null;
  note: string | null;
  minutes_out: number | null;
  out_mode: string | null;
  game_steps_to_go: number | null;
  game_flowers_to_go: number | null;
}

const toEntry = (r: EntryRow): DayEntry => ({
  date: r.date,
  steps: r.steps,
  flowers: r.flowers,
  leveledUp: !!r.leveled_up,
  newLevel: r.new_level,
  note: r.note,
  minutesOut: r.minutes_out,
  outMode: r.out_mode === 'bike' || r.out_mode === 'walk' ? r.out_mode : null,
  gameStepsToGo: r.game_steps_to_go,
  gameFlowersToGo: r.game_flowers_to_go,
});

export async function getEntries(): Promise<DayEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow>('SELECT * FROM day_entries ORDER BY date ASC');
  return rows.map(toEntry);
}

export async function upsertEntry(e: DayEntry): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO day_entries (date, steps, flowers, leveled_up, new_level, note, minutes_out, out_mode, game_steps_to_go, game_flowers_to_go, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET steps = excluded.steps, flowers = excluded.flowers, leveled_up = excluded.leveled_up,
       new_level = excluded.new_level, note = excluded.note, minutes_out = excluded.minutes_out, out_mode = excluded.out_mode,
       game_steps_to_go = excluded.game_steps_to_go, game_flowers_to_go = excluded.game_flowers_to_go, updated_at = excluded.updated_at`,
    e.date,
    Math.round(e.steps),
    Math.round(e.flowers),
    e.leveledUp ? 1 : 0,
    e.newLevel,
    e.note,
    e.minutesOut,
    e.outMode,
    e.gameStepsToGo,
    e.gameFlowersToGo,
    new Date().toISOString(),
  );
}

export async function deleteEntry(date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM day_entries WHERE date = ?', date);
}

// ─── level overrides (never touch the bundled JSON) ───
export async function getOverrides(): Promise<Overrides> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ level: number; steps: number | null; flowers: number | null; recorded_at: string }>('SELECT * FROM level_overrides');
  const out: Overrides = {};
  for (const r of rows) out[r.level] = { level: r.level, steps: r.steps, flowers: r.flowers, recordedAt: r.recorded_at };
  return out;
}

export async function upsertOverride(o: LevelOverride): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO level_overrides (level, steps, flowers, recorded_at) VALUES (?, ?, ?, ?) ON CONFLICT(level) DO UPDATE SET steps = excluded.steps, flowers = excluded.flowers, recorded_at = excluded.recorded_at',
    o.level,
    o.steps,
    o.flowers,
    o.recordedAt,
  );
}

export async function deleteOverride(level: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM level_overrides WHERE level = ?', level);
}

// ─── seasons ───
export async function getSeasonRates(): Promise<SeasonRate[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ month: number; rideable: number; source: string; sample_days: number | null }>('SELECT * FROM season_rates ORDER BY month');
  return rows.map((r) => ({
    month: r.month,
    rideable: r.rideable,
    source: r.source === 'climate' || r.source === 'manual' ? r.source : 'default',
    sampleDays: r.sample_days ?? undefined,
  }));
}

export async function setSeasonRates(rates: SeasonRate[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM season_rates');
    for (const r of rates) {
      await db.runAsync('INSERT INTO season_rates (month, rideable, source, sample_days) VALUES (?, ?, ?, ?)', r.month, r.rideable, r.source, r.sampleDays ?? null);
    }
  });
}

export async function wipeEverything(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM kv');
    await db.runAsync('DELETE FROM day_entries');
    await db.runAsync('DELETE FROM level_overrides');
    await db.runAsync('DELETE FROM season_rates');
  });
}
