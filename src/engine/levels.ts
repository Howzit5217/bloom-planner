import type { Extrapolation, LevelRow, LevelSource, LevelTable, Overrides, ReqFn, Requirement, StepsMode } from './types';

/** Last level where steps are a lifetime total (and so carry over). */
export const LIFETIME_STEPS_MAX_LEVEL = 100;

export class LevelTableError extends Error {}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const floor100 = (x: number) => Math.floor(x / 100 + 1e-9) * 100;

function extrapolate(level: number, ex: Extrapolation, rows: Record<number, LevelRow>): { steps: number; flowers: number } | null {
  if (ex.method === 'geometric' && isNum(ex.anchorLevel) && isNum(ex.stepsBase) && isNum(ex.flowersBase) && isNum(ex.ratio) && level >= ex.anchorLevel) {
    const k = Math.pow(ex.ratio, level - ex.anchorLevel);
    return { steps: floor100(ex.stepsBase * k), flowers: floor100(ex.flowersBase * k) };
  }
  if (isNum(ex.fromLevel) && isNum(ex.stepsPerLevel) && isNum(ex.flowersPerLevel) && level > ex.fromLevel) {
    // Linear: walk forward from the nearest known row at or below fromLevel.
    let base = ex.fromLevel;
    while (base > 0 && !rows[base]) base--;
    const from = rows[base];
    if (!from) return null;
    const n = level - base;
    return { steps: from.steps + ex.stepsPerLevel * n, flowers: from.flowers + ex.flowersPerLevel * n };
  }
  return null;
}

/**
 * Parse and validate a level table (schema bloom-levels/1 or /2).
 * Missing levels are filled using the file's own extrapolation rule, or by
 * interpolating between neighbours when the rule doesn't cover them.
 */
export function parseLevelTable(json: unknown): LevelTable {
  if (!json || typeof json !== 'object') throw new LevelTableError('Level table is not an object');
  const doc = json as Record<string, unknown>;
  const maxLevel = doc.maxLevel;
  if (!isNum(maxLevel) || maxLevel < 2 || maxLevel > 1000) throw new LevelTableError('Invalid maxLevel');
  const levels = doc.levels;
  if (!Array.isArray(levels) || levels.length === 0) throw new LevelTableError('Missing levels');
  const exRaw = (doc.extrapolation ?? {}) as Record<string, unknown>;
  const extrapolation: Extrapolation = {
    method: exRaw.method === 'geometric' ? 'geometric' : 'linear',
    anchorLevel: isNum(exRaw.anchorLevel) ? exRaw.anchorLevel : undefined,
    stepsBase: isNum(exRaw.stepsBase) ? exRaw.stepsBase : undefined,
    flowersBase: isNum(exRaw.flowersBase) ? exRaw.flowersBase : undefined,
    ratio: isNum(exRaw.ratio) ? exRaw.ratio : undefined,
    fromLevel: isNum(exRaw.fromLevel) ? exRaw.fromLevel : undefined,
    stepsPerLevel: isNum(exRaw.stepsPerLevel) ? exRaw.stepsPerLevel : undefined,
    flowersPerLevel: isNum(exRaw.flowersPerLevel) ? exRaw.flowersPerLevel : undefined,
  };

  const byLevel: Record<number, LevelRow> = {};
  for (const raw of levels) {
    if (!raw || typeof raw !== 'object') throw new LevelTableError('Invalid level row');
    const r = raw as Record<string, unknown>;
    const level = r.level;
    if (!isNum(level) || !Number.isInteger(level) || level < 1 || level > maxLevel) throw new LevelTableError(`Invalid level number ${String(level)}`);
    if (byLevel[level]) throw new LevelTableError(`Duplicate level ${level}`);
    if (!isNum(r.steps) || r.steps < 0 || !isNum(r.flowers) || r.flowers < 0) throw new LevelTableError(`Invalid requirement at level ${level}`);
    const stepsMode: StepsMode =
      r.stepsMode === 'lifetime' || r.stepsMode === 'perLevel' ? r.stepsMode : level <= LIFETIME_STEPS_MAX_LEVEL ? 'lifetime' : 'perLevel';
    const source: LevelSource = r.source === 'wiki' ? 'wiki' : r.source === 'game' ? 'game' : 'estimated';
    byLevel[level] = {
      level,
      steps: Math.round(r.steps),
      flowers: Math.round(r.flowers),
      task: typeof r.task === 'string' ? r.task : '',
      cumulativeSteps: isNum(r.cumulativeSteps) ? r.cumulativeSteps : undefined,
      stepsMode,
      source,
      wikiRow: isNum(r.wikiRow) ? r.wikiRow : undefined,
      note: typeof r.note === 'string' ? r.note : undefined,
    };
  }

  // Fill gaps.
  for (let level = 1; level <= maxLevel; level++) {
    if (byLevel[level]) continue;
    let fill = extrapolate(level, extrapolation, byLevel);
    if (!fill) {
      let lo = level - 1;
      while (lo > 0 && !byLevel[lo]) lo--;
      let hi = level + 1;
      while (hi <= maxLevel && !byLevel[hi]) hi++;
      const a = byLevel[lo];
      const b = byLevel[hi];
      if (a && b) {
        const w = (level - lo) / (hi - lo);
        fill = { steps: floor100(a.steps + (b.steps - a.steps) * w), flowers: floor100(a.flowers + (b.flowers - a.flowers) * w) };
      } else if (a) fill = { steps: a.steps, flowers: a.flowers };
      else if (b) fill = { steps: b.steps, flowers: b.flowers };
      else fill = { steps: 0, flowers: 0 };
    }
    byLevel[level] = {
      level,
      steps: fill.steps,
      flowers: fill.flowers,
      task: '',
      stepsMode: level <= LIFETIME_STEPS_MAX_LEVEL ? 'lifetime' : 'perLevel',
      source: 'estimated',
      note: 'Missing from the level file; filled by its extrapolation rule.',
    };
  }

  const rules = (doc.rules && typeof doc.rules === 'object' ? doc.rules : {}) as LevelTable['rules'];
  return {
    version: isNum(doc.version) ? doc.version : 1,
    maxLevel,
    retrieved: typeof doc.retrieved === 'string' ? doc.retrieved : '',
    sourceUrl: typeof doc.sourceUrl === 'string' ? doc.sourceUrl : '',
    notes: Array.isArray(doc.notes) ? doc.notes.filter((n): n is string => typeof n === 'string') : [],
    rules,
    extrapolation,
    byLevel,
  };
}

