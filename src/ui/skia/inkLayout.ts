import { Skia, type SkFont } from '@shopify/react-native-skia';

/** One glyph's ink: where it starts and how wide it is from its drawing origin, and its weight. */
interface GlyphInk {
  left: number;
  width: number;
  /** Across the glyph's filled shape, its balance point from the origin (null where shapes can't be had: the web). */
  mass: number | null;
  area: number;
}

const inkCache = new WeakMap<SkFont, Map<string, GlyphInk>>();

/** A contour's points, its curves walked at a few points each: enough for its area and balance point. */
function contours(font: SkFont, ch: string): number[][][] | null {
  let path;
  try {
    path = Skia.Path.MakeFromText(ch, 0, 0, font);
  } catch {
    return null;
  }
  if (!path) return null;
  const out: number[][][] = [];
  let at = [0, 0];
  const quad = (x1: number, y1: number, x2: number, y2: number, t: number) => {
    const u = 1 - t;
    return [u * u * at[0] + 2 * u * t * x1 + t * t * x2, u * u * at[1] + 2 * u * t * y1 + t * t * y2];
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, t: number) => {
    const u = 1 - t;
    return [u * u * u * at[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * at[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3];
  };
  for (const c of path.toCmds()) {
    const cur = out[out.length - 1];
    if (c[0] === 0) {
      at = [c[1], c[2]];
      out.push([at]);
    } else if (c[0] === 1) {
      at = [c[1], c[2]];
      cur?.push(at);
    } else if (c[0] === 2 || c[0] === 3) {
      // A conic is close enough to a quad for this.
      for (const t of [0.25, 0.5, 0.75]) cur?.push(quad(c[1], c[2], c[3], c[4], t));
      at = [c[3], c[4]];
      cur?.push(at);
    } else if (c[0] === 4) {
      for (const t of [0.25, 0.5, 0.75]) cur?.push(cubic(c[1], c[2], c[3], c[4], c[5], c[6], t));
      at = [c[5], c[6]];
      cur?.push(at);
    }
  }
  return out;
}

function glyphInk(font: SkFont, ch: string): GlyphInk {
  let byChar = inkCache.get(font);
  if (!byChar) {
    byChar = new Map();
    inkCache.set(font, byChar);
  }
  const known = byChar.get(ch);
  if (known) return known;
  const b = font.measureText(ch);
  let mass: number | null = null;
  let area = b.width * b.height;
  const cs = contours(font, ch);
  if (cs) {
    // Signed areas: a hole winds the other way, so it takes its share back out.
    let a = 0;
    let mx = 0;
    for (const pts of cs) {
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        const cross = x1 * y2 - x2 * y1;
        a += cross / 2;
        mx += ((x1 + x2) * cross) / 6;
      }
    }
    if (Math.abs(a) > 1e-6) {
      mass = mx / a;
      area = Math.abs(a);
    }
  }
  const ink = { left: b.x, width: b.width, mass, area };
  byChar.set(ch, ink);
  return ink;
}

export interface InkRun {
  /** Each glyph's drawing origin, with the run's ink starting at 0. */
  glyphs: Array<{ ch: string; x: number }>;
  /** The ink's whole width. */
  width: number;
  /**
   * Where the run looks centred, from its left: halfway between the middle of its ink and its
   * balance point, so a number with a 1 in it doesn't look pushed to one side.
   */
  centre: number;
}

/**
 * Lays text out by each glyph's own ink, `gap` apart, so a 1 takes less room than an 8 (never a
 * fixed width for every digit) and the spacing looks even.
 */
export function inkRun(text: string, font: SkFont, gap: number): InkRun {
  const glyphs: InkRun['glyphs'] = [];
  let cursor = 0;
  let weight = 0;
  let moment = 0;
  let massKnown = true;
  for (const ch of text) {
    const ink = glyphInk(font, ch);
    const x = cursor - ink.left;
    glyphs.push({ ch, x });
    if (ink.mass == null) massKnown = false;
    else {
      weight += ink.area;
      moment += ink.area * (x + ink.mass);
    }
    cursor += ink.width + gap;
  }
  const width = Math.max(0, cursor - gap);
  const middle = width / 2;
  const centre = massKnown && weight > 0 ? (middle + moment / weight) / 2 : middle;
  return { glyphs, width, centre };
}

/** The usual space between two glyphs' ink in this face: the room either side of a 0. */
export function inkGap(font: SkFont): number {
  const b = font.measureText('0');
  try {
    const ids = font.getGlyphIDs('0');
    const advance = font.getGlyphWidths(ids)[0];
    if (advance > b.width) return advance - b.width;
  } catch {
    // Not every platform gives glyph widths.
  }
  return b.width * 0.08;
}
