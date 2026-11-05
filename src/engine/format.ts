import { format } from 'date-fns';
import { fromKey, type DayKey } from './dates';

/** 479200 -> "479,200" (fixed en-style grouping, independent of device Intl support). */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const r = Math.round(n);
  const s = Math.abs(r).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return r < 0 ? `-${s}` : s;
}

/** Round to a friendly precision for targets: 23,412 -> 23,400. */
export function roundNice(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 100) return Math.ceil(n);
  if (n < 1000) return Math.ceil(n / 10) * 10;
  return Math.ceil(n / 100) * 100;
}

/** 1.4 -> "1h 24m", 0.63 -> "38 min", 0 -> "0 min". */
export function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return '—';
  const mins = Math.max(0, Math.round(h * 60));
  if (mins < 60) return `${mins} min`;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return mm === 0 ? `${hh}h` : `${hh}h ${mm}m`;
}

/** "14 Feb 2028" */
export const fmtDate = (k: DayKey) => format(fromKey(k), 'd MMM yyyy');
/** "Wednesday, November 4" */
export const fmtLongDay = (k: DayKey) => format(fromKey(k), 'EEEE, MMMM d');
/** "Nov 16" */
export const fmtShort = (k: DayKey) => format(fromKey(k), 'MMM d');
/** "Mon" */
export const fmtWeekday = (k: DayKey) => format(fromKey(k), 'EEE');

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${Math.round(n) === 1 ? one : many}`;

/** Join with commas and "and": ["June","July","September"] -> "June, July and September". */
export function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
