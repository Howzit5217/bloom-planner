import { Canvas, type Transforms3d } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { useIdleClock } from '../idle';
import { FlowerHead } from './FlowerHead';
import { SPRIG_COLORS } from './FlowerSprigs';
import { rng } from './shapes';

/** A few ways to arrange a handful of flowers, so each page gets its own. x, y in 0-1 of the box; r in 0-1 of its height. */
const ARRANGEMENTS = {
  /** Three together: big, medium, small. */
  cluster: [
    [0.62, 0.55, 0.4],
    [0.87, 0.36, 0.25],
    [0.38, 0.72, 0.2],
  ],
  /** Two side by side. */
  pair: [
    [0.7, 0.5, 0.38],
    [0.36, 0.66, 0.24],
  ],
  /** Four rising along a gentle curve. */
  arc: [
    [0.14, 0.76, 0.15],
    [0.37, 0.58, 0.19],
    [0.62, 0.45, 0.23],
    [0.86, 0.4, 0.28],
  ],
  /** Little flowers in a line, like the ones you plant as you walk. */
  trail: [
    [0.1, 0.78, 0.12],
    [0.29, 0.6, 0.13],
    [0.48, 0.74, 0.14],
    [0.67, 0.52, 0.17],
    [0.88, 0.42, 0.21],
  ],
  /** A loose handful. */
  scatter: [
    [0.18, 0.4, 0.16],
    [0.44, 0.7, 0.2],
    [0.7, 0.36, 0.25],
    [0.92, 0.72, 0.14],
  ],
} as const;

export type FlowerArrangement = keyof typeof ARRANGEMENTS;

interface Spot {
  x: number;
  y: number;
  r: number;
  rot: number;
  color: string;
  delay: number;
  phase: number;
}

function makeSpots(arrangement: FlowerArrangement, width: number, height: number, seed: number, colors: string[]): Spot[] {
  const rand = rng(seed);
  const out: Spot[] = [];
  let last = -1;
  ARRANGEMENTS[arrangement].forEach(([fx, fy, fr], i) => {
    const r = height * fr * (0.85 + rand() * 0.2);
    let ci = Math.floor(rand() * colors.length);
    if (ci === last) ci = (ci + 1) % colors.length;
    last = ci;
    out.push({
      // A little clear of every edge, turned or not.
      x: Math.max(r * 1.12, Math.min(width - r * 1.12, width * (fx + (rand() - 0.5) * 0.08))),
      y: Math.max(r * 1.12, Math.min(height - r * 1.12, height * (fy + (rand() - 0.5) * 0.12))),
      r,
      rot: rand() * Math.PI,
      color: colors[ci],
      delay: 0.1 + i * 0.12,
      phase: rand(),
    });
  });
  return out;
}

const clamp01 = (x: number) => {
  'worklet';
  return Math.min(1, Math.max(0, x));
};
/** Smooth ease-out with no overshoot, so nothing ever grows past its canvas. */
const easeOut = (x: number) => {
  'worklet';
  const u = 1 - x;
  return 1 - u * u * u;
};

function Bloom({ s, grow, clock }: { s: Spot; grow: SharedValue<number>; clock: SharedValue<number> }) {
  const tf = useDerivedValue((): Transforms3d => [
    { translateX: s.x },
    { translateY: s.y },
    { rotate: Math.sin((clock.value + s.phase) * Math.PI * 2) * 0.08 },
    { scale: Math.max(0, easeOut(clamp01((grow.value - s.delay) / 0.35))) },
  ]);
  return <FlowerHead r={s.r} color={s.color} rot={s.rot} transform={tf} />;
}

/**
 * A small, sparse group of flat flowers for a page corner: the arrangement is the page's own,
 * the details (exact spots, sizes, turns and colours) are different every visit.
 */
export function FlowerAccent({ arrangement, width, height, style }: { arrangement: FlowerArrangement; width: number; height: number; style?: StyleProp<ViewStyle> }) {
  const { c, reduceMotion } = useTheme();
  const [seed] = useState(() => 1 + Math.floor(Math.random() * 2147483000));
  const spots = useMemo(() => makeSpots(arrangement, width, height, seed, SPRIG_COLORS(c)), [arrangement, width, height, seed, c]);
  const grow = useSharedValue(reduceMotion ? 2 : 0);
  // Swaying a few times less often than the screen redraws, and only while the page is in view.
  const clock = useIdleClock(6000);
  useEffect(() => {
    if (reduceMotion) return;
    grow.value = withDelay(250, withTiming(2, { duration: 2000, easing: Easing.linear }));
  }, [grow, reduceMotion]);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width, height }, style]}>
      <Canvas style={{ width, height }}>
        {spots.map((s, i) => (
          <Bloom key={i} s={s} grow={grow} clock={clock} />
        ))}
      </Canvas>
    </View>
  );
}
