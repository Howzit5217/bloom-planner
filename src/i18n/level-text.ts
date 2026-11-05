import type { LevelSource } from '@/engine/types';
import { currentLang, t, tk, tn } from './core';

// Level tasks in the level file are English ("Grow 3 Pikmin"). They follow a handful of patterns,
// translated here. English shows the file's own wording.
const SEEDLINGS: Record<string, string> = {
  Blue: tk('Grow a Blue Seedling'),
  Purple: tk('Grow a Purple Seedling'),
  White: tk('Grow a White Seedling'),
  Pink: tk('Grow a Pink Seedling'),
  Gray: tk('Grow a Gray Seedling'),
};

export function taskText(task: string): string {
  if (currentLang() === 'en') return task;
  let m: RegExpMatchArray | null;
  if (task === 'Tutorial') return t('Tutorial');
  if ((m = task.match(/^Grow (\d+) Pikmin$/))) return tn(Number(m[1]), 'Grow {n} Pikmin', 'Grow {n} Pikmin');
  if ((m = task.match(/^Complete (\d+) expedition(?:s|\(s\))?$/))) return tn(Number(m[1]), 'Complete {n} expedition', 'Complete {n} expeditions');
  if ((m = task.match(/^Pick (\d+) flower petals?$/))) return tn(Number(m[1]), 'Pick {n} flower petal', 'Pick {n} flower petals');
  if ((m = task.match(/^(?:Destroy|Clear) (\d+) mushrooms?$/))) return tn(Number(m[1]), 'Clear {n} mushroom', 'Clear {n} mushrooms');
  if ((m = task.match(/^Grow an? (\w+) Seedling$/)) && SEEDLINGS[m[1]]) return t(SEEDLINGS[m[1]]);
  return task;
}

/**
 * A level's provenance note. English shows the level file's detailed note; other languages get a
 * plain line about where the numbers come from (the detail is about the wiki's own history).
 */
export function noteText(note: string | null | undefined, source: LevelSource): string | null {
  if (!note) return null;
  if (currentLang() === 'en') return note;
  return source === 'game' ? t('Checked in the game.') : source === 'estimated' ? t("Nobody has published this level yet, so it's an estimate.") : t('From the Pikmin wiki.');
}
