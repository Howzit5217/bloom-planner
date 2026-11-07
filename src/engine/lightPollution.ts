/**
 * How light-polluted a place's night sky is, on the Bortle scale (1 the darkest country sky, 9 a city
 * centre), from the size of the town it's in and how far it is from its middle. A town's skyglow
 * reaches out a long way (it falls off with about the 2.5th power of distance, Walker's law): a big
 * city's brightens the sky for tens of kilometres round. An estimate, not a measurement; unknown
 * places are taken as a suburb's sky.
 */
export function bortleOf(population: number | null | undefined, km: number | null | undefined): number {
  if (population == null || km == null) return 5;
  const p = Math.max(0, population);
  // Each row: the town at least this size, then the distances (km) out to which the sky is 9, 8, 7...
  const rows: Array<[number, number, number[]]> = [
    [3_000_000, 9, [12, 25, 45, 80, 130]],
    [1_000_000, 9, [6, 15, 30, 55, 90]],
    [250_000, 8, [5, 13, 28, 50]],
    [50_000, 7, [4, 10, 24]],
    [10_000, 6, [3, 8]],
    [1_000, 5, [2]],
  ];
  for (const [size, top, reach] of rows) {
    if (p < size) continue;
    const i = reach.findIndex((r) => km < r);
    return i < 0 ? Math.max(3, top - reach.length) : top - i;
  }
  // A village or less: a dark country sky.
  return km < 1.5 ? 4 : 3;
}
