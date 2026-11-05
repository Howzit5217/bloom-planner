import { BlurMask, Canvas, Circle, Group, Path, Skia, SweepGradient, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { SPRING } from '@/theme/tokens';

interface Props {
  /** 0..1 */
  fraction: number;
  size?: number;
  thickness?: number;
  colors: [string, string];
  track?: string;
  /** Pulse + sparkle when this flips to true (daily goal hit). */
  celebrate?: boolean;
  children?: ReactNode;
  accessibilityLabel: string;
}

/** Progress ring: soft gradient fill, rounded caps, sweeps with a slight overshoot. */
export function Ring({ fraction, size = 150, thickness = 16, colors, track, celebrate = false, children, accessibilityLabel }: Props) {
  const { c, reduceMotion } = useTheme();
  const progress = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const pulse = useSharedValue(1);
  const wasCelebrating = useRef(celebrate);

  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(1, fraction)), { duration: 800, easing: Easing.out(Easing.back(1.6)) });
  }, [fraction, progress]);

  useEffect(() => {
    if (celebrate && !wasCelebrating.current) {
      pulse.value = withSequence(withSpring(1.07, SPRING), withSpring(1, SPRING));
      if (!reduceMotion) {
        sparkle.value = 0;
        sparkle.value = withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) });
      }
    }
    wasCelebrating.current = celebrate;
  }, [celebrate, pulse, reduceMotion, sparkle]);

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const arc = useMemo(() => Skia.PathBuilder.Make().addArc(Skia.XYWHRect(cx - r, cx - r, r * 2, r * 2), 0, 359.9).build(), [cx, r]);
  const end = useDerivedValue(() => Math.min(1, Math.max(0.0001, progress.value)));
  const capOpacity = useDerivedValue(() => (progress.value > 0.002 ? 1 : 0));
  const sx = useDerivedValue(() => cx + r * Math.cos(2 * Math.PI * sparkle.value * Math.min(1, progress.value)));
  const sy = useDerivedValue(() => cx + r * Math.sin(2 * Math.PI * sparkle.value * Math.min(1, progress.value)));
  const sOpacity = useDerivedValue(() => Math.sin(Math.PI * sparkle.value));
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View style={[{ width: size, height: size }, wrap]} accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}>
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ rotate: -Math.PI / 2 }]} origin={vec(cx, cx)}>
          <Circle cx={cx} cy={cx} r={r} style="stroke" strokeWidth={thickness} color={track ?? c.leafPale} />
          <Group opacity={capOpacity}>
            <Path path={arc} style="stroke" strokeWidth={thickness} strokeCap="round" start={0} end={end}>
              <SweepGradient c={vec(cx, cx)} colors={[colors[0], colors[1]]} />
            </Path>
            {/* Cover the sweep-gradient seam under the starting round cap. */}
            <Circle cx={cx + r} cy={cx} r={thickness / 2} color={colors[0]} />
          </Group>
          <Group opacity={sOpacity}>
            <Circle cx={sx} cy={sy} r={thickness * 0.55} color="rgba(255,255,255,0.95)">
              <BlurMask blur={4} style="solid" />
            </Circle>
          </Group>
        </Group>
      </Canvas>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
        {children}
      </View>
    </Animated.View>
  );
}
