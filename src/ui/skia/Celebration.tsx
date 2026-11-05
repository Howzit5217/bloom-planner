import { BlurMask, Canvas, Circle, Group, Path, RadialGradient, usePathInterpolation, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';
import { PETALS } from '@/theme/tokens';
import { T } from '../T';
import { GameNumber } from './GameNumber';
import { flowerPath, petalPath, rng } from './shapes';
import { t as tr } from '@/i18n';

const DURATION = 2500;
const PETAL_COUNT = 48;

interface Spec {
  a0: number;
  v0: number;
  drag: number;
  omega: number;
  gravity: number;
  rot0: number;
  rotV: number;
  size: number;
  color: string;
  delay: number;
}

function SpiralPetal({ t, s, cx, cy }: { t: SharedValue<number>; s: Spec; cx: number; cy: number }) {
  const path = useMemo(() => petalPath(s.size), [s.size]);
  const transform = useDerivedValue(() => {
    const tau = Math.max(0, t.value * (DURATION / 1000) - s.delay);
    const d = (s.v0 / s.drag) * (1 - Math.exp(-s.drag * tau));
    const a = s.a0 + s.omega * tau;
    return [
      { translateX: cx + Math.cos(a) * d },
      { translateY: cy + Math.sin(a) * d + 0.5 * s.gravity * tau * tau },
      { rotate: s.rot0 + s.rotV * tau },
    ];
  });
  const opacity = useDerivedValue(() => {
    const tau = t.value * (DURATION / 1000) - s.delay;
    if (tau <= 0) return 0;
    return tau < 1.5 ? 1 : Math.max(0, 1 - (tau - 1.5) / 0.9);
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={path} color={s.color} />
    </Group>
  );
}

interface Props {
  level: number;
  title: string;
  subtitle: string;
  onDone: () => void;
}

/**
 * Level-up: a flower blooms open from the centre (path morph), 48 petals spiral outward
 * with drag and gravity, the new level number bounces in. 2.5 seconds; tap to skip.
 */
export function Celebration({ level, title, subtitle, onDone }: Props) {
  const { c, reduceMotion } = useTheme();
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height * 0.4;
  const t = useSharedValue(0);
  const bloom = useSharedValue(0);
  const fade = useSharedValue(0);
  const numberScale = useSharedValue(0.2);

  const specs = useMemo<Spec[]>(() => {
    const colors = PETALS(c);
    const rand = rng(level * 104729 + 17);
    return Array.from({ length: PETAL_COUNT }, (_, i) => ({
      a0: (i / PETAL_COUNT) * Math.PI * 2 + rand() * 0.3,
      v0: 260 + rand() * 420,
      drag: 1.6 + rand() * 1.2,
      omega: (rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 0.8),
      gravity: 120 + rand() * 160,
      rot0: rand() * Math.PI * 2,
      rotV: (rand() - 0.5) * 9,
      size: 14 + rand() * 14,
      color: colors[i % colors.length],
      delay: 0.18 + rand() * 0.25,
    }));
  }, [c, level]);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    fade.value = withTiming(1, { duration: 220 });
    bloom.value = withSpring(1, { damping: 8, stiffness: 80 });
    t.value = withTiming(1, { duration: DURATION, easing: Easing.linear });
    numberScale.value = withDelay(300, withSpring(1, { damping: 7, stiffness: 140 }));
    fade.value = withSequence(
      withTiming(1, { duration: 220 }),
      withDelay(DURATION - 520, withTiming(0, { duration: 300 }, (done) => {
        if (done) scheduleOnRN(onDone);
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = Math.min(width, height) * 0.24;
  const bud = useMemo(() => flowerPath(cx, cy, r, 0, 8), [cx, cy, r]);
  const open = useMemo(() => flowerPath(cx, cy, r, 1, 8), [cx, cy, r]);
  const bud2 = useMemo(() => flowerPath(cx, cy, r * 0.7, 0, 8, Math.PI / 8), [cx, cy, r]);
  const open2 = useMemo(() => flowerPath(cx, cy, r * 0.7, 1, 8, Math.PI / 8), [cx, cy, r]);
  const flower = usePathInterpolation(bloom, [0, 1], [bud, open]);
  const inner = usePathInterpolation(bloom, [0, 1], [bud2, open2]);
  const centre = useDerivedValue(() => r * 0.26 * Math.min(1, bloom.value));
  const glowR = useDerivedValue(() => r * 2.4 * Math.min(1.1, bloom.value));
  const spin = useDerivedValue(() => [{ rotate: t.value * 0.5 }]);

  const overlay = useAnimatedStyle(() => ({ opacity: fade.value }));
  const num = useAnimatedStyle(() => ({ transform: [{ scale: numberScale.value }] }));

  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width, height, zIndex: 1000 }, overlay]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}. ${tr('Tap to continue.')}`} onPress={onDone} style={{ flex: 1 }}>
        <View style={{ position: 'absolute', top: 0, left: 0, width, height, backgroundColor: c.dark ? 'rgba(20,18,12,0.86)' : 'rgba(251,247,236,0.9)' }} />
        <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height }}>
          <Circle cx={cx} cy={cy} r={glowR}>
            <RadialGradient c={vec(cx, cy)} r={r * 2.4} colors={[c.dark ? 'rgba(246,214,110,0.35)' : 'rgba(255,216,77,0.55)', 'rgba(255,216,77,0)']} />
          </Circle>
          <Group transform={spin} origin={vec(cx, cy)}>
            <Path path={flower} color={c.petalRed} />
            <Path path={inner} color={c.petalWhite} />
            <Circle cx={cx} cy={cy} r={centre} color={c.petalYellow}>
              <BlurMask blur={2} style="solid" />
            </Circle>
          </Group>
          {reduceMotion ? null : specs.map((s, i) => <SpiralPetal key={i} t={t} s={s} cx={cx} cy={cy} />)}
        </Canvas>
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: cy + r * 1.05, alignItems: 'center', gap: 2 }, num]}>
          <T v="h2" center color={c.leafDeep}>
            {title}
          </T>
          <GameNumber value={level} size={96} format={(n) => String(n)} />
          <T v="bodyBold" center soft>
            {subtitle}
          </T>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
