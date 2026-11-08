import { ClipOp, Skia, type SkCanvas, type SkImage, type SkRect, type SkRSXform } from '@shopify/react-native-skia';
import { Platform } from 'react-native';
import { geometry, headOf, type Sprig } from './sprigLayout';

/**
 * The near flowers in one image (an atlas), so a frame is one draw of it that places, tilts and
 * sways every flower: drawing them as pictures took hundreds of shapes a frame, all at new angles.
 */
export interface Near {
  atlas: SkImage;
  /** Each flower's spot in the image, in pixels. */
  sprites: SkRect[];
  /** Five numbers a flower: its base on the ground (scene points), its sway's phase, and its base in its spot (pixels). */
  spots: number[];
  /** Where each flower goes this frame: set afresh each frame on the UI thread (drawing copies them). */
  xforms: SkRSXform[];
  /** Image pixels a point. */
  scale: number;
}

/**
 * The near flowers drawn once into one image, each in its own spot (`scale` pixels a point), packed
 * in rows tallest first. Each is lit where it stands; its sway and the camera's tilt come later, as
 * it's drawn. Null if it can't be made (the flowers are then drawn still, in place).
 */
export function nearAtlas(sprigs: Sprig[], paint: (cv: SkCanvas, s: Sprig) => void, scale: number): Near | null {
  if (!sprigs.length) return null;
  const ROW = 2048;
  const GAP = 2;
  // Each flower's box about its base: the head at the top of the stem, the leaves out to the sides.
  const boxes = sprigs.map((s) => {
    const g = geometry(s);
    const head = headOf(s) * 1.25 + 1;
    const side = Math.max(head, s.r * 2.4) + 1;
    const x0 = Math.min(0, g.ctrl.x, g.top.x) - side;
    const x1 = Math.max(0, g.ctrl.x, g.top.x) + side;
    const y0 = Math.min(g.ctrl.y, g.top.y) - head;
    const y1 = s.r * 0.6 + 1;
    return { x0, y0, w: Math.ceil((x1 - x0) * scale), h: Math.ceil((y1 - y0) * scale) };
  });
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[b].h - boxes[a].h);
  const at: Array<{ x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let row = 0;
  let width = 0;
  for (const i of order) {
    const b = boxes[i];
    if (x > 0 && x + b.w > ROW) {
      x = 0;
      y += row + GAP;
      row = 0;
    }
    at[i] = { x, y };
    x += b.w + GAP;
    width = Math.max(width, x);
    row = Math.max(row, b.h);
  }
  const height = y + row;
  if (width > 4096 || height > 4096) return null;
  try {
    const surface = Platform.OS === 'web' ? Skia.Surface.Make(width, height) : Skia.Surface.MakeOffscreen(width, height);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    const sprites = sprigs.map((s, i) => {
      const b = boxes[i];
      const spot = Skia.XYWHRect(at[i].x, at[i].y, b.w, b.h);
      canvas.save();
      canvas.clipRect(spot, ClipOp.Intersect, true);
      canvas.translate(at[i].x - b.x0 * scale, at[i].y - b.y0 * scale);
      canvas.scale(scale, scale);
      // Drawn where it stands, so it's lit as it is there.
      canvas.translate(-s.x, -s.y);
      paint(canvas, s);
      canvas.restore();
      return spot;
    });
    surface.flush();
    const atlas = surface.makeImageSnapshot().makeNonTextureImage();
    surface.dispose();
    if (!atlas) return null;
    return {
      atlas,
      sprites,
      spots: sprigs.flatMap((s, i) => [s.x, s.y, s.phase, -boxes[i].x0 * scale, -boxes[i].y0 * scale]),
      xforms: sprigs.map(() => Skia.RSXform(1, 0, 0, 0)),
      scale,
    };
  } catch {
    return null;
  }
}
