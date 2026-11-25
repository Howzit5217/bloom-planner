import { addDays, differenceInCalendarDays, getMonth, isValid, parse } from 'date-fns';

/** Day keys are local calendar dates, yyyy-MM-dd. All maths goes through date-fns in local time. */
export type DayKey = string;

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/**
 * A date's day key. By hand rather than date-fns's format, which is slow for something done this
 * often; the same for any real date, and like it an invalid one is an error.
 */
export const toKey = (d: Date): DayKey => {
  const y = d.getFullYear();
  if (Number.isNaN(y)) throw new RangeError('Invalid time value');
  return `${y < 1000 ? String(y).padStart(4, '0') : y}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const fromKey = (k: DayKey): Date => parse(k, 'yyyy-MM-dd', new Date(2000, 0, 1));

export const isDayKey = (k: unknown): k is DayKey => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && isValid(fromKey(k));

export const addDaysKey = (k: DayKey, n: number): DayKey => toKey(addDays(fromKey(k), n));

/** Whole calendar days from a to b (b - a). */
export const daysBetween = (a: DayKey, b: DayKey): number => differenceInCalendarDays(fromKey(b), fromKey(a));

/** 0-11 */
export const monthIndex = (k: DayKey): number => getMonth(fromKey(k));

export const todayKey = (now: Date = new Date()): DayKey => toKey(now);

/** Milliseconds until the next local midnight (DST-safe via date-fns). */
export function msUntilMidnight(now: Date = new Date()): number {
  const next = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  return Math.max(1000, next.getTime() - now.getTime());
}
