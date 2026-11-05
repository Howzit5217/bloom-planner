// A level's extra quest ("Clear 15 mushrooms", "Complete 40 expeditions"), read from the level
// file's English task text. Levels without one (most of them, and every level past 100) give null.

export type QuestKind = 'mushrooms' | 'expeditions' | 'pikmin' | 'petals' | 'seedling';

export interface Quest {
  kind: QuestKind;
  /** How many the game asks for (a seedling is one). */
  count: number;
}

export function questOf(task: string | null | undefined): Quest | null {
  if (!task) return null;
  let m: RegExpMatchArray | null;
  if ((m = task.match(/^(?:Destroy|Clear) (\d+) mushrooms?$/i))) return { kind: 'mushrooms', count: Number(m[1]) };
  if ((m = task.match(/^Complete (\d+) expedition(?:s|\(s\))?$/i))) return { kind: 'expeditions', count: Number(m[1]) };
  if ((m = task.match(/^Grow (\d+) Pikmin$/i))) return { kind: 'pikmin', count: Number(m[1]) };
  if ((m = task.match(/^Pick (\d+) flower petals?$/i))) return { kind: 'petals', count: Number(m[1]) };
  if (/^Grow an? \w+ Seedling$/i.test(task)) return { kind: 'seedling', count: 1 };
  return null;
}
