import { ClipOp, Skia, type SkCanvas } from '@shopify/react-native-skia';
import { mix, type SkyLook } from '@/engine/sky';

/** Where a cloud's flat base sits, in its sizes below its middle. */
const BASE = 0.12;

/** How the clouds are lit in a sky: the same for all of them. */
export interface CloudLight {
  /** The puffs' tops, toward the light. */
  lit: string;
  /** The body below them. */
  fill: string;
  /** The underside showing below the base. */
  shade: string;
  /** Where the light comes from across (-1 left to 1 right). */
  lean: number;
  /** How covered the sky is: wider, flatter clouds the more it is. */
  veil: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The light on the clouds: from the sun where it is, the moon by night, from everywhere under a
 * covered sky. Lit white by day, gold to pink round sunrise and sunset (the sky's cloud color),
 * slate at night, with blue-gray shade from the sky.
 */
export function cloudLight(look: SkyLook): CloudLight {
  const sun = look.sun && look.veil < 0.6 ? look.sun : null;
  const moon = !sun && look.moon && look.moon.altitude > 0 && look.veil < 0.6 ? look.moon : null;
  const from = sun ?? moon;
  const night = look.night;
  const shade = mix(mix(look.cloudColor, mix('#7E8CA0', '#1E2440', night), 0.5), look.mid, 0.25);
  const moonlit = moon ? 0.25 * moon.fraction : 0;
  return {
    lit: mix(mix(look.cloudColor, '#AEB6CC', moonlit * night), '#FFFFFF', 0.75 * (1 - night) * (1 - 0.5 * look.veil)),
    fill: mix(look.cloudColor, shade, 0.22),
    shade,
    lean: from && look.veil < 0.5 ? clamp((from.x - 0.5) * 2.2, -1, 1) : 0,
    veil: look.veil,
  };
}

/**
 * A cartoon cloud, flat like the game's: round puffs heaped on a flat base, the puffs' tops lit, a
 * soft gray scallop under each, and the darker underside showing below. Its middle is at (`x`, `y`)
 * and `s` its size; its build comes from `rand`, so each cloud is its own: long and low or tall and
 * heaped, its peak off to one side or the other, now and then a smaller puff on its shoulder. Under
 * a covered sky they're wider and flatter. It stays within CLOUD_BOUNDS (Meadow.tsx).
 */
export function cartoonCloud(canvas: SkCanvas, x: number, y: number, s: number, rand: () => number, light: CloudLight) {
  const base = y + BASE * s;
  const wide = Math.min(1.5, (0.8 + rand() * 0.45) * (1 + 0.35 * light.veil));
  const tall = (0.8 + rand() * 0.35) * (1 - 0.25 * light.veil);
  const peak = (rand() - 0.5) * 0.8;
  const n = 3 + Math.floor(rand() * 2) + (wide > 1.05 ? 1 : 0);
  const puffs: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1 + (rand() - 0.5) * 0.2;
    // Biggest at the peak, small toward the ends, so it never stands like a box.
    const dome = Math.max(0.1, 1 - (t - peak) * (t - peak) * 0.55);
    const r = s * (0.2 + 0.3 * dome * tall + rand() * 0.05);
    // Each sits on the base (the highest a little up off it), none hanging below.
    puffs.push({ x: x + t * s * wide * 0.8, y: base - r - dome * tall * s * 0.08, r });
  }
  const top = puffs.reduce((a, b) => (b.r > a.r ? b : a));
  if (rand() < 0.45) {
    const side = rand() < 0.5 ? -1 : 1;
    puffs.push({ x: top.x + side * top.r * 0.6, y: top.y - top.r * 0.25, r: top.r * (0.5 + rand() * 0.12) });
  }
  // The flat base: a band along the bottom, from under the first puff to under the last.
  const xs = puffs.map((p) => p.x);
  const band = s * 0.34;
  const shape = Skia.PathBuilder.Make().addRRect(Skia.RRectXY(Skia.XYWHRect(Math.min(...xs), base - band, Math.max(...xs) - Math.min(...xs), band), band / 2, band / 2));
  for (const p of puffs) shape.addCircle(p.x, p.y, p.r);
  const body = shape.build();

  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  // The underside, showing a little below the base.
  const under = shape.offset(0, s * 0.09).build();
  paint.setColor(Skia.Color(light.shade));
  canvas.drawPath(under, paint);
  paint.setColor(Skia.Color(light.fill));
  canvas.drawPath(body, paint);
  // The lit tops: each puff again, a little smaller, up and toward the light, inside the cloud.
  canvas.save();
  canvas.clipPath(body, ClipOp.Intersect, true);
  paint.setColor(Skia.Color(light.lit));
  for (const p of puffs) canvas.drawCircle(p.x + light.lean * p.r * 0.12, p.y - p.r * 0.14, p.r * 0.86, paint);
  canvas.restore();
}
