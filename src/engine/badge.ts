export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'top' | 'peak';

/**
 * The level badge's metal, as in the game: bronze for levels 1-49, silver for 50-99, gold for
 * 100-129, red in a gold rim from 130 (the top level so far), and green in a gold rim at 150, the
 * game's last.
 */
export function badgeTier(level: number): BadgeTier {
  if (level >= 150) return 'peak';
  if (level >= 130) return 'top';
  if (level >= 100) return 'gold';
  if (level >= 50) return 'silver';
  return 'bronze';
}
