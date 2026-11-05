import { Skia, type SkPath } from '@shopify/react-native-skia';

/**
 * A flower with `petals` teardrop petals around (cx, cy).
 * open = 0 is a closed bud pointing up, open = 1 is fully bloomed. Paths for any `open`
 * share the same command structure, so they interpolate cleanly (path morph).
 */
export function flowerPath(cx: number, cy: number, r: number, open: number, petals = 5, rotation = 0): SkPath {
  const b = Skia.PathBuilder.Make();
  const o = Math.min(1, Math.max(0, open));
  for (let i = 0; i < petals; i++) {
    const openA = rotation - Math.PI / 2 + (i / petals) * Math.PI * 2;
    const budA = -Math.PI / 2 + (i - (petals - 1) / 2) * 0.16;
    const a = budA + (openA - budA) * o;
    const len = r * (0.62 + 0.38 * o);
    const wid = len * (0.2 + 0.42 * o);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const px = -dy;
    const py = dx;
    const P = (along: number, side: number) => [cx + dx * len * along + px * wid * side, cy + dy * len * along + py * wid * side] as const;
    const [c1x, c1y] = P(0.3, 1);
    const [c2x, c2y] = P(1.02, 0.8);
    const [tx, ty] = P(1, 0);
    const [c3x, c3y] = P(1.02, -0.8);
    const [c4x, c4y] = P(0.3, -1);
    b.moveTo(cx, cy);
    b.cubicTo(c1x, c1y, c2x, c2y, tx, ty);
    b.cubicTo(c3x, c3y, c4x, c4y, cx, cy);
    b.close();
  }
  return b.build();
}

/** A single petal pointing up from (0,0), for particles. */
export function petalPath(size: number): SkPath {
  const s = size;
  return Skia.PathBuilder.Make()
    .moveTo(0, s * 0.5)
    .cubicTo(s * 0.55, s * 0.2, s * 0.45, -s * 0.45, 0, -s * 0.5)
    .cubicTo(-s * 0.45, -s * 0.45, -s * 0.55, s * 0.2, 0, s * 0.5)
    .close()
    .build();
}

/** A leaf pointing right from (0,0). */
export function leafPath(len: number, wid: number): SkPath {
  return Skia.PathBuilder.Make()
    .moveTo(0, 0)
    .cubicTo(len * 0.3, -wid, len * 0.8, -wid * 0.8, len, 0)
    .cubicTo(len * 0.8, wid * 0.8, len * 0.3, wid, 0, 0)
    .close()
    .build();
}

/** Regular hexagon, pointy top. */
export function hexPath(cx: number, cy: number, r: number, round = 0): SkPath {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const b = Skia.PathBuilder.Make();
  if (round <= 0) {
    b.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i++) b.lineTo(pts[i].x, pts[i].y);
    return b.close().build();
  }
  const mid = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const start = mid(pts[5], pts[0]);
  b.moveTo(start.x, start.y);
  for (let i = 0; i < 6; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % 6];
    const m = mid(p, q);
    b.arcToTangent(p.x, p.y, m.x, m.y, round);
  }
  return b.close().build();
}

/** Seeded PRNG so meadows look the same every render. */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
