import { addDays, differenceInCalendarDays, format, getMonth, isValid, parse } from 'date-fns';

/** Day keys are local calendar dates, yyyy-MM-dd. All maths goes through date-fns in local time. */
export type DayKey = string;

export const toKey = (d: Date): DayKey => format(d, 'yyyy-MM-dd');

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
