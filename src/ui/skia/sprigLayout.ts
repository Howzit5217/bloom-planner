import { rng } from './random';

/**
 * Where the stemmed flowers go: pure maths (no drawing), so the spacing rules can be tested. Every
 * sprig is laid out from a seed, so each visit gets its own arrangement.
 */

export interface Sprig {
  /** Where the stem starts: on the ground, or just off the screen's edge. */
  x: number;
  y: number;
  len: number;
  lean: number;
  bend: number;
  r: number;
  color: string;
  rot: number;
  delay: number;
  phase: number;
  leaves: Array<{ at: number; side: 1 | -1; size: number }>;
  /** This sprig's own leaf shape and stem: a little different on every one. */
  leafLen: number;
  leafWid: number;
  stemW: number;
}

type Draft = Omit<Sprig, 'leafLen' | 'leafWid' | 'stemW'>;

/** Give a sprig its own leaf shape and stem, and fit its leaves below the head so they always show. */
function finish(d: Draft, rand: () => number): Sprig {
  const leafLen = 1.45 + rand() * 0.45;
  const leafWid = 0.3 + rand() * 0.14;
  const stemW = 0.36 + rand() * 0.14;
  // A leaf's tip rises about 0.62 of its length; keep that below the head, with a little air.
  const room = (at: number) => (1 - at) * d.len - d.r * 1.2;
  const leaves: Sprig['leaves'] = [];
  for (const l of [...d.leaves].sort((a, b) => a.at - b.at)) {
    const at = Math.max(0.16, Math.min(l.at, 0.85));
    const size = Math.min(l.size, room(at) / (0.62 * leafLen * d.r));
    if (size < 0.55) continue;
    if (leaves.length && at - leaves[leaves.length - 1].at < 0.18) continue;
    leaves.push({ at, side: l.side, size });
  }
  // If none fit where they were meant to go, the lowest one moves down the stem to where it does.
  if (!leaves.length && d.leaves.length) {
    const l = d.leaves[0];
    const size = Math.min(l.size, room(0.2) / (0.62 * leafLen * d.r));
    if (size >= 0.55) leaves.push({ at: 0.2, side: l.side, size });
  }
  return { ...d, leaves, leafLen, leafWid, stemW };
}

/** One leaf, or two on opposite sides of the stem with one clearly higher than the other. */
function twoLeaves(rand: () => number, count: number, first: number): Sprig['leaves'] {
  const side: 1 | -1 = rand() < 0.5 ? 1 : -1;
  if (count < 2) return [{ at: first, side, size: 0.8 + rand() * 0.3 }];
  // A pair starts low, so the upper one still has room under the head.
  const low = Math.min(first, 0.2 + rand() * 0.1);
  return [
    { at: low, side, size: 0.8 + rand() * 0.25 },
    { at: low + 0.2 + rand() * 0.08, side: -side as 1 | -1, size: 0.62 + rand() * 0.22 },
  ];
}

/** Where a sprig's stem runs and its head sits, from its base: shared by the drawing and the spacing. */
export function geometry(s: Pick<Sprig, 'len' | 'lean' | 'bend'>) {
  const top = { x: Math.sin(s.lean) * s.len, y: -Math.cos(s.lean) * s.len };
  const ctrl = { x: top.x * 0.5 + s.bend * s.len * 0.25, y: top.y * 0.55 };
  const pointAt = (t: number) => ({
    x: 2 * (1 - t) * t * ctrl.x + t * t * top.x,
    y: 2 * (1 - t) * t * ctrl.y + t * t * top.y,
    along: Math.atan2(2 * (1 - t) * ctrl.y + 2 * t * (top.y - ctrl.y), 2 * (1 - t) * ctrl.x + 2 * t * (top.x - ctrl.x)),
  });
  return { top, ctrl, pointAt };
}

export const leafAngle = (along: number, side: 1 | -1) => along + side * (Math.PI / 2 - 0.6);

export interface Disc {
  x: number;
  y: number;
  r: number;
  head: boolean;
}

