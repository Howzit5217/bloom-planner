import { Skia, type SkPath, type SkPathBuilder } from '@shopify/react-native-skia';

export { rng } from './random';

// The app's flowers are flat and friendly, like Pikmin Bloom's: five round petals and a round
// golden centre, no outlines or shading. A petal is a circle 0.43 R across-radius, its centre
// 0.57 R out, so petals just reach R and overlap their neighbours.
export const PETAL_D = 0.57;
export const PETAL_R = 0.43;
export const CENTRE_R = 0.33;
export const CENTRE_COLOR = '#FFB400';

const K = 0.5523; // cubic Bezier circle constant

/**
 * The path a builder has made, the builder let go of at once. A field draws thousands of these
 * every time the sky changes, and the garbage collector, told each is tiny, left them all lying
 * about (hundreds of megabytes after the sky ran through a night).
 */
export function built(b: SkPathBuilder): SkPath {
  const p = b.build();
  b.dispose();
  return p;
}

function addCircle(b: ReturnType<typeof Skia.PathBuilder.Make>, x: number, y: number, r: number) {
  // Four cubics from the top, clockwise: the same command structure for every circle, so paths
  // built from circles morph cleanly.
  b.moveTo(x, y - r);
  b.cubicTo(x + r * K, y - r, x + r, y - r * K, x + r, y);
  b.cubicTo(x + r, y + r * K, x + r * K, y + r, x, y + r);
  b.cubicTo(x - r * K, y + r, x - r, y + r * K, x - r, y);
  b.cubicTo(x - r, y - r * K, x - r * K, y - r, x, y - r);
  b.close();
}

/**
 * A flower of `petals` round petals around (cx, cy), reaching r. open = 0 is a closed bud at the
 * top, open = 1 is fully bloomed; every `open` has the same structure, so paths interpolate.
 */
export function flowerPath(cx: number, cy: number, r: number, open: number, petals = 5, rotation = 0): SkPath {
  const b = Skia.PathBuilder.Make();
  const o = Math.min(1, Math.max(0, open));
  const spread = Math.min(1, 5 / petals);
  for (let i = 0; i < petals; i++) {
    const openA = rotation + (i / petals) * Math.PI * 2;
    const budA = (i - (petals - 1) / 2) * 0.22;
    const a = budA + (openA - budA) * o;
    const d = r * (0.3 + (PETAL_D - 0.3) * o);
    const pr = r * (0.2 + (PETAL_R * spread + (1 - spread) * 0.3 - 0.2) * o);
    addCircle(b, cx + Math.sin(a) * d, cy - Math.cos(a) * d, pr);
  }
  return built(b);
}

/** One round petal of a flower of radius `len` centred at (0,0), pointing up. */
export function petalShape(len: number): SkPath {
  const b = Skia.PathBuilder.Make();
  addCircle(b, 0, -len * PETAL_D, len * PETAL_R);
  return built(b);
}

/** A single round petal centred on (0,0), `size` across: for drifting particles. */
export function petalPath(size: number): SkPath {
  const b = Skia.PathBuilder.Make();
  const rx = size * 0.42;
  const ry = size * 0.5;
  b.moveTo(0, -ry);
  b.cubicTo(rx * K, -ry, rx, -ry * K, rx, 0);
  b.cubicTo(rx, ry * K, rx * K, ry, 0, ry);
  b.cubicTo(-rx * K, ry, -rx, ry * K, -rx, 0);
  b.cubicTo(-rx, -ry * K, -rx * K, -ry, 0, -ry);
  return built(b.close());
}

/** A plump leaf pointing right from (0,0), rounder on its upper side, with a soft point. */
export function leafPath(len: number, wid: number): SkPath {
  return built(
    Skia.PathBuilder.Make()
      .moveTo(0, 0)
      .cubicTo(len * 0.18, -wid * 1.25, len * 0.72, -wid * 1.2, len, 0)
      .cubicTo(len * 0.72, wid * 0.85, len * 0.2, wid * 0.85, 0, 0)
      .close(),
  );
}

/**
 * A filled stem along the curve (x0,y0) -> control (cx,cy) -> (x1,y1), w0 wide at the base and w1 at
 * the top, with round ends: a shape with body rather than a line.
 */
export function stemPath(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w0: number, w1: number): SkPath {
  const N = 14;
  const pt = (t: number) => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1] as const;
  const tan = (t: number) => {
    const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
    const dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l] as const;
  };
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [px, py] = pt(t);
    const [tx, ty] = tan(t);
    const hw = (w0 + (w1 - w0) * t) / 2;
    left.push([px - ty * hw, py + tx * hw]);
    right.push([px + ty * hw, py - tx * hw]);
  }
  const b = Skia.PathBuilder.Make().moveTo(left[0][0], left[0][1]);
  for (let i = 1; i <= N; i++) b.lineTo(left[i][0], left[i][1]);
  // Round top.
  b.arcToTangent(x1 + tan(1)[0] * w1 * 0.5, y1 + tan(1)[1] * w1 * 0.5, right[N][0], right[N][1], w1 / 2);
  for (let i = N; i >= 0; i--) b.lineTo(right[i][0], right[i][1]);
  return built(b.close());
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
    return built(b.close());
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
  return built(b.close());
}

/** Mix two #RRGGBB colours: t = 0 is a, t = 1 is b. */
export function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => {
    const x = h.replace('#', '');
    const v = x.length === 3 ? x.split('').map((ch) => ch + ch).join('') : x.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };
  const [ra, ga, ba] = p(a);
  const [rb, gb, bb] = p(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * Math.min(1, Math.max(0, t)))
    .toString(16)
    .padStart(2, '0');
  return `#${m(ra, rb)}${m(ga, gb)}${m(ba, bb)}`;
}
