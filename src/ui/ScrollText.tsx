import { useEffect, useState } from 'react';
import { PixelRatio, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { clearOf } from './color';
import { usePageFocused } from './idle';
import { lineHeightOf, T, type TVariant } from './T';

/** How fast a line too long for its space slides, how long it rests at each end, and how wide its edges fade. */
const SPEED = 32;
const REST = 1500;
const FADE = 14;

interface Props {
  children: string;
  v?: TVariant;
  color?: string;
  soft?: boolean;
  /** The colour behind the line, so its edges can fade into it. */
  behind: string;
  /** Centred when it fits (a button's label); a line too long always starts at the left edge. */
  center?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * One line of text that never cuts off with "…": when it's longer than its space it slides across
 * to show the rest and back, resting at each end, with the edges it runs under faded out. Text that
 * fits sits still. With reduced motion it stays put at the start.
 */
export function ScrollText({ children, v = 'body', color, soft, behind, center, style, textStyle }: Props) {
  const [box, setBox] = useState(0);
  const [full, setFull] = useState(0);
  const over = box > 0 ? Math.max(0, Math.ceil(full - box)) : 0;
  const x = useSharedValue(0);
  const reduced = useReducedMotion();
  // Only on the page in view: every tab stays mounted, and lines sliding on hidden pages kept the
  // whole app's layout busy, slowing Home's scrolling.
  const focused = usePageFocused();

  useEffect(() => {
    cancelAnimation(x);
    x.value = 0;
    if (over < 2 || reduced || !focused) return;
    const move = { duration: (over / SPEED) * 1000, easing: Easing.inOut(Easing.quad) };
    x.value = withRepeat(withSequence(withDelay(REST, withTiming(-over, move)), withDelay(REST, withTiming(0, move))), -1, false);
    return () => cancelAnimation(x);
  }, [over, reduced, focused, x]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // Each edge fades only while text is running under it.
  const startFade = useAnimatedStyle(() => ({ opacity: over ? Math.min(1, -x.value / FADE) : 0 }));
  const endFade = useAnimatedStyle(() => ({ opacity: over ? Math.min(1, (over + x.value) / FADE) : 0 }));
  const height = Math.ceil(lineHeightOf(v) * Math.min(1.6, PixelRatio.getFontScale()));
  const clear = clearOf(behind);

  return (
    <View style={[{ height, overflow: 'hidden' }, style]} onLayout={(e) => setBox(e.nativeEvent.layout.width)}>
      {/* Laid out with room to spare, so the line takes its full length. */}
      <Animated.View style={[{ position: 'absolute', left: center && !over && full ? Math.max(0, (box - full) / 2) : 0, top: 0, width: 4000, flexDirection: 'row' }, slide]}>
        <T v={v} color={color} soft={soft} numberOfLines={1} style={textStyle} onLayout={(e) => setFull(e.nativeEvent.layout.width)}>
          {children}
        </T>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, width: FADE, backgroundImage: `linear-gradient(to right, ${behind}, ${clear})` }, startFade]} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: 0, top: 0, bottom: 0, width: FADE, backgroundImage: `linear-gradient(to left, ${behind}, ${clear})` }, endFade]} />
    </View>
  );
}
