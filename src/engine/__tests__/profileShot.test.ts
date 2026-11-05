import bundled from '../../data/bloom-levels.json';
import { makeReq, parseLevelTable } from '../levels';
import { finishShot, levelFromTargets, nameOnShot, readAmount, readNumber, readProfileShot, sameName, settleLevel } from '../profileShot';
import { reqOf, table } from './helpers';

// Lines as text recognition returns them from a profile screen (a made-up player).
const CLEAN = [
  '94 Friends',
  '0.00 mph',
  'Edit Mii',
  'Lv',
  '110',
  'Blossom42',
  'Account ID: MeadowWalker',
  'Total steps: 21,668,568',
  'Next steps to level up...',
  'Walk 479,200 step',
  '479,200 steps to go',
  'Plant 294,900 flowers',
  '294,900 flowers to go',
  'Local Event Patches',
];

describe('reading a profile screenshot', () => {
  it('reads the name, level and what is left', () => {
    const s = readProfileShot(CLEAN, 130);
    expect(s.name).toBe('Blossom42');
    expect(s.level).toBe(110);
    expect(s.stepsToGo).toBe(479200);
    expect(s.flowersToGo).toBe(294900);
    expect(s.walkTarget).toBe(479200);
    expect(s.plantTarget).toBe(294900);
    expect(s.totalSteps).toBe(21668568);
  });

  it('forgives the misreads text recognition makes', () => {
    // A real web read: the badge split as "1 1/0", the name lost, the level-up lines on their own.
    const rough = ['2:30', 'Edit Mii', '“Lv', '1 1/0 Account ID: MeadowWalker', 'Total steps: 21,668,568', 'Next steps fo |', '479,200 steps to go', '294,9OO flowers to go'];
    const s = readProfileShot(rough, 130);
    expect(s.level).toBe(110);
    expect(s.stepsToGo).toBe(479200);
    expect(s.flowersToGo).toBe(294900);
    expect(s.name).toBeNull();
    expect(readNumber('47g,2OO')).toBeNull();
    expect(readNumber('479 2OO')).toBe(479200);
  });

  it('reads a quest and a lifetime-steps target', () => {
    const s = readProfileShot(['Lv 89', 'Blossom42', 'Account ID: x', 'Walk a total of 6,510,000 steps', '12,345 steps to go', 'Clear 40 mushrooms', '12 mushrooms to go'], 130);
    expect(s.level).toBe(89);
    expect(s.walkTarget).toBe(6510000);
    expect(s.quest).toEqual({ kind: 'mushrooms', toGo: 12 });
  });

  it('finds the level from the targets when the badge does not read', () => {
    const t = table([
      { level: 3, steps: 1000, flowers: 100 },
      { level: 4, steps: 2000, flowers: 200 },
    ]);
    expect(levelFromTargets({ ...readProfileShot([], 4), walkTarget: 2000, plantTarget: 200 }, reqOf(t), t.maxLevel)).toBe(3);
  });

  it('trusts the badge only when what is left fits it', () => {
    const t = table([
      { level: 11, steps: 3000, flowers: 100 },
      { level: 111, steps: 479200, flowers: 294900 },
    ], 130);
    // The web reader saw the "110" badge as "U 1/0": 10 can't have 479,200 steps to go; 110 can.
    const s = readProfileShot(['Lv', 'U 1/0 Account ID: MeadowWalker', '479,200 steps to go', '294,900 flowers to go'], 130);
    expect(s.level).toBe(10);
    expect(s.name).toBeNull();
    expect(settleLevel(s, reqOf(t), 130)).toBe(110);
    // Nothing fits: the player sets the level.
    expect(settleLevel({ ...s, stepsToGo: 9_999_999 }, reqOf(t), 130)).toBeNull();
  });

  it("takes what's left from under the bars, never the bar's own number", () => {
    const t = table([{ level: 111, steps: 479200, flowers: 294900 }], 130);
    // The bar shows the level's target; the line under it, at the right, shows what's still to go.
    const s = readProfileShot(['Lv 110 Blossom42', 'Account ID: x', 'Walk 479,200 step', '120,000 steps to go', 'Plant 294,900 flowers', '5,000 flowers to go'], 130);
    expect(s.stepsToGo).toBe(120000);
    expect(s.flowersToGo).toBe(5000);
    expect(settleLevel(s, reqOf(t), 130)).toBe(110);
    // Only the bars read: nothing to go is known, rather than the bar's number.
    const barsOnly = readProfileShot(['Lv 110', 'Walk 479,200 step', 'Plant 294,900 flowers'], 130);
    expect(barsOnly.stepsToGo).toBeNull();
    expect(barsOnly.flowersToGo).toBeNull();
    // The bar's number and the one under it run together on one line: the one under it counts.
    expect(readProfileShot(['Walk 479,200 120,000 steps to go'], 130).stepsToGo).toBe(120000);
  });

  it('reads rounded targets, "(s)" quests and ticked goals (level 44, from an iPhone)', () => {
    const req = makeReq(parseLevelTable(bundled), {});
    // Expeditions and the lifetime steps are ticked, with no line under them; flowers are not.
    const lines = ['14 Friends', 'Edit Mii', 'Lv', '44', 'Clover7', 'Account ID: Clover7', 'Total steps: 1,261,134', 'Next steps to level up...', 'Complete 15 expedition(s) ✓', 'Plant 12K flowers', '5,662 flowers to go', 'Walk a total of 788K steps ✓', 'Community Day Badges'];
    const s = readProfileShot(lines, 130);
    expect(s.name).toBe('Clover7');
    expect(s.walkTarget).toBe(788000);
    expect(s.walkSlack).toBe(1000);
    expect(s.walkLifetime).toBe(true);
    expect(s.plantTarget).toBe(12000);
    expect(s.questTarget).toEqual({ kind: 'expeditions', count: 15 });
    expect(s.flowersToGo).toBe(5662);
    const done = finishShot(s, req, 130);
    expect(done.level).toBe(44);
    expect(done.stepsToGo).toBe(0);
    expect(done.quest).toEqual({ kind: 'expeditions', toGo: 0 });
    // Without the ticks the missing lines still mean done, and the steps follow from the total.
    const noTicks = finishShot(readProfileShot(lines.map((l) => l.replace(' ✓', '')), 130), req, 130);
    expect(noTicks.stepsToGo).toBe(0);
    expect(noTicks.quest?.toGo).toBe(0);
    // Short of the lifetime total, the steps to go come from it.
    const behind = finishShot(readProfileShot(['Lv 44', 'Total steps: 780,000', 'Plant 12K flowers', '5,662 flowers to go'], 130), req, 130);
    expect(behind.level).toBe(44);
    expect(behind.stepsToGo).toBe(8000);
    expect(readAmount('12K')).toEqual({ n: 12000, slack: 1000 });
    expect(readAmount('1.2M')).toEqual({ n: 1200000, slack: 100000 });
    expect(readProfileShot(['3 expedition(s) to go'], 130).quest).toEqual({ kind: 'expeditions', toGo: 3 });
  });

  it('reads a level past 100 from an Android screenshot', () => {
    const req = makeReq(parseLevelTable(bundled), {});
    const lines = ['94 Friends', 'Edit Mii', 'Lv', '110', 'Blossom42', 'Account ID: MeadowWalker', 'Total steps: 21,673,987', 'Next steps to level up...', 'Walk 479,200 step', '437,337 steps to go', 'Plant 294,900 flowers', '293,173 flowers to go'];
    const s = finishShot(readProfileShot(lines, 130), req, 130);
    expect(s.level).toBe(110);
    expect(s.stepsToGo).toBe(437337);
    expect(s.flowersToGo).toBe(293173);
    expect(s.quest).toBeNull();
  });

  it('takes no name from above the level badge', () => {
    // A real web read of a small screenshot: the name lost, a scrap of the avatar read as "ad".
    const s = readProfileShot(['0 00 mph', 'Fo', 'ad', 'Lv', 'U 1/0 Account ID: MeadowWalker', '479,200 steps to go'], 130);
    expect(s.name).toBeNull();
    expect(readProfileShot(['Lv 110 Blossom42', 'Account ID: MeadowWalker'], 130).name).toBe('Blossom42');
  });

  it('finds the saved name anywhere on the screenshot', () => {
    expect(nameOnShot('Blossom42', ['Edit Mii', 'Lv 110 B1ossom42', 'Account ID: x'])).toBe(true);
    expect(nameOnShot('Big Al', ['94 Friends', 'Big Al', 'Account ID: x'])).toBe(true);
    expect(nameOnShot('Blossom42', ['ad', 'Lv', 'U 1/0 Account ID: MeadowWalker'])).toBe(false);
  });

  it("checks the name, allowing a letter's misread", () => {
    expect(sameName('Blossom42', 'Blossom42')).toBe(true);
    expect(sameName('Blossom42', 'B1ossom42')).toBe(true);
    expect(sameName('Blossom42', 'blossom 42')).toBe(true);
    expect(sameName('Blossom42', 'Daisy')).toBe(false);
    expect(sameName('Ana', 'Ann')).toBe(false);
  });
});
