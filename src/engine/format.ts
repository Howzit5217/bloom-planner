import { format, type Locale } from 'date-fns';
import { de } from 'date-fns/locale/de';
import { es } from 'date-fns/locale/es';
import { fr } from 'date-fns/locale/fr';
import { it } from 'date-fns/locale/it';
import { ja } from 'date-fns/locale/ja';
import { ko } from 'date-fns/locale/ko';
import { ptBR } from 'date-fns/locale/pt-BR';
import { zhCN } from 'date-fns/locale/zh-CN';
import { zhTW } from 'date-fns/locale/zh-TW';
import { fromKey, type DayKey } from './dates';

/** The app's languages (see src/i18n). The engine keeps its own copy so it never imports the app. */
export type FormatLang = 'en' | 'es' | 'fr' | 'pt-BR' | 'de' | 'it' | 'ja' | 'ko' | 'zh-Hant' | 'zh-Hans';

interface Style {
  locale?: Locale;
  /** Thousands separator. */
  group: string;
  /** date-fns patterns. */
  date: string;
  longDay: string;
  longDate: string;
  short: string;
  monthYear: string;
  /** Durations: {m} minutes, {h} hours. */
  min: string;
  hour: string;
  hourMin: string;
  /** List joiner: ", " and the word before the last item. */
  and: string;
  /** Month names start lower case in these languages; capitalise them at the start of a title. */
  capitalise: boolean;
}

const NNBSP = ' ';

const STYLES: Record<FormatLang, Style> = {
  en: { group: ',', date: 'MMM d, yyyy', longDay: 'EEEE, MMMM d', longDate: 'EEEE, MMMM d, yyyy', short: 'MMM d', monthYear: 'LLLL yyyy', min: '{m} min', hour: '{h}h', hourMin: '{h}h {m}m', and: ' and ', capitalise: false },
  es: { locale: es, group: '.', date: 'd MMM yyyy', longDay: "EEEE, d 'de' MMMM", longDate: "EEEE, d 'de' MMMM 'de' yyyy", short: 'd MMM', monthYear: "LLLL 'de' yyyy", min: '{m} min', hour: '{h} h', hourMin: '{h} h {m} min', and: ' y ', capitalise: true },
  fr: { locale: fr, group: NNBSP, date: 'd MMM yyyy', longDay: 'EEEE d MMMM', longDate: 'EEEE d MMMM yyyy', short: 'd MMM', monthYear: 'LLLL yyyy', min: '{m} min', hour: '{h} h', hourMin: '{h} h {m}', and: ' et ', capitalise: true },
  'pt-BR': { locale: ptBR, group: '.', date: "d 'de' MMM 'de' yyyy", longDay: "EEEE, d 'de' MMMM", longDate: "EEEE, d 'de' MMMM 'de' yyyy", short: "d 'de' MMM", monthYear: "LLLL 'de' yyyy", min: '{m} min', hour: '{h} h', hourMin: '{h} h {m} min', and: ' e ', capitalise: true },
  de: { locale: de, group: '.', date: 'd. MMM yyyy', longDay: 'EEEE, d. MMMM', longDate: 'EEEE, d. MMMM yyyy', short: 'd. MMM', monthYear: 'LLLL yyyy', min: '{m} Min.', hour: '{h} Std.', hourMin: '{h} Std. {m} Min.', and: ' und ', capitalise: false },
  it: { locale: it, group: '.', date: 'd MMM yyyy', longDay: 'EEEE d MMMM', longDate: 'EEEE d MMMM yyyy', short: 'd MMM', monthYear: 'LLLL yyyy', min: '{m} min', hour: '{h} h', hourMin: '{h} h {m} min', and: ' e ', capitalise: true },
  ja: { locale: ja, group: ',', date: 'yyyy年M月d日', longDay: 'M月d日 EEEE', longDate: 'yyyy年M月d日 EEEE', short: 'M月d日', monthYear: 'yyyy年M月', min: '{m}分', hour: '{h}時間', hourMin: '{h}時間{m}分', and: '、', capitalise: false },
  ko: { locale: ko, group: ',', date: 'yyyy년 M월 d일', longDay: 'M월 d일 EEEE', longDate: 'yyyy년 M월 d일 EEEE', short: 'M월 d일', monthYear: 'yyyy년 M월', min: '{m}분', hour: '{h}시간', hourMin: '{h}시간 {m}분', and: ', ', capitalise: false },
  'zh-Hant': { locale: zhTW, group: ',', date: 'yyyy年M月d日', longDay: 'M月d日 EEEE', longDate: 'yyyy年M月d日 EEEE', short: 'M月d日', monthYear: 'yyyy年M月', min: '{m} 分鐘', hour: '{h} 小時', hourMin: '{h} 小時 {m} 分', and: '、', capitalise: false },
  'zh-Hans': { locale: zhCN, group: ',', date: 'yyyy年M月d日', longDay: 'M月d日 EEEE', longDate: 'yyyy年M月d日 EEEE', short: 'M月d日', monthYear: 'yyyy年M月', min: '{m} 分钟', hour: '{h} 小时', hourMin: '{h} 小时 {m} 分', and: '、', capitalise: false },
};

