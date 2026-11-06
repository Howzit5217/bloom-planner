import bundled from '../../data/bloom-levels.json';
import { cumulativeStepsTo, estimateLevel, makeReq, parseLevelTable, requirement, LevelTableError } from '../levels';

describe('bundled level table', () => {
  const t = parseLevelTable(bundled);

  it('has every level 1-130', () => {
    expect(t.maxLevel).toBe(130);
    for (let l = 1; l <= 130; l++) expect(t.byLevel[l]).toBeDefined();
  });

  it('matches the in-game check: at Lv 110 the game asks 479,200 steps and 294,900 flowers to reach 111', () => {
    expect(t.byLevel[111]).toMatchObject({ steps: 479200, flowers: 294900, source: 'game', stepsMode: 'perLevel' });
  });

  it('keeps the wiki lifetime totals for levels 3-100', () => {
    const req = makeReq(t, {});
    expect(cumulativeStepsTo(req, 100)).toBe(10_000_000);
    expect(cumulativeStepsTo(req, 75)).toBe(3_330_000);
    expect(t.byLevel[100]).toMatchObject({ steps: 460000, flowers: 140000, cumulativeSteps: 10_000_000, stepsMode: 'lifetime' });
    for (let l = 3; l <= 100; l++) expect(t.byLevel[l].stepsMode).toBe('lifetime');
  });

  it('moves the wiki rows recorded one level early (rows 112-122) to the level they unlock', () => {
    expect(t.byLevel[113]).toMatchObject({ steps: 480200, flowers: 295500, wikiRow: 112 });
    expect(t.byLevel[123]).toMatchObject({ steps: 484900, flowers: 298400, wikiRow: 122 });
  });

  it('marks unobserved levels as estimates and keeps them increasing', () => {
    for (const l of [110, 112, 124, 125, 126, 127, 128, 129, 130]) expect(t.byLevel[l].source).toBe('estimated');
    for (let l = 102; l <= 130; l++) {
      expect(t.byLevel[l].steps).toBeGreaterThan(t.byLevel[l - 1].steps);
      expect(t.byLevel[l].flowers).toBeGreaterThanOrEqual(t.byLevel[l - 1].flowers);
    }
  });
});

describe('parseLevelTable', () => {
  it('fills a missing level from the file extrapolation block', () => {
    const doc = {
      maxLevel: 4,
      extrapolation: { fromLevel: 3, stepsPerLevel: 500, flowersPerLevel: 300 },
      levels: [
        { level: 1, steps: 0, flowers: 0, task: '' },
        { level: 2, steps: 0, flowers: 0, task: '' },
        { level: 3, steps: 1000, flowers: 100, task: '' },
      ],
    };
    const t = parseLevelTable(doc);
    expect(t.byLevel[4]).toMatchObject({ steps: 1500, flowers: 400, source: 'estimated' });
  });

  it('rejects broken files', () => {
    expect(() => parseLevelTable({ maxLevel: 3, levels: [{ level: 1, steps: -1, flowers: 0 }] })).toThrow(LevelTableError);
    expect(() => parseLevelTable({ maxLevel: 3, levels: [{ level: 1, steps: 0, flowers: 0 }, { level: 1, steps: 0, flowers: 0 }] })).toThrow(LevelTableError);
    expect(() => parseLevelTable(null)).toThrow(LevelTableError);
  });
});

describe('overrides', () => {
  const t = parseLevelTable(bundled);
  it('win over bundled data without touching it', () => {
    const o = { 125: { level: 125, steps: 490000, flowers: null, recordedAt: '2026-11-04' } };
    const r = requirement(t, o, 125)!;
    expect(r.steps).toBe(490000);
    expect(r.flowers).toBe(t.byLevel[125].flowers);
    expect(r.overridden).toBe(true);
    expect(r.bundledSteps).toBe(t.byLevel[125].steps);
    expect(t.byLevel[125].steps).not.toBe(490000);
  });
});

describe('levels past the table (to 150)', () => {
  it("guesses steps on a smooth climb to about 500,000 at 150, and flowers on the table's own growth", () => {
    const t = parseLevelTable(bundled);
    const last = t.byLevel[t.maxLevel];
    const all = Array.from({ length: 150 - t.maxLevel }, (_, i) => estimateLevel(t, t.maxLevel + 1 + i)!);
    expect(all[all.length - 1].steps).toBe(500000);
    expect(all[0].steps).toBeGreaterThan(last.steps);
    expect(all[0].flowers).toBeGreaterThan(last.flowers);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].steps).toBeGreaterThanOrEqual(all[i - 1].steps);
      expect(all[i].flowers).toBeGreaterThanOrEqual(all[i - 1].flowers);
    }
    // Nothing to guess for a level the table has, or past 150.
    expect(estimateLevel(t, t.maxLevel)).toBeNull();
    expect(estimateLevel(t, 151)).toBeNull();
  });
});
