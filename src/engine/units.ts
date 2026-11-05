// Temperatures, in the unit the player reads them in.

/** 'auto' follows the phone: °F where the region uses it (the US and a few others), °C elsewhere. */
export type TempUnit = 'auto' | 'c' | 'f';

/** Regions that read the weather in °F. */
const FAHRENHEIT = /-(US|PR|GU|VI|AS|MP|UM|BS|BZ|KY|PW|FM|MH|LR)$/i;

/** Whether the phone's region reads temperatures in °F. */
export function regionUsesF(locale?: string): boolean {
  try {
    return FAHRENHEIT.test(locale ?? Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return false;
  }
}

/** Whether to show °F, for the player's setting. */
export const usesF = (unit: TempUnit | null | undefined, locale?: string) => unit === 'f' || ((unit ?? 'auto') === 'auto' && regionUsesF(locale));

/** °C to °F. */
export const cToF = (c: number) => (c * 9) / 5 + 32;
/** °F to °C. */
export const fToC = (f: number) => ((f - 32) * 5) / 9;

/** A whole-degree reading in the chosen unit: "35°C", "95°F". */
export const fmtTemp = (c: number, f: boolean) => `${Math.round(f ? cToF(c) : c)}°${f ? 'F' : 'C'}`;