let lang: FormatLang = 'en';
let style: Style = STYLES.en;

/** Set by the app when its language changes. */
export function setFormatLang(l: FormatLang) {
  lang = l;
  style = STYLES[l];
}
export const formatLang = () => lang;

const opts = () => (style.locale ? { locale: style.locale } : undefined);
const cap = (s: string) => (style.capitalise && s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

/** 479200 -> "479,200" (or "479.200", "479 200"...). Grouping is done by hand, independent of device Intl support. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const r = Math.round(n);
  const s = Math.abs(r).toString().replace(/\B(?=(\d{3})+(?!\d))/g, style.group);
  return r < 0 ? `-${s}` : s;
}

/** 8.06 -> "8.1" (or "8,1"), with the language's decimal mark. */
export function fmtDec(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  const s = n.toFixed(digits);
  return style.group === ',' ? s : s.replace('.', ',');
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
  const f = (tpl: string, hh: number, mm: number) => tpl.replace('{h}', String(hh)).replace('{m}', String(mm));
  if (mins < 60) return f(style.min, 0, mins);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return mm === 0 ? f(style.hour, hh, 0) : f(style.hourMin, hh, mm);
}

/** "14 Feb 2028" */
export const fmtDate = (k: DayKey) => format(fromKey(k), style.date, opts());
/** "Wednesday, November 4" */
export const fmtLongDay = (k: DayKey) => cap(format(fromKey(k), style.longDay, opts()));
/** "Wednesday, November 4, 2026" */
export const fmtLongDate = (k: DayKey) => cap(format(fromKey(k), style.longDate, opts()));
/** "Nov 16" */
export const fmtShort = (k: DayKey) => format(fromKey(k), style.short, opts());
/** "Mon" */
export const fmtWeekday = (k: DayKey) => cap(format(fromKey(k), 'EEE', opts()));
/** "November 2026", as a title. */
export const fmtMonthYear = (year: number, month: number) => cap(format(new Date(year, month, 1), style.monthYear, opts()));

/** English month names, for the engine's own use (tests, CSV). The screens use monthName(). */
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Month 0-11, in the app's language: "January", "enero", "1月"... */
export const monthName = (m: number) => cap(format(new Date(2020, m, 1), 'LLLL', opts()));
/** Month 0-11, short: "Jan", "ene", "1月"... */
export const monthShort = (m: number) => cap(format(new Date(2020, m, 1), 'LLL', opts()).replace(/\.$/, ''));
/** Month 0-11, as narrow as it gets: "J", "E", "1"... */
export const monthNarrow = (m: number) => cap(format(new Date(2020, m, 1), 'LLLLL', opts()));
/**
 * A chart's month label for a column this wide, at the charts' 10.5pt: the short name where every
 * month's fits, the narrow one where some wouldn't (never cut off). Wide characters count nearly double.
 */
export function monthLabel(m: number, columnWidth: number): string {
  const width = (s: string) => Array.from(s).reduce((n, ch) => n + (/[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 11 : 6.4), 0);
  const fits = Array.from({ length: 12 }, (_, i) => width(monthShort(i))).every((w) => w <= columnWidth - 2);
  return fits ? monthShort(m) : monthNarrow(m);
}
/** Weekday 0-6 (Sunday first), short: "Sun", "dom", "日"... */
export const weekdayShort = (d: number) => cap(format(new Date(2020, 10, 1 + d), 'EEE', opts()).replace(/\.$/, ''));
/** Weekday 0-6 (Sunday first), narrow: "S", "D", "日"... */
export const weekdayNarrow = (d: number) => cap(format(new Date(2020, 10, 1 + d), 'EEEEE', opts()));
/** Weekday 0-6 (Sunday first), in full, for screen readers. */
export const weekdayName = (d: number) => cap(format(new Date(2020, 10, 1 + d), 'EEEE', opts()));

/** Join with commas and the language's "and": ["June","July","September"] -> "June, July and September". */
export function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  if (style.and === '、' || style.and === ', ') return xs.join(style.and);
  return `${xs.slice(0, -1).join(', ')}${style.and}${xs[xs.length - 1]}`;
}
