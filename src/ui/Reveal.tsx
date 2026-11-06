import { useEffect, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';

const OPEN_MS = 260;
const CLOSE_MS = 200;

/**
 * Something a toggle (or a "More" row) shows: it opens out to its own height as its content fades
 * in, and folds away again, so whatever is below moves smoothly instead of jumping. `gap`: the space
 * the surrounding column puts between its items, folded away with it so nothing jumps by that
 * either. Until it's first toggled it's just its content (a section that starts open shows at once);
 * with reduced motion it simply shows and hides.
 */
export function Reveal({ open, children, gap = 0 }: { open: boolean; children: ReactNode; gap?: number }) {
  const { reduceMotion } = useTheme();
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!open && mounted && reduceMotion) setMounted(false);
  // Once toggled, it animates from then on.
  const [toggled, setToggled] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    setToggled(true);
  }
  const [height, setHeight] = useState(0);
  const p = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      p.value = open ? 1 : 0;
      return;
    }
    p.value = withTiming(open ? 1 : 0, { duration: open ? OPEN_MS : CLOSE_MS, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done && !open) scheduleOnRN(setMounted, false);
    });
  }, [open, p, reduceMotion]);
  const box = useAnimatedStyle(() => ({ height: height * p.value, marginTop: -gap * (1 - p.value), overflow: 'hidden' }));
  // Fades in a little behind the opening, so the content doesn't show squeezed.
  const content = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (p.value - 0.25) / 0.75)), transform: [{ translateY: (1 - p.value) * -8 }] }));
  const measure = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);
  if (!mounted) return null;
  if (!toggled || reduceMotion) return <View onLayout={measure}>{children}</View>;
  return (
    <Animated.View style={box}>
      {/* At its own height, whatever the box is showing of it just now. */}
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, content]}>
        <View onLayout={measure}>{children}</View>
      </Animated.View>
    </Animated.View>
  );
}