/** Requirement to reach `level`, with the user's override winning over bundled data. */
export function requirement(table: LevelTable, overrides: Overrides, level: number): Requirement | null {
  const row = table.byLevel[level];
  if (!row) return null;
  const o = overrides[level];
  const steps = o && o.steps != null ? o.steps : row.steps;
  const flowers = o && o.flowers != null ? o.flowers : row.flowers;
  return {
    level,
    steps,
    flowers,
    task: row.task,
    stepsMode: row.stepsMode,
    source: row.source,
    overridden: !!o && (o.steps != null || o.flowers != null),
    bundledSteps: row.steps,
    bundledFlowers: row.flowers,
  };
}

export function makeReq(table: LevelTable, overrides: Overrides): ReqFn {
  const cache = new Map<number, Requirement | null>();
  return (level: number) => {
    if (!cache.has(level)) cache.set(level, requirement(table, overrides, level));
    return cache.get(level) ?? null;
  };
}

/** True when surplus steps at the moment of reaching `level` carry into the next requirement. */
export function stepsCarryInto(req: ReqFn, level: number): boolean {
  const r = req(level);
  return !!r && r.stepsMode === 'lifetime';
}

/** Lifetime steps needed to reach `level` (only meaningful for lifetime-mode levels). */
export function cumulativeStepsTo(req: ReqFn, level: number): number {
  let sum = 0;
  for (let l = 3; l <= level; l++) {
    const r = req(l);
    if (!r || r.stepsMode !== 'lifetime') break;
    sum += r.steps;
  }
  return sum;
}

/** Simple stable hash of overrides for memo keys. */
export function overridesKey(o: Overrides): string {
  return Object.keys(o)
    .map(Number)
    .sort((a, b) => a - b)
    .map((l) => `${l}:${o[l].steps ?? ''}:${o[l].flowers ?? ''}`)
    .join('|');
}
