import { addDaysKey, type DayKey } from './dates';
import type { DayEntry } from './types';

/** Consecutive logged days ending today, or ending yesterday when today isn't logged yet. */
export function streak(entries: DayEntry[], today: DayKey): number {
  const dates = new Set(entries.map((e) => e.date));
  let d = dates.has(today) ? today : addDaysKey(today, -1);
  let n = 0;
  while (dates.has(d)) {
    n++;
    d = addDaysKey(d, -1);
  }
  return n;
}

/** The last `count` days ending today, oldest first, with whether each was logged. */
export function recentDays(entries: DayEntry[], today: DayKey, count: number): Array<{ date: DayKey; logged: boolean }> {
  const dates = new Set(entries.map((e) => e.date));
  const out: Array<{ date: DayKey; logged: boolean }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = addDaysKey(today, -i);
    out.push({ date, logged: dates.has(date) });
  }
  return out;
}
