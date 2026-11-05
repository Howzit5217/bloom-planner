/**
 * Translations. The app speaks the languages Pikmin Bloom does: English, Spanish, French,
 * Portuguese (Brazil), German, Italian, Japanese, Korean, Chinese (Traditional) and Chinese
 * (Simplified).
 *
 * Every string in the app is written in English and passed through t(); the English text is the
 * key. Each other language is a map from that English text to its translation. A test checks that
 * every language has every string, with the same {placeholders}.
 */
import { setFormatLang } from '@/engine/format';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { ptBR } from './pt-BR';
import { zhHans } from './zh-Hans';
import { zhHant } from './zh-Hant';

export type Lang = 'en' | 'es' | 'fr' | 'pt-BR' | 'de' | 'it' | 'ja' | 'ko' | 'zh-Hant' | 'zh-Hans';
export type LangPref = Lang | 'system';
export type Dict = Record<string, string>;

/** In the order the language picker lists them, each named in its own language. */
export const LANGS: Array<{ code: Lang; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh-Hant', name: '繁體中文' },
  { code: 'zh-Hans', name: '简体中文' },
];

export const DICTS: Record<Exclude<Lang, 'en'>, Dict> = { es, fr, 'pt-BR': ptBR, de, it, ja, ko, 'zh-Hant': zhHant, 'zh-Hans': zhHans };

/** The app language for a BCP 47 locale such as "pt-BR", "zh-Hant-TW" or "zh-CN". */
export function langFor(locale: string | undefined): Lang {
  const l = (locale ?? '').replace('_', '-').toLowerCase();
  if (l.startsWith('zh')) {
    if (/hant|-tw|-hk|-mo/.test(l)) return 'zh-Hant';
    return 'zh-Hans';
  }
  if (l.startsWith('pt')) return 'pt-BR';
  for (const code of ['es', 'fr', 'de', 'it', 'ja', 'ko'] as const) if (l.startsWith(code)) return code;
  return 'en';
}

export function deviceLang(): Lang {
  try {
    return langFor(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return 'en';
  }
}

let current: Lang = 'en';
const listeners = new Set<(l: Lang) => void>();

export const currentLang = () => current;

export function setLang(pref: LangPref) {
  const l = pref === 'system' ? deviceLang() : pref;
  if (l === current) return;
  current = l;
  setFormatLang(l);
  listeners.forEach((f) => f(l));
}

/** Called when the language changes (dates and numbers re-read it). */
export function onLangChange(f: (l: Lang) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

type Params = Record<string, string | number>;

function fill(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translate an English string. Placeholders like {level} are filled from params. */
export function t(english: string, params?: Params): string {
  const tpl = current === 'en' ? english : (DICTS[current][english] ?? english);
  return fill(tpl, params);
}

/** The plural category of n in a language: just "one" or "other", which is all these need. */
export function pluralOne(lang: Lang, n: number): boolean {
  if (lang === 'ja' || lang === 'ko' || lang === 'zh-Hant' || lang === 'zh-Hans') return false;
  if (lang === 'fr' || lang === 'pt-BR') return Math.abs(n) < 2;
  return Math.abs(n) === 1;
}

/** Marks an English string for translation without translating it yet (for lists defined at module level). */
export const tk = (english: string) => english;

/** Singular or plural English, translated: tn(3, '{n} day', '{n} days'). {n} is filled with n. */
export function tn(n: number, one: string, other: string, params?: Params): string {
  const english = pluralOne(current, n) ? one : other;
  // Languages without plurals translate the "other" form only.
  const key = current !== 'en' && !pluralOne(current, n) ? other : english;
  return t(key, { n, ...params });
}
