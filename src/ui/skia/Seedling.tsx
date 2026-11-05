import { Canvas, Circle, Group, Oval, Path, rect, Skia, usePathInterpolation } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { useDerivedValue, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { flowerPath, leafPath } from './shapes';

const MAX_STAGE = 7;
const clamp01 = (x: number) => {
  'worklet';
  return Math.min(1, Math.max(0, x));
};

interface Props {
  /** 0 (seed) to 7 (bloomed). Springs between stages. */
  stage?: number;
  /** Drive directly instead (e.g. pull distance), 0..7. Takes precedence over `stage`. */
  growth?: SharedValue<number>;
  size?: number;
  petalColor?: string;
}

/** A seedling that grows a stage at a time: seed, sprout, leaves, bud, bloom. */
export function Seedling({ stage = 0, growth, size = 120, petalColor }: Props) {
  const { c } = useTheme();
  const own = useSharedValue(stage);
  useEffect(() => {
    own.value = withSpring(Math.min(MAX_STAGE, Math.max(0, stage)), { damping: 12, stiffness: 90 });
  }, [stage, own]);
  const g = growth ?? own;

  const w = size;
  const h = size;
  const baseX = w / 2;
  const baseY = h * 0.86;
  const maxStem = h * 0.6;

  const stem = useDerivedValue(() => {
    const t = clamp01(g.value / 5);
    const len = h * 0.04 + maxStem * t;
    return Skia.PathBuilder.Make()
      .moveTo(baseX, baseY)
      .quadTo(baseX - w * 0.06 * t, baseY - len * 0.5, baseX + w * 0.01, baseY - len)
      .build();
  });
  const stemTopY = useDerivedValue(() => baseY - (h * 0.04 + maxStem * clamp01(g.value / 5)));

  const leaf = useMemo(() => leafPath(w * 0.24, w * 0.085), [w]);
  const leafTransform = (v: number, k: number, side: 1 | -1, atFrac: number) => {
    'worklet';
    const y = baseY - (h * 0.04 + maxStem * clamp01(v / 5)) * atFrac;
    return [{ translateX: baseX }, { translateY: y }, { rotate: side < 0 ? Math.PI + 0.5 : -0.5 }, { scale: clamp01(v - k) }];
  };
  const l1 = useDerivedValue(() => leafTransform(g.value, 1, 1, 0.35));
  const l2 = useDerivedValue(() => leafTransform(g.value, 2, -1, 0.55));
  const l3 = useDerivedValue(() => leafTransform(g.value, 3, 1, 0.75));

  const r = w * 0.15;
  const bud = useMemo(() => flowerPath(0, 0, r, 0), [r]);
  const bloom = useMemo(() => flowerPath(0, 0, r, 1), [r]);
  const open = useDerivedValue(() => clamp01((g.value - 5.6) / 1.4));
  const flower = usePathInterpolation(open, [0, 1], [bud, bloom]);
  const flowerT = useDerivedValue(() => [{ translateX: baseX + w * 0.01 }, { translateY: stemTopY.value }, { scale: clamp01((g.value - 4.4) / 0.8) }]);
  const centerR = useDerivedValue(() => r * 0.3 * clamp01(g.value - 6));
  const seedOpacity = useDerivedValue(() => 1 - clamp01(g.value * 2));

  return (
    <Canvas style={{ width: w, height: h }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Oval rect={rect(w * 0.18, baseY - h * 0.05, w * 0.64, h * 0.12)} color={c.dark ? '#5A4630' : '#9B7A55'} />
      <Oval rect={rect(w * 0.24, baseY - h * 0.045, w * 0.52, h * 0.07)} color={c.dark ? '#6B5439' : '#B38E63'} />
      <Group opacity={seedOpacity}>
        <Oval rect={rect(baseX - w * 0.05, baseY - h * 0.07, w * 0.1, h * 0.065)} color={c.dark ? '#C9A97A' : '#7A5A35'} />
      </Group>
      <Path path={stem} style="stroke" strokeWidth={w * 0.045} strokeCap="round" color={c.leafDeep} />
      <Group transform={l1}>
        <Path path={leaf} color={c.leaf} />
      </Group>
      <Group transform={l2}>
        <Path path={leaf} color={c.leaf} />
      </Group>
      <Group transform={l3}>
        <Path path={leaf} color={c.leaf} />
      </Group>
      <Group transform={flowerT}>
        <Path path={flower} color={petalColor ?? c.petalRed} />
        <Circle cx={0} cy={0} r={centerR} color={c.petalYellow} />
      </Group>
    </Canvas>
  );
}
