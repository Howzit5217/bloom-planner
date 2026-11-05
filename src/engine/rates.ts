import type { DayEntry, Rates, ResolvedRates } from './types';

/**
 * Typical rates, used until the user says otherwise. Steps come only from walking (the phone's
 * step counter); a bike ride plants flowers but earns no steps.
 */
export const DEFAULT_RATES = {
  walkStepsPerHour: 6000,
  bikeFlowersPerHour: 20000,
  walkFlowersPerHour: 6000,
} as const;

export type RateKey = keyof typeof DEFAULT_RATES;
export const RATE_KEYS: RateKey[] = ['walkStepsPerHour', 'bikeFlowersPerHour', 'walkFlowersPerHour'];

export function resolveRates(r: Rates): ResolvedRates {
  const bikes = r.bikes !== false;
  const estimated: RateKey[] = [];
  const pick = (k: RateKey, used = true) => {
    const v = r[k];
    if (v == null || !(v > 0)) {
      if (used) estimated.push(k);
      return DEFAULT_RATES[k];
    }
    return v;
  };
  return {
    walkStepsPerHour: pick('walkStepsPerHour'),
    // Without a bike the biking rate isn't used, so it's never one to nag about.
    bikeFlowersPerHour: pick('bikeFlowersPerHour', bikes),
    walkFlowersPerHour: pick('walkFlowersPerHour'),
    treadmillAvailable: r.treadmillAvailable,
    bikes,
    estimated,
  };
}

/**
 * The share of each month's days that can plant the plan's flowers. Riding needs fair weather;
 * walking plants flowers any day, so without a bike every day counts.
 */
export function flowerDays(seasonRates: number[], bikes: boolean): number[] {
  return bikes ? seasonRates : seasonRates.map(() => 1);
}

/** How fast the plan's flowers get planted: on the bike, or on foot without one. */
export function flowerRate(rates: Pick<ResolvedRates, 'bikes' | 'bikeFlowersPerHour' | 'walkFlowersPerHour'>): number {
  return rates.bikes ? rates.bikeFlowersPerHour : rates.walkFlowersPerHour;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface ObservedRates {
  loggedDays: number;
  medianSteps: number;
  medianFlowers: number;
  /** From days with "minutes out" logged. null until there are at least 3 such days. */
  bikeFlowersPerHour: number | null;
  walkFlowersPerHour: number | null;
  bikeSamples: number;
  walkSamples: number;
  /** Observed vs declared, as a ratio-1 (0.2 = 20% faster than you said). */
  bikeDrift: number | null;
  walkDrift: number | null;
  ready: boolean;
}

export const OBSERVED_MIN_DAYS = 7;

/** §7.7 What the log says about the user's real pace. Never applied automatically. */
export function observedRates(entries: DayEntry[], rates: ResolvedRates): ObservedRates {
  const steps = entries.map((e) => e.steps);
  const flowers = entries.map((e) => e.flowers);
  const perHour = (mode: 'bike' | 'walk') =>
    entries
      .filter((e) => e.outMode === mode && (e.minutesOut ?? 0) >= 10 && e.flowers > 0)
      .map((e) => e.flowers / ((e.minutesOut as number) / 60));
  const bike = perHour('bike');
  const walk = perHour('walk');
  const bikeFph = bike.length >= 3 ? Math.round(median(bike) / 100) * 100 : null;
  const walkFph = walk.length >= 3 ? Math.round(median(walk) / 100) * 100 : null;
  return {
    loggedDays: entries.length,
    medianSteps: Math.round(median(steps)),
    medianFlowers: Math.round(median(flowers)),
    bikeFlowersPerHour: bikeFph,
    walkFlowersPerHour: walkFph,
    bikeSamples: bike.length,
    walkSamples: walk.length,
    bikeDrift: bikeFph != null ? bikeFph / rates.bikeFlowersPerHour - 1 : null,
    walkDrift: walkFph != null ? walkFph / rates.walkFlowersPerHour - 1 : null,
    ready: entries.length >= OBSERVED_MIN_DAYS,
  };
}
