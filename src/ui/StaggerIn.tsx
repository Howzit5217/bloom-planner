import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING } from '@/theme/tokens';

/** App-open entrance: rise 24px and fade in, 60ms apart. */
export function StaggerIn({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const y = useSharedValue(24);
  const o = useSharedValue(0);
  useEffect(() => {
    const d = index * 60;
    y.value = withDelay(d, withSpring(0, SPRING));
    o.value = withDelay(d, withTiming(1, { duration: 320 }));
  }, [index, o, y]);
  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  return <Animated.View style={[a, style]}>{children}</Animated.View>;
}
