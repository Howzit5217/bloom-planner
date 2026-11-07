import { createPicture, Group, PaintStyle, Picture, Skia, StrokeCap, type SkPicture } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rng } from './random';

/**
 * Rain or snow falling over the scene, live. Each sheet is one picture of drops (drawn once) that
 * slides down and wraps round, so a frame is a few picture draws, however many drops there are.
 * Far sheets fall slower, thinner and fainter than near ones, which gives the fall some depth.
 */

interface Sheet {
  /** Points a millisecond. */
  speed: number;
  /** Drops per square point. */
  per: number;
  /** Rain: streak length and width. Snow: flake radius. */
  len: number;
  width: number;
  alpha: number;
  /** Snow only: how far a sheet drifts side to side, and how slowly. */
  drift?: number;
  driftMs?: number;
}

// At about 30 frames a second a drop moves about its own length a frame, so it reads as a fall.
const RAIN: Sheet[] = [
  { speed: 0.42, per: 1 / 5200, len: 11, width: 1.1, alpha: 0.2 },
  { speed: 0.62, per: 1 / 6800, len: 16, width: 1.4, alpha: 0.3 },
  { speed: 0.85, per: 1 / 11000, len: 23, width: 1.8, alpha: 0.42 },
];
/** A storm's rain: more of it, a little faster. */
const STORM = RAIN.map((s) => ({ ...s, speed: s.speed * 1.2, per: s.per * 1.7 }));
const SNOW: Sheet[] = [
  { speed: 0.022, per: 1 / 4200, len: 1.2, width: 0, alpha: 0.55, drift: 10, driftMs: 5200 },
  { speed: 0.035, per: 1 / 6000, len: 1.9, width: 0, alpha: 0.7, drift: 14, driftMs: 6800 },
  { speed: 0.05, per: 1 / 9000, len: 2.7, width: 0, alpha: 0.85, drift: 18, driftMs: 8600 },
];
/** Hail: small white stones falling fast and nearly straight, the near ones bigger. */
const HAIL: Sheet[] = [
  { speed: 0.75, per: 1 / 9000, len: 1.1, width: 0, alpha: 0.55 },
  { speed: 1, per: 1 / 12000, len: 1.6, width: 0, alpha: 0.75 },
  { speed: 1.3, per: 1 / 18000, len: 2.3, width: 0, alpha: 0.9 },
];
/** Rain leans: across this much for every point it falls (snow falls straight, and drifts). */
const RAIN_SLANT = 0.26;

export type Fall = 'rain' | 'storm' | 'snow' | 'hail';

/**
 * Light, moderate and heavy (level 1 to 3): how many drops or flakes there are, how big, how fast
 * and how bold they fall, and how much the rain leans (more in a downpour's wind).
 */
const LEVELS = {
  rain: [
    { per: 0.4, speed: 0.85, len: 0.75, alpha: 0.75, slant: 0.7 },
    { per: 1, speed: 1, len: 1, alpha: 1, slant: 1 },
    { per: 2, speed: 1.2, len: 1.3, alpha: 1.15, slant: 1.35 },
  ],
  snow: [
    { per: 0.4, speed: 0.85, len: 0.85, alpha: 0.85, slant: 0 },
    { per: 1, speed: 1, len: 1, alpha: 1, slant: 0 },
    { per: 2.3, speed: 1.2, len: 1.25, alpha: 1, slant: 0 },
  ],
} as const;

/** One sheet's drops over a w x h tile; the tile repeats top to bottom with no seam. */
function drawSheet(kind: Fall, s: Sheet, w: number, h: number, seed: number): SkPicture {
  const rand = rng(seed);
  const n = Math.round(w * h * s.per);
  return createPicture(
    (canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setColor(Skia.Color(kind === 'snow' ? '#FFFFFF' : kind === 'hail' ? '#F4F7FF' : '#E4ECFF'));
      paint.setAlphaf(s.alpha);
      if (kind !== 'snow' && kind !== 'hail') {
        paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeCap(StrokeCap.Round);
        paint.setStrokeWidth(s.width);
      }
      for (let i = 0; i < n; i++) {
        const x = rand() * w;
        const y = rand() * h;
        // Drawn twice where it crosses the tile's bottom, so the next tile carries it on.
        for (const dy of y + s.len > h ? [0, -h] : [0]) {
          if (kind === 'snow' || kind === 'hail') canvas.drawCircle(x, y + dy, s.len * (0.7 + rand() * 0.6), paint);
          else canvas.drawLine(x, y + dy, x, y + dy + s.len, paint);
        }
      }
    },
    Skia.XYWHRect(0, -s.len, w, h + s.len * 2),
  );
}

function FallingSheet({ picture, s, h, clock, slant, phase }: { picture: SkPicture; s: Sheet; h: number; clock: SharedValue<number>; slant: number; phase: number }) {
  // Falling straight down in the tile's own space; the slant turns it into a slanting fall.
  const transform = useDerivedValue(() => {
    const t = clock.value;
    const off = (t * s.speed + phase * h) % h;
    const sway = s.drift ? Math.sin((t / (s.driftMs ?? 6000) + phase) * Math.PI * 2) * s.drift : 0;
    return [{ translateX: sway }, { translateY: off }];
  });
  return (
    <Group matrix={[1, -slant, 0, 0, 1, 0, 0, 0, 1]}>
      <Group transform={transform}>
        <Picture picture={picture} />
        <Group transform={[{ translateY: -h }]}>
          <Picture picture={picture} />
        </Group>
      </Group>
    </Group>
  );
}

/**
 * Rain, a storm's heavier rain, snow or hail over a `width` x `height` view, light, moderate or heavy
 * (`level` 1 to 3), moving with `clock` (a time in milliseconds; held still, the drops hang where
 * they are, as for reduced motion). The rain leans more the windier it is (`wind`, km/h).
 */
export function Precipitation({ kind, level = 2, width, height, clock, wind = 0 }: { kind: Fall; level?: number; width: number; height: number; clock: SharedValue<number>; wind?: number }) {
  const how = LEVELS[kind === 'snow' ? 'snow' : 'rain'][Math.max(1, Math.min(3, level)) - 1];
  const base = kind === 'snow' ? SNOW : kind === 'hail' ? HAIL : kind === 'storm' ? STORM : RAIN;
  const sheets = useMemo(() => base.map((s) => ({ ...s, per: s.per * how.per, speed: s.speed * how.speed, len: s.len * how.len, width: s.width * Math.sqrt(how.len), alpha: Math.min(0.95, s.alpha * how.alpha) })), [base, how]);
  const slant = kind === 'snow' ? 0 : RAIN_SLANT * how.slant * (kind === 'hail' ? 0.4 : 1) * (0.8 + Math.min(1.5, wind / 30));
  // Wide enough that, leaning, the drops still reach both edges (and snow's drift too).
  const tileW = width + slant * height + 40;
  const pictures = useMemo(() => sheets.map((s, i) => drawSheet(kind, s, tileW, height, 7919 * (i + 1))), [kind, sheets, tileW, height]);
  return (
    <Group transform={[{ translateX: -20 }]}>
      {sheets.map((s, i) => (
        <FallingSheet key={i} picture={pictures[i]} s={s} h={height} clock={clock} slant={slant} phase={i * 0.37} />
      ))}
    </Group>
  );
}

/** What falls from a sky look, if anything. */
export const fallOf = (look: { rain: boolean; snow: boolean; weather: string }): Fall | null => (look.snow ? 'snow' : look.rain ? (look.weather === 'storm' ? 'storm' : 'rain') : null);
