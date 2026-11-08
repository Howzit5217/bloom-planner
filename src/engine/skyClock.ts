// The sky's run-through when the app comes back after a while: the times it shows on the way from
// how it was left to now, so the sun crosses the sky (and dusk turns to night) over a few seconds
// instead of the sky jumping.

/** Back after less than this, the sky simply fades on; longer, it runs through the time in between. */
export const LAPSE_FROM = 2 * 60_000;
/** It runs through at most this much (a whole night and day is no more to see than half of one). */
export const LAPSE_MOST = 12 * 3600_000;
/** How often the run-through moves on, at most, in milliseconds: the meadow blends from each sky to the next. */
export const LAPSE_STEP_MS = 140;
/** A change of sky outside a run-through (the clock's five-minute move, the weather) fades in this slowly. */
export const SKY_FADE_MS = 1500;
/** The shortest run and the longest. */
const RUN_LEAST_MS = 2000;
const RUN_MOST_MS = 8000;

/**
 * How long the run-through takes for so long away: a few minutes take about two and a half seconds,
 * an hour about five, half a day eight. It grows ever more slowly with the time away, so a long time
 * goes by faster at its height rather than taking ever longer.
 */
export function lapseMs(gap: number): number {
  return Math.min(RUN_MOST_MS, RUN_LEAST_MS + 1400 * Math.log2(1 + gap / (20 * 60_000)));
}

/** Eased in and out with no sudden start or stop: it gathers speed gently and settles gently. */
const ease = (k: number) => k * k * k * (k * (6 * k - 15) + 10);

/**
 * The run-through from `from` to `to`: how long it takes, and the time to show when it's `k` of the
 * way through its length (0 to 1). It starts off slowly, speeds up (the more the longer it has been),
 * and slows into the present. Null after a short time away (the sky just moves on).
 */
export function lapseRun(from: number, to: number): { ms: number; at: (k: number) => number } | null {
  const start = Math.max(from, to - LAPSE_MOST);
  const gap = to - start;
  if (gap < LAPSE_FROM) return null;
  return { ms: lapseMs(gap), at: (k) => (k >= 1 ? to : start + gap * ease(Math.max(0, k))) };
}

/**
 * The times the run-through shows at its quickest, one step after another, ending at `to` (a slow
 * phone shows fewer of them, at the times it gets to them). Just `[to]` after a short time away.
 */
export function lapseSteps(from: number, to: number): number[] {
  const run = lapseRun(from, to);
  if (!run) return [to];
  const steps = Math.max(8, Math.round(run.ms / LAPSE_STEP_MS));
  return Array.from({ length: steps }, (_, i) => run.at((i + 1) / steps));
}
