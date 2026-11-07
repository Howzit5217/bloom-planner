import { ClipOp, Skia, type SkCanvas } from '@shopify/react-native-skia';
import { mix, type SkyLook } from '@/engine/sky';

/** Where a cloud's flat base sits, in its sizes below its middle. */
const BASE = 0.12;
/** How deep the shaded underside is, in the cloud's sizes. */
const BELLY = 0.11;

/** How the clouds are lit in a sky: the same for all of them. */
export interface CloudLight {
  /** The cloud itself. */
  lit: string;
  /** Its underside, a band along the bottom in the sky's shade. */
  belly: string;
  /** How covered the sky is: wider, flatter clouds the more it is. */
  veil: number;
}

/**
 * The light on the clouds: a warm white by day (the cards' white, a touch of the sky in it), gold to
 * pink round sunrise and sunset (the sky's cloud colour), slate at night, more gray the more the sky
 * is covered; the underside in a blue-gray from the sky.
 */
export function cloudLight(look: SkyLook): CloudLight {
  const moon = look.moon && look.moon.altitude > 0 && look.veil < 0.6 ? look.moon : null;
  const night = look.night;
  const shade = mix(mix(look.cloudColor, mix('#8EA6C8', '#1E2440', night), 0.55), look.mid, 0.25);
  const moonlit = moon ? 0.25 * moon.fraction : 0;
  const lit = mix(mix(look.cloudColor, '#AEB6CC', moonlit * night), '#FFFDF6', 0.75 * (1 - night) * (1 - 0.5 * look.veil));
  return { lit, belly: mix(lit, shade, 0.5), veil: look.veil };
}

/**
 * A cloud drawn flat, like the app's other shapes: one smooth outline of round bumps rising from a
 * flat base to a peak (off to one side or the other) and stepping down again to its rounded ends, in
 * one colour, with a band of shade along its underside. Its middle is at (`x`, `y`) and `s` its
 * size; its build comes from `rand`, so each cloud is its own: long and low or short and heaped.
 * Under a covered sky they're wider and flatter. It stays within CLOUD_BOUNDS (Meadow.tsx).
 */
export function cartoonCloud(canvas: SkCanvas, x: number, y: number, s: number, rand: () => number, light: CloudLight) {
  const base = y + BASE * s;
  const wide = Math.min(1.45, (0.8 + rand() * 0.5) * (1 + 0.3 * light.veil));
  const tall = (0.85 + rand() * 0.3) * (1 - 0.2 * light.veil);
  const peak = (rand() - 0.5) * 0.8;
  // More bumps the longer it is, so it never reads as a row of beads or a single blob.
  const n = wide < 0.95 ? 4 : wide < 1.2 ? 5 : 6;
  const half = s * wide * 0.8;
  const foot = s * 0.17;
  // The highest bump, never so big for the cloud's length that it stands up like a ball.
  const top = Math.min(s * (0.42 + 0.14 * tall), half * 0.62);
  const shape = Skia.PathBuilder.Make().addRRect(Skia.RRectXY(Skia.XYWHRect(x - half, base - foot * 2, half * 2, foot * 2), foot, foot));
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1 + (i > 0 && i < n - 1 ? (rand() - 0.5) * 0.12 : 0);
    const dome = Math.pow(Math.max(0, 1 - ((t - peak) / 1.25) ** 2), 0.8);
    const r = (foot * 1.15 + (top - foot * 1.15) * dome) * (0.92 + rand() * 0.16);
    // Each sits on the base (the highest a little up off it), none hanging below it.
    shape.addCircle(x + t * (half - r * 0.8), base - r - foot * 0.25 * dome, r);
  }
  const body = shape.build();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  // The underside: the whole cloud in shade, then the cloud again a little higher over it, so only a
  // band along the bottom (and up its rounded ends) stays in shade.
  paint.setColor(Skia.Color(light.belly));
  canvas.drawPath(body, paint);
  canvas.save();
  canvas.clipPath(body, ClipOp.Intersect, true);
  paint.setColor(Skia.Color(light.lit));
  canvas.drawPath(shape.offset(0, -s * BELLY).build(), paint);
  canvas.restore();
}
