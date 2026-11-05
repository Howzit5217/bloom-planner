import { RATE_MAX, RATE_MIN, rideableDaysInMonth, type MonthClimate, type Reason } from '@/engine/climate';
import { fmtDec, listJoin, monthName } from '@/engine/format';
import { t, tk } from './core';

const REASONS: Record<Reason, string> = {
  snow: tk('snow'),
  rain: tk('rain'),
  cold: tk('cold'),
  heat: tk('heat'),
  wind: tk('wind'),
  dark: tk('short daylight'),
};

/** "January: 8.1 rideable days. Blocked by snow on 31% of days, cold on 44% and short daylight on 18%." */
export function explainMonthText(m: MonthClimate): string {
  const parts = (Object.keys(m.blockedShare) as Reason[])
    .filter((r) => m.blockedShare[r] >= 0.01)
    .sort((a, b) => m.blockedShare[b] - m.blockedShare[a])
    .map((r, i) => {
      const p = { reason: t(REASONS[r]), pct: Math.round(m.blockedShare[r] * 100) };
      return i === 0 ? t('{reason} on {pct}% of days', p) : t('{reason} on {pct}%', p);
    });
  const head = t('{month}: {days} rideable days', { month: monthName(m.month - 1), days: fmtDec(rideableDaysInMonth(m.month, m.rate)) });
  const clamp = m.rawRate !== m.rate ? ` ${t('(kept between {min}% and {max}%)', { min: RATE_MIN * 100, max: RATE_MAX * 100 })}` : '';
  const tail = parts.length ? t('Blocked by {reasons}.', { reasons: listJoin(parts) }) : t('Nothing in the record blocks it.');
  return `${head}${clamp}. ${tail}`;
}

/** "June, July and September" in the app's language, from month numbers 1-12. */
export const monthList = (months: number[]) => listJoin(months.map((m) => monthName(m - 1)));
