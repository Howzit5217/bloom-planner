// The sky's run-through when the app comes back after a while: the times it shows on the way from
// how it was left to now, so the sun crosses the sky (and dusk turns to night) in a couple of seconds
// instead of the sky jumping.

/** Back after less than this, the sky simply moves on; longer, it runs through the time in between. */
export const LAPSE_FROM = 10 * 60_000;
/** It runs through at most this much (a whole night and day is no more to see than half of one). */
export const LAPSE_MOST = 12 * 3600_000;

/**
 * The times to show, one step after another, ending at `to`: about one per 20 minutes of sky, 5 to
 * 16 of them, eased (off quickly, slowing into the present). Just `[to]` after a short time away.
 */
export function lapseSteps(from: number, to: number): number[] {
  const start = Math.max(from, to - LAPSE_MOST);
  const gap = to - start;
  if (gap < LAPSE_FROM) return [to];
  const steps = Math.max(5, Math.min(16, Math.round(gap / (20 * 60_000))));
  return Array.from({ length: steps }, (_, i) => {
    const k = (i + 1) / steps;
    return i === steps - 1 ? to : start + gap * (1 - (1 - k) * (1 - k));
  });
}