/** A sprig roughly as a few discs (head, stem, leaves) on the canvas, to keep sprigs off each other. */
export function discsOf(s: Sprig): Disc[] {
  const g = geometry(s);
  const out: Disc[] = [{ x: s.x + g.top.x, y: s.y + g.top.y, r: s.r * 1.05, head: true }];
  const stemR = Math.max(3.5, s.r * s.stemW) / 2 + 1;
  for (let i = 1; i <= 12; i++) {
    const p = g.pointAt(i / 13);
    out.push({ x: s.x + p.x, y: s.y + p.y, r: stemR, head: false });
  }
  for (const l of s.leaves) {
    const p = g.pointAt(l.at);
    const a = leafAngle(p.along, l.side);
    const L = s.r * s.leafLen * l.size;
    out.push({ x: s.x + p.x + Math.cos(a) * L * 0.5, y: s.y + p.y + Math.sin(a) * L * 0.5, r: L * 0.42, head: false });
  }
  return out;
}

/** True when none of `mine` touches any of `placed`; heads keep a wider berth from each other. */
export function clearOf(mine: Disc[], placed: Disc[]): boolean {
  return mine.every((a) =>
    placed.every((b) => {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      return a.head && b.head ? d > (a.r + b.r) * 1.3 : d > a.r + b.r + 4;
    }),
  );
}

/** A colour unlike the last one. */
function pickColor(rand: () => number, colors: string[], last: number) {
  let ci = Math.floor(rand() * colors.length);
  if (ci === last) ci = (ci + 1 + Math.floor(rand() * (colors.length - 1))) % colors.length;
  return ci;
}

/** A row growing up from the bottom edge: one per slot, at clearly different heights, none touching. */
export function layout(w: number, h: number, seed: number, count: number | undefined, colors: string[]): Sprig[] {
  const rand = rng(seed);
  const n = count ?? Math.max(4, Math.min(7, Math.round(w / 70)));
  const slot = w / n;
  const out: Sprig[] = [];
  const placed: Disc[] = [];
  let lastColor = -1;
  let lastLen = -1;
  for (let i = 0; i < n; i++) {
    const ci = pickColor(rand, colors, lastColor);
    // Try a few shapes until one has room of its own; with none, the slot stays empty.
    for (let attempt = 0; attempt < 30; attempt++) {
      const r = Math.min(21, h * (0.13 + rand() * 0.05));
      // Nudged about in its slot (never a neat row), and every head kept on screen.
      const x = Math.max(h * 0.3, Math.min(w - h * 0.3, slot * (i + 0.5) + (rand() - 0.5) * slot * 0.7));
      const len = Math.min(h * (0.36 + rand() * 0.36), h - r * 1.35);
      // Next-door flowers stand at clearly different heights (a little less strictly if it comes to that).
      if (lastLen >= 0 && Math.abs(len - lastLen) < h * (attempt < 16 ? 0.13 : 0.1)) continue;
      const s = finish(
        {
          x,
          y: h,
          len,
          lean: (rand() - 0.5) * 0.32,
          bend: (rand() - 0.5) * 0.5,
          r,
          color: colors[ci],
          rot: rand() * Math.PI,
          delay: 0.08 * i + rand() * 0.12,
          phase: rand(),
          leaves: twoLeaves(rand, rand() < 0.55 ? 1 : 2, 0.28 + rand() * 0.2),
        },
        rand,
      );
      // Every stem has its leaf (or two), and nothing else.
      if (!s.leaves.length) continue;
      const discs = discsOf(s);
      if (!clearOf(discs, placed)) continue;
      out.push(s);
      placed.push(...discs);
      lastColor = ci;
      lastLen = len;
      break;
    }
  }
  return out;
}

/** How many sprigs come in from each side: always some from both, a third when there's room. */
export function sideCounts(seed: number, h: number): { left: number; right: number } {
  const rand = rng(seed ^ 0x5bd1e995);
  const total = h >= 230 && rand() < 0.6 ? 3 : 2;
  const left = total === 3 && rand() < 0.5 ? 2 : 1;
  return { left, right: total - left };
}

/**
 * Sprigs leaning in from both sides of the screen, low down. Each head gets its own height (high,
 * low or in between, never level with another), the sides take turns growing in, and no sprig
 * touches another. Every head stays fully on screen.
 */
