export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'top';

/**
 * The level badge's metal, as in the game: bronze for levels 1-49, silver for 50-99, gold for
 * 100-129, and red in a gold rim from 130 (the top level so far; the game plans up to 150).
 */
export function badgeTier(level: number): BadgeTier {
  if (level >= 130) return 'top';
  if (level >= 100) return 'gold';
  if (level >= 50) return 'silver';
  return 'bronze';
}
