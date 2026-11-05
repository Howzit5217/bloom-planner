import { clearOf, discsOf, geometry, layout, sideLayout, type Sprig } from '../sprigLayout';

const COLORS = ['#E8604C', '#F2C14E', '#FFFFFF', '#5B9BD5'];
const SEEDS = Array.from({ length: 250 }, (_, i) => 1 + i * 7919);

const headOf = (s: Sprig) => {
  const { top } = geometry(s);
  return { x: s.x + top.x, y: s.y + top.y, r: s.r };
};

function expectApart(sprigs: Sprig[]) {
  // Every stem has a leaf or two, one each side, and nothing else.
  for (const s of sprigs) {
    expect(s.leaves.length).toBeGreaterThanOrEqual(1);
    expect(s.leaves.length).toBeLessThanOrEqual(2);
    if (s.leaves.length === 2) expect(s.leaves[0].side).not.toBe(s.leaves[1].side);
    expect(Object.keys(s)).not.toContain('bud');
  }
  for (let i = 0; i < sprigs.length; i++) {
    for (let j = i + 1; j < sprigs.length; j++) {
      expect(clearOf(discsOf(sprigs[i]), discsOf(sprigs[j]))).toBe(true);
    }
  }
}

describe('side sprigs', () => {
  it.each([
    [360, 160],
    [411, 220],
    [411, 300],
    [480, 300],
  ])('come from both sides, touch nothing, and stand at different heights (%i x %i)', (w, h) => {
    for (const seed of SEEDS) {
      const sprigs = sideLayout(w, h, seed, COLORS);
      expect(sprigs.some((s) => s.x < 0)).toBe(true);
      expect(sprigs.some((s) => s.x > w)).toBe(true);
      expectApart(sprigs);
      const heads = sprigs.map(headOf);
      for (const hd of heads) {
        // Fully on screen.
        expect(hd.x).toBeGreaterThan(hd.r);
        expect(hd.x).toBeLessThan(w - hd.r);
        expect(hd.y).toBeGreaterThan(hd.r);
        expect(hd.y).toBeLessThan(h);
      }
      for (let i = 0; i < heads.length; i++) {
        for (let j = i + 1; j < heads.length; j++) {
          expect(Math.abs(heads[i].y - heads[j].y)).toBeGreaterThan((heads[i].r + heads[j].r) * 0.9);
        }
      }
    }
  });

  it('is different from one seed to the next', () => {
    const a = sideLayout(411, 300, 11, COLORS).map(headOf);
    const b = sideLayout(411, 300, 12, COLORS).map(headOf);
    expect(a).not.toEqual(b);
  });
});

describe('bottom row', () => {
  it.each([360, 411, 480])('touches nothing and neighbours differ in height (width %i)', (w) => {
    const h = 130;
    for (const seed of SEEDS) {
      const sprigs = layout(w, h, seed, undefined, COLORS);
      expect(sprigs.length).toBeGreaterThanOrEqual(3);
      expectApart(sprigs);
      for (let i = 1; i < sprigs.length; i++) {
        expect(Math.abs(sprigs[i].len - sprigs[i - 1].len)).toBeGreaterThanOrEqual(h * 0.1);
      }
      for (const hd of sprigs.map(headOf)) {
        expect(hd.y).toBeGreaterThan(hd.r);
      }
    }
  });
});
