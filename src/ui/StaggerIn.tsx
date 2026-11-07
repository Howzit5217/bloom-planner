import { useEffect, useState, type ReactNode } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING } from '@/theme/tokens';

/** The pages whose cards have come in already (each page's come in the first time it shows). */
const entered = new Set<string>();
const markEntered = (page: string) => entered.add(page);

/**
 * App-open entrance: rise 24px and fade in, 60ms apart. A page's cards come in like this the first
 * time it shows; after that (on the web a page out of sight is put away and made again when it's
 * back) they're simply there, as they are in the app, where pages stay.
 */
export function StaggerIn({ index = 0, page = 'page', children, style }: { index?: number; page?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  // In the app pages stay, so a card that turns up later (a new banner) still comes in.
  const [play] = useState(() => Platform.OS !== 'web' || !entered.has(page));
  const y = useSharedValue(play ? 24 : 0);
  const o = useSharedValue(play ? 0 : 1);
  useEffect(() => {
    if (!play) return;
    const d = index * 60;
    y.value = withDelay(d, withSpring(0, SPRING));
    o.value = withDelay(d, withTiming(1, { duration: 320 }));
    markEntered(page);
  }, [index, o, y, play, page]);
  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  return <Animated.View style={[a, style]}>{children}</Animated.View>;
}
