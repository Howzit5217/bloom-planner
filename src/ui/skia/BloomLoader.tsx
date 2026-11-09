import { Canvas, createPicture, Picture, Skia } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Easing, useDerivedValue, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { CENTRE_COLOR, CENTRE_R, mixHex, PETAL_D, PETAL_R } from './shapes';

/** The flower takes this share of its canvas's width, leaving room for each petal's bounce. */
const REACH = 0.4;
/** How long the waiting petal takes to breathe in and out, in seconds. */
const BREATH_S = 1.2;

/**
 * Something is being worked on (a screenshot being read): the app's flower grows its five petals
 * one by one as the work gets done (`progress`, 0 to 1), each popping out with a little bounce.
 * It turns slowly the whole time, and the petal still to come breathes in and out, so it never
 * looks stuck while a step takes its time. With reduced motion it stands still.
 */
export function BloomLoader({ progress, size = 44, color }: { progress: number; size?: number; color?: string }) {
  const { c, reduceMotion } = useTheme();
  const petal = color ?? c.petalRed;
  const white = petal.toUpperCase() === c.petalWhite.toUpperCase();
  const under = white ? mixHex(petal, '#8A7A5C', 0.35) : null;
  const shown = useSharedValue(progress);
  const time = useSharedValue(0);
  useEffect(() => {
    shown.set(reduceMotion ? progress : withTiming(progress, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [progress, reduceMotion, shown]);
  // Every frame while it shows: it's small and brief, and a petal's pop wants every frame.
  const tick = useFrameCallback((info) => {
    time.value += Math.min(34, info.timeSincePreviousFrame ?? 16);
  }, false);
  useEffect(() => {
    tick.setActive(!reduceMotion);
    return () => tick.setActive(false);
  }, [reduceMotion, tick]);

  const picture = useDerivedValue(() => {
    const t = time.value / 1000;
    const k = Math.min(5, Math.max(0, shown.value * 5));
    const half = size / 2;
    const r = size * REACH;
    const turn = t * 0.7;
    const breath = 0.5 - 0.5 * Math.cos((t / BREATH_S) * Math.PI * 2);
    return createPicture((cv) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      const petalAt = (i: number, grown: number, alpha: number) => {
        const a = turn + (i / 5) * Math.PI * 2;
        const d = r * PETAL_D * (0.55 + 0.45 * Math.min(1, grown));
        const pr = r * PETAL_R * grown;
        const x = half + Math.sin(a) * d;
        const y = half - Math.cos(a) * d;
        if (under) {
          paint.setColor(Skia.Color(under));
          paint.setAlphaf(alpha);
          cv.drawCircle(x, y + Math.max(0.8, r * 0.07), pr, paint);
        }
        paint.setColor(Skia.Color(petal));
        paint.setAlphaf(alpha);
        cv.drawCircle(x, y, pr, paint);
      };
      const next = Math.floor(k);
      // The petal still to come, faint and breathing.
      if (next < 5) petalAt(next, 0.86 + 0.14 * breath, 0.14 + 0.2 * breath);
      for (let i = 0; i < 5; i++) {
        const p = Math.min(1, Math.max(0, k - i));
        if (p <= 0) continue;
        // Out with a little bounce: past full size, then settling back.
        const q = p - 1;
        petalAt(i, 1 + 2.7 * q * q * q + 1.7 * q * q, 1);
      }
      paint.setColor(Skia.Color(CENTRE_COLOR));
      paint.setAlphaf(1);
      cv.drawCircle(half, half, r * CENTRE_R * (1 + 0.05 * Math.sin(t * 3.1)), paint);
    });
  });

  return (
    <Canvas style={{ width: size, height: size }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
