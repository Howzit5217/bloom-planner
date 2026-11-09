import { Canvas, createPicture, Picture, Skia, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';
import { CENTRE_COLOR, CENTRE_R, flowerPath, mixHex, rng } from './shapes';

/** One petal or flower of a burst: thrown out from the button, slowed by the air, then drifting down. */
interface Bit {
  flower: boolean;
  /** Where it leaves from, beside the burst's origin. */
  x0: number;
  y0: number;
  /** How fast it's thrown (points a second), how quickly the air slows it (per second), and how fast it then falls. */
  vx: number;
  vy: number;
  drag: number;
  fall: number;
  /** Once slowed it flutters side to side: how far, how fast (radians a second), and from where. */
  sway: number;
  swayW: number;
  phase: number;
  /** Its turn to begin with, how fast it turns, and how fast it tumbles over (radians a second). */
  rot: number;
  spin: number;
  flip: number;
  /** Seconds after the tap it leaves, and how many it lasts. */
  delay: number;
  life: number;
  /** A petal's length or a flower's radius. */
  size: number;
  front: string;
  /** A petal's other side, a touch deeper, shown as it tumbles over. */
  back: string;
  /** White ones get a faint darker copy just under them, so they read on a white card. */
  under: string | null;
}

/** How many steps a flower's opening is drawn in, from bud to full bloom. */
const STAGES = 24;
/** A flower opens over this many seconds once thrown. */
const OPEN_S = 0.45;
/** Where a petal or flower starts to fade, as a share of its life. */
const FADE_FROM = 0.62;

/**
 * A petal's other side: the same hue a little deeper and richer (darkening alone turned the yellow
 * a muddy mustard).
 */
function deeper(hex: string): string {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const hi = Math.max(...v);
  const lo = Math.min(...v);
  const l = (hi + lo) / 2;
  const d = hi - lo;
  if (d === 0) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = hi === v[0] ? ((v[1] - v[2]) / d + 6) % 6 : hi === v[1] ? (v[2] - v[0]) / d + 2 : (v[0] - v[1]) / d + 4;
  const l2 = l - 0.08;
  const s2 = Math.min(1, s + 0.06);
  const c2 = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c2 * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c2, x, 0] : h < 2 ? [x, c2, 0] : h < 3 ? [0, c2, x] : h < 4 ? [0, x, c2] : h < 5 ? [x, 0, c2] : [c2, 0, x];
  const m = l2 - c2 / 2;
  return `#${[r, g, b].map((ch) => Math.round((ch + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** A petal one point long, centred: round at its tip and narrowing to where it grew. */
function petalUnit(): SkPath {
  const w = 0.39;
  const b = Skia.PathBuilder.Make();
  b.moveTo(0, 0.5);
  b.cubicTo(w * 0.55, 0.42, w, 0.14, w, -0.12);
  b.cubicTo(w, -0.36, w * 0.56, -0.5, 0, -0.5);
  b.cubicTo(-w * 0.56, -0.5, -w, -0.36, -w, -0.12);
  b.cubicTo(-w, 0.14, -w * 0.55, 0.42, 0, 0.5);
  return b.close().build();
}

function makeBits(seed: number, reach: number, colors: string[], white: string): Bit[] {
  const rand = rng(seed);
  const bits: Bit[] = [];
  const shades = (front: string) => {
    const isWhite = front === white;
    return { front, back: isWhite ? '#ECE5D9' : deeper(front), under: isWhite ? mixHex(front, '#8A7A5C', 0.35) : null };
  };
  const petals = 14 + Math.floor(rand() * 4);
  for (let i = 0; i < petals; i++) {
    // A fan from up-left to up-right, spread evenly with a little give.
    const a = ((i + 0.5) / petals - 0.5) * 2.1 + (rand() - 0.5) * 0.25;
    const drag = 3.4 + rand() * 1.2;
    const v = reach * (0.5 + rand() * 0.5) * drag;
    bits.push({
      flower: false,
      x0: (rand() - 0.5) * 36,
      y0: (rand() - 0.5) * 8,
      vx: Math.sin(a) * v,
      vy: -Math.cos(a) * v,
      drag,
      fall: 34 + rand() * 26,
      sway: 7 + rand() * 9,
      swayW: 2.6 + rand() * 1.8,
      phase: rand() * Math.PI * 2,
      rot: a + (rand() - 0.5) * 0.8,
      spin: (rand() < 0.5 ? -1 : 1) * (0.8 + rand() * 1.8),
      flip: 4 + rand() * 5,
      delay: rand() * 0.11,
      life: 1.5 + rand() * 0.6,
      size: 10 + rand() * 5,
      ...shades(colors[Math.floor(rand() * colors.length)]),
    });
  }
  // A few whole flowers, each a different colour, spread across the fan at different heights.
  const order = colors.map((col) => ({ col, k: rand() })).sort((p, q) => p.k - q.k);
  const flowers = Math.min(order.length, 3 + (rand() < 0.5 ? 1 : 0));
  for (let i = 0; i < flowers; i++) {
    const a = ((i + 0.5) / flowers - 0.5) * 2.1 + (rand() - 0.5) * 0.25;
    const drag = 3 + rand() * 0.8;
    const v = reach * (0.55 + ((i * 0.37 + rand() * 0.3) % 0.45)) * drag;
    bits.push({
      flower: true,
      x0: (rand() - 0.5) * 24,
      y0: 0,
      vx: Math.sin(a) * v,
      vy: -Math.cos(a) * v,
      drag,
      fall: 24 + rand() * 14,
      sway: 3 + rand() * 4,
      swayW: 2 + rand(),
      phase: rand() * Math.PI * 2,
      rot: (rand() - 0.5) * 0.6,
      spin: (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.7),
      flip: 2.2 + rand() * 1.2,
      delay: 0.03 + rand() * 0.15,
      life: 1.7 + rand() * 0.4,
      size: 10 + rand() * 3.5,
      ...shades(order[i].col),
    });
  }
  return bits;
}

/**
 * A handful of petals and a few little flowers burst up from a button (at `originX`, `originY` in
 * its parent), fanning out until the air slows them, then fluttering down, tumbling over, and
 * fading. Each flower opens from a bud as it flies. `reach` is about how far the farthest go.
 * Fires again whenever `trigger` changes; it's drawn only while one plays.
 */
export function PetalBurst({ trigger, originX, originY, reach = 170 }: { trigger: number; originX: number; originY: number; reach?: number }) {
  const { c, reduceMotion } = useTheme();
  const colors = useMemo(() => [c.petalRed, c.petalYellow, c.petalBlue, c.petalWhite], [c]);
  const bits = useMemo(() => makeBits(trigger * 7919 + 13, reach, colors, c.petalWhite), [trigger, reach, colors, c.petalWhite]);
  const petal = useMemo(() => petalUnit(), []);
  const stages = useMemo(() => Array.from({ length: STAGES }, (_, i) => flowerPath(0, 0, 1, i / (STAGES - 1))), []);
  const total = useMemo(() => Math.max(...bits.map((b) => b.delay + b.life)) * 1000, [bits]);
  // The canvas round the origin, big enough for the farthest flight and the drift down after.
  const side = reach + 40;
  const above = reach * 1.15 + 40;
  const below = 110;

  // Time moves on by the frames drawn (a long frame no more than two at 60 a second), so a busy
  // moment just after the tap slows the burst rather than skipping part of it.
  const time = useSharedValue(0);
  const playing = useSharedValue(0);
  const [finished, setFinished] = useState(0);
  const tick = useFrameCallback((info) => {
    time.value += Math.min(34, info.timeSincePreviousFrame ?? 16);
    if (playing.value && time.value >= total) {
      const done = playing.value;
      playing.value = 0;
      scheduleOnRN(setFinished, done);
    }
  }, false);
  useEffect(() => {
    if (trigger <= 0 || reduceMotion) return;
    time.set(0);
    playing.set(trigger);
    tick.setActive(true);
  }, [trigger, reduceMotion, tick, time, playing]);
  useEffect(() => {
    if (finished === trigger) tick.setActive(false);
  }, [finished, trigger, tick]);

  const picture = useDerivedValue(() => {
    const now = time.value / 1000;
    return createPicture((cv) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      for (let i = 0; i < bits.length; i++) {
        const b = bits[i];
        const s = now - b.delay;
        if (s <= 0 || s >= b.life) continue;
        const e = Math.exp(-b.drag * s);
        const gone = (1 - e) / b.drag;
        // 0 as it's thrown, nearing 1 once the air has slowed it: only then does it flutter.
        const slowed = 1 - e;
        const wave = b.swayW * s + b.phase;
        const x = side + b.x0 + b.vx * gone + b.sway * slowed * Math.sin(wave);
        const y = above + b.y0 + (b.vy - b.fall) * gone + b.fall * s;
        // Leaning into each swing, like a leaf coming down.
        const rot = b.rot + b.spin * s + 0.45 * slowed * Math.cos(wave);
        const g = Math.min(1, s / 0.16);
        const grow = 1 - (1 - g) * (1 - g) * (1 - g);
        const k = s / b.life;
        const f = k < FADE_FROM ? 0 : (k - FADE_FROM) / (1 - FADE_FROM);
        const alpha = 1 - f * f * (3 - 2 * f);
        cv.save();
        cv.translate(x, y);
        cv.rotate((rot * 180) / Math.PI, 0, 0);
        if (b.flower) {
          const o = Math.min(1, s / OPEN_S);
          const open = 1 - (1 - o) * (1 - o);
          const shape = stages[Math.round(open * (STAGES - 1))];
          const r = b.size * (0.6 + 0.4 * open) * grow;
          // Turning a little towards and away, so it reads as a flower in the air, not a sticker.
          cv.scale(r * (0.84 + 0.16 * Math.cos(b.flip * s + b.phase)), r);
          if (b.under) {
            paint.setColor(Skia.Color(b.under));
            paint.setAlphaf(alpha);
            cv.save();
            cv.translate(0, 0.08);
            cv.drawPath(shape, paint);
            cv.restore();
          }
          paint.setColor(Skia.Color(b.front));
          paint.setAlphaf(alpha);
          cv.drawPath(shape, paint);
          const heart = (open - 0.35) / 0.65;
          if (heart > 0) {
            paint.setColor(Skia.Color(CENTRE_COLOR));
            paint.setAlphaf(alpha);
            cv.drawCircle(0, 0, CENTRE_R * heart, paint);
          }
        } else {
          // Tumbling end over end: narrower as it turns edge on, its other side showing past that.
          const over = Math.cos(b.flip * s + b.phase * 1.7);
          cv.scale(b.size * grow * Math.max(0.14, Math.abs(over)), b.size * grow);
          if (b.under && over >= 0) {
            paint.setColor(Skia.Color(b.under));
            paint.setAlphaf(alpha);
            cv.save();
            cv.translate(0, 0.07);
            cv.drawPath(petal, paint);
            cv.restore();
          }
          paint.setColor(Skia.Color(over >= 0 ? b.front : b.back));
          paint.setAlphaf(alpha);
          cv.drawPath(petal, paint);
        }
        cv.restore();
      }
    });
  });

  if (reduceMotion || trigger <= 0 || finished === trigger) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: originX - side, top: originY - above, width: side * 2, height: above + below }}>
      <Canvas style={{ width: side * 2, height: above + below }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
