import { cameraFrame, cameraMatrix, horizonAt, tiltAt } from '../camera';

/** Where the matrix puts a point of the level scene on screen. */
const project = (m: number[], u: number, v: number) => {
  const w = m[6] * u + m[7] * v + m[8];
  return { x: (m[0] * u + m[1] * v + m[2]) / w, y: (m[3] * u + m[4] * v + m[5]) / w };
};

/** The level-scene point the screen point (x, y) shows: the matrix run backwards. */
const unproject = (m: number[], x: number, y: number) => {
  // Solve [m0-x*m6, m1-x*m7; m3-y*m6, m4-y*m7] (u, v) = (x*m8-m2, y*m8-m5).
  const a = m[0] - x * m[6];
  const b = m[1] - x * m[7];
  const c = m[3] - y * m[6];
  const d = m[4] - y * m[7];
  const e = x * m[8] - m[2];
  const f = y * m[8] - m[5];
  const det = a * d - b * c;
  return { u: (e * d - b * f) / det, v: (a * f - e * c) / det };
};

describe("Home's camera", () => {
  // A 390 x 844 phone with the horizon about half way down, as in the game.
  const fr = cameraFrame(390, 844, Math.round(844 * 0.52));

  it('shows the level scene as drawn, with the horizon about half way down', () => {
    const m = cameraMatrix(fr, 0);
    expect(project(m, fr.pad, 0)).toEqual({ x: 0, y: 0 });
    expect(project(m, fr.pad + 390, 844).y).toBeCloseTo(844);
    expect(horizonAt(fr, 0)).toBe(fr.cy);
    expect(fr.cy / 844).toBeCloseTo(0.52, 2);
  });

  it('tilts down until the sky has left the top of the screen', () => {
    expect(horizonAt(fr, 0.5)).toBeLessThan(fr.cy);
    expect(horizonAt(fr, 1)).toBeLessThan(0);
    // The horizon on screen is where the scene's horizon row lands.
    const m = cameraMatrix(fr, tiltAt(fr, 0.6));
    expect(project(m, fr.pad + 100, fr.cy).y).toBeCloseTo(horizonAt(fr, 0.6));
  });

  it('moves the near field faster than the far field (perspective, not a slide)', () => {
    const m = cameraMatrix(fr, tiltAt(fr, 0.4));
    const far = fr.cy - project(m, fr.pad + 195, fr.cy + 20).y;
    const near = fr.cy + 380 - project(m, fr.pad + 195, fr.cy + 380).y;
    expect(near).toBeGreaterThan(far * 1.15);
  });

  it('has drawn enough scene to fill the screen at every tilt', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const m = cameraMatrix(fr, tiltAt(fr, p));
      for (const [x, y] of [
        [0, 0],
        [390, 0],
        [0, 844],
        [390, 844],
      ]) {
        const { u, v } = unproject(m, x, y);
        expect(u).toBeGreaterThanOrEqual(-0.5);
        expect(u).toBeLessThanOrEqual(fr.picW + 0.5);
        expect(v).toBeGreaterThanOrEqual(-0.5);
        expect(v).toBeLessThanOrEqual(fr.picH + 0.5);
      }
    }
  });

  it("gives an upright flower the camera's width-ways scale where it stands", () => {
    for (const p of [0, 0.5, 1]) {
      const m = cameraMatrix(fr, tiltAt(fr, p));
      const u = fr.pad + 120;
      const v = fr.cy + 420;
      const across = project(m, u + 1, v).x - project(m, u, v).x;
      expect(1 / (m[7] * v + m[8])).toBeCloseTo(across, 6);
      // Down the screen the ground is squashed more than across, which is why flowers don't take that scale.
      if (p > 0) expect(project(m, u, v + 1).y - project(m, u, v).y).toBeLessThan(across);
    }
  });

  it('leaves a flower coming in from below leaning toward you less than a full turn would', () => {
    const m = cameraMatrix(fr, tiltAt(fr, 1));
    const v = fr.cy + 420;
    // How much bigger across a flower 40 points tall is drawn at its top than at its base.
    const grow = (m[7] * v + m[8]) / (m[7] * (v - 40) + m[8]);
    const q = Math.sin(fr.tiltMax) / fr.F;
    const fullTurn = (q * v + Math.cos(fr.tiltMax) - fr.cy * q) / (q * (v - 40) + Math.cos(fr.tiltMax) - fr.cy * q);
    expect(grow).toBeGreaterThan(1);
    expect(grow - 1).toBeLessThan((fullTurn - 1) * 0.75);
  });

  it('eases into the full tilt and never tilts up', () => {
    expect(tiltAt(fr, -1)).toBe(0);
    expect(tiltAt(fr, 2)).toBeCloseTo(fr.tiltMax);
    expect(tiltAt(fr, 1) - tiltAt(fr, 0.95)).toBeLessThan(tiltAt(fr, 0.05) - tiltAt(fr, 0));
  });
});
