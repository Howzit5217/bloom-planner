import { Canvas, Group, Path, type SkPath, type Transforms3d } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { FlowerHead } from './FlowerHead';
import { leafPath, mixHex, stemPath } from './shapes';
import { geometry, headOf, layout, leafAngle, sideLayout, type Sprig } from './sprigLayout';

/** Pikmin Bloom's flower colours for the sprigs: red, yellow, white and blue. */
export const SPRIG_COLORS = (c: Palette) => [c.petalRed, c.petalYellow, c.petalWhite, c.petalBlue];

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

function SprigView({ s, grow, clock, c }: { s: Sprig; grow: SharedValue<number>; clock: SharedValue<number>; c: Palette }) {
  // The stem: a gentle curve from the ground to the head, with body: wider at the base.
  const { top, pointAt } = geometry(s);
  const stem = useMemo<SkPath>(() => {
    const g = geometry(s);
    return stemPath(0, 0, g.ctrl.x, g.ctrl.y, g.top.x, g.top.y, Math.max(3.5, s.r * s.stemW), Math.max(2.5, s.r * s.stemW * 0.62));
  }, [s]);
  const leaf = useMemo(() => leafPath(s.r * s.leafLen, s.r * s.leafLen * s.leafWid), [s.r, s.leafLen, s.leafWid]);

  const stemGrow = useDerivedValue(() => [{ scaleY: Math.max(0.001, clamp01((grow.value - s.delay) / 0.45)) }]);
  const head = useDerivedValue((): Transforms3d => [{ translateX: top.x }, { translateY: top.y }, { scale: Math.max(0, easeOut(clamp01((grow.value - s.delay - 0.32) / 0.35))) }]);
  // Each sprig sways from its base on its own rhythm, a few degrees either way.
  const sway = useDerivedValue(() => [{ translateX: s.x }, { translateY: s.y }, { rotate: Math.sin((clock.value + s.phase) * Math.PI * 2) * 0.045 }]);
  // Flat greens, like the flowers: a stem tone and a slightly lighter leaf tone.
  const stemColor = mixHex(c.leaf, '#1E4A22', c.dark ? 0.12 : 0.22);
  const leafColor = c.leaf;

  return (
    <Group transform={sway}>
      <Group transform={stemGrow}>
        <Path path={stem} color={stemColor} />
      </Group>
      {s.leaves.map((l, i) => {
        // A point on the stem's curve, and the leaf pointing away from it.
        const p = pointAt(l.at);
        return <Leaf key={i} path={leaf} x={p.x} y={p.y} angle={leafAngle(p.along, l.side)} side={l.side} size={l.size} at={l.at} delay={s.delay} grow={grow} color={leafColor} />;
      })}
      <FlowerHead r={headOf(s)} color={s.color} rot={s.rot} transform={head} />
    </Group>
  );
}

function Leaf({ path, x, y, angle, side, size, at, delay, grow, color }: { path: SkPath; x: number; y: number; angle: number; side: 1 | -1; size: number; at: number; delay: number; grow: SharedValue<number>; color: string }) {
  const tf = useDerivedValue((): Transforms3d => {
    const k = clamp01((grow.value - delay - at * 0.4) / 0.3);
    return [{ translateX: x }, { translateY: y }, { rotate: angle }, { scaleX: size * k }, { scaleY: size * k * side }];
  });
  return <Path path={path} color={color} transform={tf} />;
}

/**
 * A few stemmed flowers: growing up from the bottom edge, or (with `sides`) leaning in from both
 * sides of the screen low down. Different every time, in Pikmin Bloom red, yellow, white and
 * blue, swaying gently. Decoration only.
 */
export function FlowerSprigs({ height = 100, count, sides, style }: { height?: number; count?: number; sides?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c, reduceMotion } = useTheme();
  const [w, setW] = useState(0);
  // A fresh arrangement for every visit.
  const [seed] = useState(() => 1 + Math.floor(Math.random() * 2147483000));
  const sprigs = useMemo(() => (w > 0 ? (sides ? sideLayout(w, height, seed, SPRIG_COLORS(c)) : layout(w, height, seed, count, SPRIG_COLORS(c))) : []), [w, height, seed, count, sides, c]);
  const grow = useSharedValue(reduceMotion ? 1 : 0);
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    grow.value = withDelay(350, withTiming(1.2, { duration: 1700, easing: Easing.out(Easing.cubic) }));
    clock.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false);
  }, [grow, clock, reduceMotion]);

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[{ height }, style]}>
      {w > 0 ? (
        <Canvas style={{ width: w, height }}>
          {sprigs.map((s, i) => (
            <SprigView key={i} s={s} grow={grow} clock={clock} c={c} />
          ))}
        </Canvas>
      ) : null}
    </View>
  );
}
