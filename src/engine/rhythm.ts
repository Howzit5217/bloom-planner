// The week's rhythm: not every day asks for the same. Easy days ask for a good deal less, the other
// days a little more to make up for them, and every day wobbles a little by its date, so no two days
// in a row are quite the same. Over a week it comes to what an even plan would ask.

/** Days of the week: 0 is Sunday, as Date.getDay() counts them. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RhythmPrefs {
  /** Vary the days at all; off, every day of the plan asks for the same. */
  vary: boolean;
  /** The week's easy days. */
  easyDays: Weekday[];
}

/** Wednesday and Sunday: a breather mid-week and one at the weekend. */
export const DEFAULT_RHYTHM: RhythmPrefs = { vary: true, easyDays: [0, 3] };

/** An easy day asks for this share of an ordinary one. */
export const EASY_SHARE = 0.6;
/** How far a day may wobble either way from its share, by its date. */
const WOBBLE = 0.07;

/** A steady 0..1 from a date: the same date always gives the same. */
function dateNoise(d: Date): number {
  let h = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** How much of an even day the plan asks of this date, from the week's rhythm; undefined when it doesn't vary. */
export function makeRhythm(prefs: RhythmPrefs | null | undefined): ((d: Date) => number) | undefined {
  const p = prefs ?? DEFAULT_RHYTHM;
  if (!p.vary) return undefined;
  const easy = new Set<number>(p.easyDays.filter((d) => d >= 0 && d <= 6));
  // Every day easy is the same as none: an even week, wobbling.
  const varied = easy.size > 0 && easy.size < 7;
  const full = varied ? (7 - easy.size * EASY_SHARE) / (7 - easy.size) : 1;
  return (d: Date) => {
    const share = varied ? (easy.has(d.getDay()) ? EASY_SHARE : full) : 1;
    return share * (1 + (dateNoise(d) - 0.5) * 2 * WOBBLE);
  };
}

/** Whether a date is one of the week's easy days. */
export const isEasyDay = (prefs: RhythmPrefs | null | undefined, d: Date) => {
  const p = prefs ?? DEFAULT_RHYTHM;
  return p.vary && p.easyDays.length < 7 && p.easyDays.includes(d.getDay() as Weekday);
};
