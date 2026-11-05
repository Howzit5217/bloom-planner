import { Canvas, Circle, Group, Line, Oval, Path, rect, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { leafPath } from './shapes';

const W = 44;
const H = 64;

/**
 * A little leaf-sprout creature that wanders across the bottom of the screen every 40-90 seconds,
 * taking 6 seconds to cross. Tap it and it hops. Hidden when reduce-motion is on.
 */
export function Walker({ bottom = 96 }: { bottom?: number }) {
  const { c, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const x = useSharedValue(-W - 10);
  const hop = useSharedValue(0);
  const step = useSharedValue(0);
  const dir = useSharedValue(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reduceMotion) return;
    let alive = true;
    const schedule = () => {
      const wait = 40000 + Math.random() * 50000;
      timer.current = setTimeout(() => {
        if (!alive) return;
        const right = Math.random() < 0.5;
        dir.value = right ? 1 : -1;
        const from = right ? -W - 10 : width + 10;
        const to = right ? width + 10 : -W - 10;
        x.value = from;
        step.value = 0;
        step.value = withRepeat(withTiming(1, { duration: 360, easing: Easing.linear }), 17, false);
        x.value = withTiming(to, { duration: 6000, easing: Easing.inOut(Easing.sin) });
        schedule();
      }, wait);
    };
    // First visit a little sooner.
    timer.current = setTimeout(() => {
      if (!alive) return;
      dir.value = 1;
      x.value = -W - 10;
      step.value = withRepeat(withTiming(1, { duration: 360, easing: Easing.linear }), 17, false);
      x.value = withTiming(width + 10, { duration: 6000, easing: Easing.inOut(Easing.sin) });
      schedule();
    }, 12000);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      cancelAnimation(x);
      cancelAnimation(step);
    };
  }, [reduceMotion, width, x, step, dir]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: hop.value }, { scaleX: dir.value }],
  }));

  const body = c.dark ? 'rgba(156,213,151,0.55)' : 'rgba(46,96,48,0.55)';
  const leaf = useMemo(() => leafPath(16, 6), []);
  const legA = useDerivedValue(() => vec(W / 2 - 5 + Math.sin(step.value * Math.PI * 2) * 4, H - 2));
  const legB = useDerivedValue(() => vec(W / 2 + 5 - Math.sin(step.value * Math.PI * 2) * 4, H - 2));
  const bob = useDerivedValue(() => [{ translateY: -Math.abs(Math.sin(step.value * Math.PI * 2)) * 2 }]);

  if (reduceMotion) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 0, bottom, width: W, height: H }, style]}>
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          hop.set(withSequence(withTiming(-30, { duration: 160, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 6, stiffness: 160 })));
        }}
        style={{ width: W, height: H }}
      >
        <Canvas style={{ width: W, height: H }}>
          <Line p1={vec(W / 2 - 4, H - 16)} p2={legA} color={body} strokeWidth={3} strokeCap="round" />
          <Line p1={vec(W / 2 + 4, H - 16)} p2={legB} color={body} strokeWidth={3} strokeCap="round" />
          <Group transform={bob}>
            <Oval rect={rect(W / 2 - 8, H - 34, 16, 22)} color={body} />
            <Circle cx={W / 2} cy={H - 40} r={9} color={body} />
            <Path path={`M ${W / 2} ${H - 48} Q ${W / 2 + 2} ${H - 56} ${W / 2 + 1} ${H - 60}`} style="stroke" strokeWidth={2} color={body} />
            <Group transform={[{ translateX: W / 2 + 1 }, { translateY: H - 60 }, { rotate: -0.7 }]}>
              <Path path={leaf} color={body} />
            </Group>
          </Group>
        </Canvas>
      </Pressable>
    </Animated.View>
  );
}
