// Severe weather: days dangerous to be out walking or riding, by thresholds like the ones weather
// services warn at. On such a day the plan asks for very little (indoors, a fair amount still), the
// other days make up the difference, Home warns about it, and an alert comes the evening before.

export type SevereKind = 'hail' | 'thunderstorm' | 'wind' | 'snowstorm' | 'heat' | 'cold';

/** What a forecast day needs for this: its WMO code, snow (cm), gusts (km/h) and feels-like high (°C). */
export interface SevereInput {
  code: number | null;
  snow: number | null;
  gusts: number | null;
  feelsMax: number | null;
}

/** Gusts this strong (km/h, about 56 mph) do damage; a thunderstorm with gusts this strong (50 mph) is a severe one. */
export const DAMAGING_GUSTS = 90;
const STORM_GUSTS = 80;
/** Snow this deep in a day (cm, about 6 inches) is a snowstorm. */
export const SNOWSTORM_CM = 15;
/** A day feeling this hot (°C, about 106°F) or no warmer than this (°C, about 0°F) at its warmest is dangerous out. */
export const EXTREME_HEAT = 41;
export const EXTREME_COLD = -18;

/**
 * How much of a usual walking day a severe day keeps: with indoor walking a fair amount, without it
 * next to nothing (it isn't safe out). Flowers on foot or by bike: none (weatherPlan).
 */
export const severeShare = (indoor: boolean) => (indoor ? 0.6 : 0.08);

/** The severe weather a day brings, worst first; none for an ordinary bad day. */
export function severeOf(d: SevereInput): SevereKind[] {
  const out: SevereKind[] = [];
  const code = d.code ?? 0;
  const gusts = d.gusts ?? 0;
  // WMO 96 and 99 are thunderstorms with hail.
  if (code === 96 || code === 99) out.push('hail');
  else if (code >= 95 && gusts >= STORM_GUSTS) out.push('thunderstorm');
  if (gusts >= DAMAGING_GUSTS) out.push('wind');
  if ((d.snow ?? 0) >= SNOWSTORM_CM) out.push('snowstorm');
  if (d.feelsMax != null && d.feelsMax >= EXTREME_HEAT) out.push('heat');
  if (d.feelsMax != null && d.feelsMax <= EXTREME_COLD) out.push('cold');
  return out;
}

/** Severe weather's name, as a forecast says it: the start of a sentence. */
export function severeName(kind: SevereKind, t: (english: string) => string): string {
  if (kind === 'hail') return t('Thunderstorms with hail');
  if (kind === 'thunderstorm') return t('Severe thunderstorms');
  if (kind === 'wind') return t('Damaging winds');
  if (kind === 'snowstorm') return t('Heavy snow');
  if (kind === 'heat') return t('Extreme heat');
  return t('Extreme cold');
}
