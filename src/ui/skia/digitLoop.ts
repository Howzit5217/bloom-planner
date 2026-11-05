/**
 * The game numbers roll each digit round a loop, like an odometer wheel, in the direction the
 * whole number moves: going up, every digit rolls forward (9 to 0 is one step on, just like 5 to 6);
 * going down, back (0 to 9 one step back, like 6 to 5). Never a run back through every other digit.
 * A digit's place on the wheel is unbounded (11 shows a 1); it's kept near 0..9 so the drawn strip
 * (a few turns of 0-9) covers it.
 */

/**
 * The wheel's place to roll to for `digit`, from `from`: forward when the number went up (`dir` 1),
 * back when it went down (-1), and the shorter way round when it's neither (0).
 */
export function nextOnLoop(from: number, digit: number, dir: -1 | 0 | 1): number {
  const at = ((Math.round(from) % 10) + 10) % 10;
  const ahead = (((digit - at) % 10) + 10) % 10;
  const step = dir > 0 ? ahead : dir < 0 ? (ahead === 0 ? 0 : ahead - 10) : ahead > 5 ? ahead - 10 : ahead;
  return Math.round(from) + step;
}

/** How far to shift a place (in whole turns) to bring it back into 0..9, showing the same digit. */
export const turnsOff = (place: number) => Math.floor(place / 10) * 10;
