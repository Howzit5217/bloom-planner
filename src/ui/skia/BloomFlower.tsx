import { Canvas, Circle, Group, Path, vec, type SkPath, type Transforms3d } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { Easing, useDerivedValue, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { CENTRE_COLOR, CENTRE_R, mixHex, petalShape, sparklePath } from './shapes';

const PETALS = 5;
const BLOOM_MS = 1400;

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
const cubicOut = (x: number) => {
  'worklet';
  const u = 1 - x;
  return 1 - u * u * u;
};

function Petal({ t, path, angle, start, cx, cy, color, dy = 0, stroke }: { t: SharedValue<number>; path: SkPath; angle: number; start: number; cx: number; cy: number; color: string; dy?: number; stroke?: number }) {
  // Each petal swings out from the closed bud at the top to its place, and swells as it goes.
  const transform = useDerivedValue((): Transforms3d => {
    const x = clamp01((t.value - start) / 0.45);
    return [{ translateX: cx }, { translateY: cy + dy }, { rotate: angle * cubicOut(x) }, { scale: Math.max(0, 0.35 + 0.65 * easeOut(x)) }];
  });
  const opacity = useDerivedValue(() => clamp01((t.value - start) / 0.1));
  return stroke ? <Path path={path} color={color} transform={transform} opacity={opacity} style="stroke" strokeWidth={stroke} strokeJoin="round" /> : <Path path={path} color={color} transform={transform} opacity={opacity} />;
}

function Sparkle({ t, idle, x, y, s, start, color }: { t: SharedValue<number>; idle: SharedValue<number>; x: number; y: number; s: number; start: number; color: string }) {
  const path = useMemo(() => sparklePath(s), [s]);
  const transform = useDerivedValue((): Transforms3d => {
    const k = easeOut(clamp01((t.value - start) / 0.22));
    const twinkle = 0.85 + 0.15 * Math.sin((idle.value + start) * Math.PI * 2);
    return [{ translateX: x }, { translateY: y }, { scale: Math.max(0, k) * twinkle }, { rotate: (1 - clamp01((t.value - start) / 0.3)) * 0.8 }];
  });
  const opacity = useDerivedValue(() => clamp01((t.value - start) / 0.1) * (0.55 + 0.45 * Math.sin((idle.value + start) * Math.PI * 2 + 1.2) ** 2));
  return <Path path={path} color={color} transform={transform} opacity={opacity} />;
}

/**
 * The welcome flower, flat like Pikmin Bloom's: five round petals spring open one by one from a
 * bud, the golden centre pops in, a few sparkles twinkle, and it sways gently after. `edge`: a thin
 * darker line round the petals, so it stands out on any sky (Home, behind the level badge).
 */
export function BloomFlower({ size = 160, color, delay = 150, edge }: { size?: number; color?: string; delay?: number; edge?: boolean }) {
  const { c, reduceMotion } = useTheme();
  const t = useSharedValue(reduceMotion ? 1 : 0);
  const idle = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      t.value = 1;
      return;
    }
    t.value = 0;
    t.value = withDelay(delay, withTiming(1, { duration: BLOOM_MS, easing: Easing.linear }));
    // One continuous clock (0 to 1, over and over): every idle motion is a sine of it, so the loop never jumps or reverses.
    idle.value = withDelay(delay + BLOOM_MS * 0.8, withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false));
  }, [delay, reduceMotion, t, idle]);

  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.4;
  const base = color ?? c.petalRed;
  // White petals get a crisp, soft-brown shade just beneath them, so they still read on cream.
  const white = ['#FFFFFF', '#EDE8DF'].includes(base.toUpperCase());
  const petal = useMemo(() => petalShape(R), [R]);

  const centre = useDerivedValue((): Transforms3d => [{ translateX: cx }, { translateY: cy }, { scale: Math.max(0, easeOut(clamp01((t.value - 0.5) / 0.4))) }]);
  const sway = useDerivedValue((): Transforms3d => [{ rotate: Math.sin(idle.value * Math.PI * 2) * 0.035 }, { scale: 1 + Math.sin(idle.value * Math.PI * 4 + 1) * 0.01 }]);

  const sparkles = [
    { a: -0.55, d: 0.43, s: 0.04, start: 0.72 },
    { a: 0.95, d: 0.42, s: 0.03, start: 0.8 },
    { a: 2.35, d: 0.43, s: 0.036, start: 0.86 },
    { a: 3.95, d: 0.41, s: 0.026, start: 0.92 },
  ];

  return (
    <Canvas style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Group transform={sway} origin={vec(cx, cy)}>
        {/* The outlines first, all of them, so the fills leave only the flower's outer edge. */}
        {edge
          ? Array.from({ length: PETALS }, (_, i) => (
              <Petal key={`e${i}`} t={t} path={petal} angle={(i / PETALS) * Math.PI * 2} start={0.06 + i * 0.08} cx={cx} cy={cy} color={mixHex(base, '#24180E', white ? 0.5 : 0.42)} stroke={Math.max(2, size * 0.024)} />
            ))
          : null}
        {white
          ? Array.from({ length: PETALS }, (_, i) => (
              <Petal key={`u${i}`} t={t} path={petal} angle={(i / PETALS) * Math.PI * 2} start={0.06 + i * 0.08} cx={cx} cy={cy} dy={R * 0.06} color={mixHex(base, '#8A7A5C', 0.35)} />
            ))
          : null}
        {Array.from({ length: PETALS }, (_, i) => (
          <Petal key={i} t={t} path={petal} angle={(i / PETALS) * Math.PI * 2} start={0.06 + i * 0.08} cx={cx} cy={cy} color={base} />
        ))}
        <Group transform={centre}>
          <Circle cx={0} cy={0} r={R * CENTRE_R} color={CENTRE_COLOR} />
        </Group>
      </Group>
      {sparkles.map((s, i) => (
        <Sparkle key={i} t={t} idle={idle} x={cx + Math.cos(s.a) * size * s.d} y={cy + Math.sin(s.a) * size * s.d} s={size * s.s} start={s.start} color={c.gameYellow} />
      ))}
    </Canvas>
  );
}
