import { BlurMask, Canvas, Circle, Group, Path, usePathInterpolation } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { useDerivedValue, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { flowerPath } from './shapes';

/** A flower that blooms open when it mounts (path morph from bud to bloom). */
export function BloomFlower({ size = 160, color, delay = 150 }: { size?: number; color?: string; delay?: number }) {
  const { c } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withSpring(1, { damping: 9, stiffness: 70 }));
  }, [delay, p]);
  const cx = size / 2;
  const r = size * 0.42;
  const bud = useMemo(() => flowerPath(cx, cx, r, 0, 6), [cx, r]);
  const open = useMemo(() => flowerPath(cx, cx, r, 1, 6), [cx, r]);
  const backBud = useMemo(() => flowerPath(cx, cx, r * 0.98, 0, 6, Math.PI / 6), [cx, r]);
  const backOpen = useMemo(() => flowerPath(cx, cx, r * 0.98, 1, 6, Math.PI / 6), [cx, r]);
  const clampP = useDerivedValue(() => Math.min(1.15, Math.max(0, p.value)));
  const path = usePathInterpolation(clampP, [0, 1], [bud, open]);
  const back = usePathInterpolation(clampP, [0, 1], [backBud, backOpen]);
  const centre = useDerivedValue(() => size * 0.12 * Math.min(1, p.value));
  const glow = useDerivedValue(() => size * 0.5 * Math.min(1, p.value));
  const tf = useDerivedValue(() => [{ rotate: (1 - Math.min(1, p.value)) * -0.6 }]);
  const shine = useDerivedValue(() => centre.value * 0.35);
  return (
    <Canvas style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={cx} cy={cx} r={glow} color={c.dark ? 'rgba(246,214,110,0.12)' : 'rgba(255,240,180,0.6)'}>
        <BlurMask blur={18} style="normal" />
      </Circle>
      <Group transform={tf} origin={{ x: cx, y: cx }}>
        <Path path={back} color={c.petalWhite} opacity={0.9} />
        <Path path={path} color={color ?? c.petalRed} />
        <Circle cx={cx} cy={cx} r={centre} color={c.petalYellow} />
        <Circle cx={cx - size * 0.03} cy={cx - size * 0.03} r={shine} color="rgba(255,255,255,0.7)" />
      </Group>
    </Canvas>
  );
}
