import { toKey, type DayKey } from './dates';

/** A month to show: year and month 0-11. */
export interface YearMonth {
  year: number;
  month: number;
}

export const ymOf = (d: Date): YearMonth => ({ year: d.getFullYear(), month: d.getMonth() });
export const ymIndex = (m: YearMonth) => m.year * 12 + m.month;
export const ymFromIndex = (i: number): YearMonth => ({ year: Math.floor(i / 12), month: ((i % 12) + 12) % 12 });
export const addMonths = (m: YearMonth, n: number) => ymFromIndex(ymIndex(m) + n);

/**
 * The day grid for a month: whole weeks, null for the blanks before the 1st and after the last day.
 * weekStartsOn: 0 = Sunday, 1 = Monday.
 */
export function monthGrid(m: YearMonth, weekStartsOn: 0 | 1): Array<Array<DayKey | null>> {
  const first = new Date(m.year, m.month, 1);
  const days = new Date(m.year, m.month + 1, 0).getDate();
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const cells: Array<DayKey | null> = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(toKey(new Date(m.year, m.month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<DayKey | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Column headings in grid order: initials, and full names for screen readers. */
export function weekdayHeadings(weekStartsOn: 0 | 1): Array<{ short: string; name: string }> {
  return Array.from({ length: 7 }, (_, i) => {
    const d = (i + weekStartsOn) % 7;
    return { short: WEEKDAYS[d], name: WEEKDAY_NAMES[d] };
  });
}

// Regions whose calendars start on Sunday (CLDR "firstDay": sun). Everywhere else gets Monday,
// except a few Saturday-first regions, which are close enough to Sunday for a 7-column grid.
const SUNDAY_FIRST = new Set([
  'US', 'CA', 'MX', 'BR', 'AR', 'CO', 'PE', 'VE', 'GT', 'HN', 'NI', 'PA', 'PR', 'DO', 'SV', 'BS', 'BZ', 'JM', 'TT',
  'JP', 'KR', 'KP', 'TW', 'HK', 'MO', 'PH', 'TH', 'KH', 'LA', 'MM', 'ID', 'IN', 'NP', 'BT', 'PK', 'BD',
  'IL', 'SA', 'YE', 'KE', 'ET', 'ZA', 'ZW', 'MZ', 'BW', 'UM', 'VI', 'GU', 'AS', 'MH', 'WS', 'PY',
  'AE', 'BH', 'DJ', 'DZ', 'EG', 'IQ', 'IR', 'JO', 'KW', 'LY', 'OM', 'QA', 'SD', 'SY', 'AF',
]);

/** Week start for a BCP 47 locale such as "en-US" or "de-DE". Unknown regions start on Monday. */
export function weekStartFor(locale: string | undefined): 0 | 1 {
  const region = locale?.match(/[-_]([A-Za-z]{2})(?:[-_]|$)/)?.[1]?.toUpperCase();
  if (!region) return locale?.toLowerCase().startsWith('en') ? 0 : 1;
  return SUNDAY_FIRST.has(region) ? 0 : 1;
}

/** Whether the phone's locale writes times with AM/PM, judged from how it formats 13:00. */
export function uses12HourClock(formatted1pm: string): boolean {
  return !/13/.test(formatted1pm);
}