export function sideLayout(w: number, h: number, seed: number, colors: string[]): Sprig[] {
  const rand = rng(seed);
  const { left, right } = sideCounts(seed, h);
  const n = left + right;
  // Head heights, top to bottom: spread over the lower part of the page, a little uneven.
  const top = Math.max(h * 0.2, 34);
  const bottom = h * 0.78;
  const spacing = (bottom - top) / n;
  const wobble = Math.max(0, spacing - 46);
  const heights = Array.from({ length: n }, (_, i) => top + spacing * (i + 0.5) + (rand() - 0.5) * wobble);
  // Which side each height belongs to, shuffled: on one side the higher head is always the first.
  const sides: Array<1 | -1> = [...Array.from({ length: left }, () => 1 as const), ...Array.from({ length: right }, () => -1 as const)];
  for (let i = sides.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [sides[i], sides[j]] = [sides[j], sides[i]];
  }
  const slots = sides.map((dir, i) => ({ dir, hy: heights[i] }));
  // They grow in taking turns: first one side's top flower, then the other's, and so on.
  const firstSide = slots[Math.floor(rand() * n)].dir;
  const mine = slots.filter((sl) => sl.dir === firstSide);
  const theirs = slots.filter((sl) => sl.dir !== firstSide);
  const order: typeof slots = [];
  for (let k = 0; k < Math.max(mine.length, theirs.length); k++) {
    if (mine[k]) order.push(mine[k]);
    if (theirs[k]) order.push(theirs[k]);
  }
  const out: Sprig[] = [];
  const placed: Disc[] = [];
  // Each one its own colour (there are more colours than side flowers).
  const unused = colors.map((_, i) => i);
  order.forEach(({ dir, hy }, i) => {
    const ci = unused.splice(Math.floor(rand() * unused.length), 1)[0] ?? pickColor(rand, colors, -1);
    const x = dir === 1 ? -4 : w + 4;
    for (let attempt = 0; attempt < 40; attempt++) {
      const r = Math.min(17 + rand() * 7, h * 0.14);
      const lean = dir * (0.72 + rand() * 0.5);
      const rise = Math.cos(lean);
      // Short and long, so the heads reach in by different amounts; the base stays low on the edge.
      let len = w * (0.15 + rand() * 0.18);
      const yMax = h * 0.97;
      const yMin = h * 0.42;
      if (hy + rise * len > yMax) len = (yMax - hy) / rise;
      if (hy + rise * len < yMin) len = (yMin - hy) / rise;
      if (len < r * 2.2 || len > w * 0.36) continue;
      const s = finish(
        {
          x,
          y: hy + rise * len,
          len,
          lean,
          bend: dir * (0.3 + rand() * 0.32),
          r,
          color: colors[ci],
          rot: rand() * Math.PI,
          delay: 0.12 * i + rand() * 0.1,
          phase: rand(),
          leaves: twoLeaves(rand, rand() < 0.5 ? 1 : 2, 0.35 + rand() * 0.2),
        },
        rand,
      );
      // Every stem has its leaf (or two), and nothing else.
      if (!s.leaves.length) continue;
      const discs = discsOf(s);
      if (!clearOf(discs, placed)) continue;
      out.push(s);
      placed.push(...discs);
      return;
    }
    // No room for this one: better a flower fewer than two in a heap.
  });
  return out;
}

/**
 * One of the setup screens' stemmed flowers standing in a field, its base at (x, y), its head `r`
 * across: a stem about three heads tall, leaning and bending a little, with a leaf or two.
 */
export function fieldSprig(x: number, y: number, r: number, color: string, rand: () => number): Sprig {
  return finish(
    {
      x,
      y,
      len: r * (2.4 + rand() * 1.5),
      lean: (rand() - 0.5) * 0.32,
      bend: (rand() - 0.5) * 0.5,
      r,
      color,
      rot: rand() * Math.PI,
      delay: 0,
      phase: rand(),
      leaves: twoLeaves(rand, rand() < 0.55 ? 1 : 2, 0.28 + rand() * 0.2),
    },
    rand,
  );
}
