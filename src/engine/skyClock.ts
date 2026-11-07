// The sky's run-through when the app comes back after a while: the times it shows on the way from
// how it was left to now, so the sun crosses the sky (and dusk turns to night) in a few seconds
// instead of the sky jumping.

/** Back after less than this, the sky simply moves on; longer, it runs through the time in between. */
export const LAPSE_FROM = 10 * 60_000;
/** It runs through at most this much (a whole night and day is no more to see than half of one). */
export const LAPSE_MOST = 12 * 3600_000;
/** One step of the run-through to the next, in milliseconds: the meadow blends from each to the next. */
export const LAPSE_STEP_MS = 140;

/**
 * The times to show, one step after another, ending at `to`. The run takes longer the longer it
 * has been (about 1.4 seconds for a short while, up to 4 for half a day), so it also goes faster at
 * its height; it starts off slowly, speeds up, and slows into the present (eased in and out), with
 * no jumps along the way. Just `[to]` after a short time away.
 */
export function lapseSteps(from: number, to: number): number[] {
  const start = Math.max(from, to - LAPSE_MOST);
  const gap = to - start;
  if (gap < LAPSE_FROM) return [to];
  const ms = Math.min(4000, 1300 + (gap / 3_600_000) * 230);
  const steps = Math.max(8, Math.round(ms / LAPSE_STEP_MS));
  return Array.from({ length: steps }, (_, i) => {
    const k = (i + 1) / steps;
    return i === steps - 1 ? to : start + gap * k * k * (3 - 2 * k);
  });
}
