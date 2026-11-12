import { Skia, type SkCanvas, type SkImage, type SkSurface } from '@shopify/react-native-skia';

/*
 * Images drawn away from the screen (the scene, the near flowers, a cloud, a copy of a screenshot).
 *
 * In memory, drawn by the CPU, never on the GPU. A GPU surface made on the JS thread could be let
 * go of by the garbage collector on a thread of its own, breaking the JS thread's GPU context: the
 * app crashed now and then in the middle of drawing one (in surface.flush, on opening and on coming
 * back). An image in memory can be let go of on any thread, and needs no copying back from the GPU.
 *
 * And each size's surface is made once and drawn on again. Skia's canvas (2.14) holds on to its
 * surface, can't be let go of early, and tells the garbage collector it weighs a kilobyte: every
 * surface made for a drawing stayed, pixels and all, until a collection, which seldom came. The sky
 * running through a night made a new scene every 140 ms, and they piled up past a gigabyte. An image
 * taken from a surface shares its pixels until the surface is drawn on again; then the image keeps
 * them and the surface takes fresh ones.
 */

interface Spot {
  surface: SkSurface;
  canvas: SkCanvas;
  used: number;
}

/** Sizes kept: the scene (two sharpnesses), its soft copy, the near flowers, the clouds, mists and motes, the page tops' flowers. */
const MOST = 24;
const spots = new Map<string, Spot>();
let tick = 0;

const keyOf = (w: number, h: number) => `${w}x${h}`;
const size = (n: number) => Math.max(1, Math.ceil(n));

/** An image `width` x `height` pixels, drawn by `draw` on a clear canvas. Null if it can't be made. */
export function drawImage(width: number, height: number, draw: (canvas: SkCanvas) => void): SkImage | null {
  const w = size(width);
  const h = size(height);
  const key = keyOf(w, h);
  let spot = spots.get(key);
  if (!spot) {
    const surface = Skia.Surface.Make(w, h);
    if (!surface) return null;
    spot = { surface, canvas: surface.getCanvas(), used: 0 };
    spots.set(key, spot);
    if (spots.size > MOST) {
      // The size used longest ago goes (to the garbage collector, with its canvas).
      let oldest: string | null = null;
      for (const [k, s] of spots) if (k !== key && (!oldest || s.used < spots.get(oldest)!.used)) oldest = k;
      if (oldest) forget(oldest);
    }
  }
  spot.used = ++tick;
  const { canvas } = spot;
  canvas.save();
  canvas.clear(Skia.Color('transparent'));
  try {
    draw(canvas);
  } finally {
    canvas.restore();
  }
  return spot.surface.makeImageSnapshot();
}

function forget(key: string) {
  const spot = spots.get(key);
  if (!spot) return;
  spots.delete(key);
  spot.surface.dispose();
}

/** Done with drawings this size for now (a screenshot's copies): its surface is let go of. */
export function forgetSize(width: number, height: number) {
  forget(keyOf(size(width), size(height)));
}
