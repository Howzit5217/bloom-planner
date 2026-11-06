import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { clearOf } from './color';
import { T } from './T';

/** Room per number: wide enough that a drag moves calmly, a number at a time. */
const TICK = 22;
const H = 74;

const WEB = Platform.OS === 'web';
/**
 * The web has no snapping scroll view of its own: the browser's scroll snapping lands each number's
 * middle on the ruler's middle, under the needle (touch, mouse wheel or trackpad alike).
 */
const WEB_SNAP = WEB ? ({ scrollSnapType: 'x mandatory' } as unknown as ViewStyle) : null;
const WEB_SNAP_TICK = WEB ? ({ scrollSnapAlign: 'center', scrollSnapStop: 'normal' } as unknown as ViewStyle) : null;

interface Props {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

/**
 * A ruler of numbers you drag sideways: it moves calmly under the finger, a short flick coasts
 * only a little, and it settles on one with a tick. Follows the value when it changes elsewhere (the ± buttons or typing).
 */
export function LevelRuler({ value, min, max, onChange }: Props) {
  const { c } = useTheme();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const x = useSharedValue((value - min) * TICK);
  const [width, setWidth] = useState(0);
  // Only the first position goes in as a prop: Android re-applies contentOffset on every render.
  const [startX] = useState(() => (value - min) * TICK);
  const emitted = useRef(value);
  const dragging = useRef(false);
  const count = max - min + 1;
  const bob = useSharedValue(1);
  const bud = useAnimatedStyle(() => ({ transform: [{ scale: bob.value }] }));

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  // The places it stops, one per number: exact offsets, as Android rounds a snap interval down to
  // whole pixels, and that error added up level by level until it stopped off the line.
  const offsets = useMemo(() => Array.from({ length: count }, (_, i) => i * TICK), [count]);
  // The value the app itself is gliding to (on the web, where a scroll can't tell who moved it):
  // until it gets there, or a finger or wheel takes over, the scrolling isn't the user's.
  const glide = useRef<number | null>(null);
  const userTook = () => {
    glide.current = null;
  };

  // Only a drag (or its fling) changes the level; a glide to a typed value must not step through.
  const emit = (v: number) => {
    if (WEB) {
      // The web sends no drag events: every scroll is the user's, except the app's own glide.
      if (glide.current != null) {
        if (v === glide.current) glide.current = null;
        return;
      }
    } else if (!dragging.current) return;
    const n = clamp(v);
    if (n !== emitted.current) {
      emitted.current = n;
      onChange(n);
    }
  };
  const tick = () => {
    if (dragging.current) Haptics.selectionAsync().catch(() => {});
  };
  const setDragging = (d: boolean) => {
    dragging.current = d;
  };
  // Wherever a drag or fling ends, it finishes exactly on the nearest number's line.
  const settle = (at: number) => {
    const to = Math.max(0, Math.min(count - 1, Math.round(at / TICK))) * TICK;
    if (Math.abs(at - to) > 0.5) ref.current?.scrollTo({ x: to, animated: true });
  };

  // Once laid out, sit on the value: the web ignores contentOffset, so it would open at the start.
  useEffect(() => {
    if (width <= 0) return;
    const id = requestAnimationFrame(() => ref.current?.scrollTo({ x: (emitted.current - min) * TICK, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [width, min, ref]);

  // A change from elsewhere: glide the ruler to it.
  useEffect(() => {
    if (value === emitted.current || dragging.current) return;
    emitted.current = value;
    if (WEB) glide.current = value;
    ref.current?.scrollTo({ x: (value - min) * TICK, animated: true });
  }, [value, min, ref]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.value = e.contentOffset.x;
    },
    onBeginDrag: () => {
      scheduleOnRN(setDragging, true);
    },
    onMomentumEnd: (e) => {
      scheduleOnRN(setDragging, false);
      scheduleOnRN(settle, e.contentOffset.x);
    },
    onEndDrag: (e) => {
      if (Math.abs(e.velocity?.x ?? 0) < 0.05) {
        scheduleOnRN(setDragging, false);
        scheduleOnRN(settle, e.contentOffset.x);
      }
    },
  });

  // The level under the needle, live while you drag, with a tick per level.
  useAnimatedReaction(
    () => Math.round(x.value / TICK),
    (cur, prev) => {
      if (prev === null || cur === prev) return;
      bob.set(withSequence(withTiming(1.15, { duration: 50 }), withSpring(1, { damping: 12, stiffness: 260 })));
      scheduleOnRN(emit, min + cur);
      scheduleOnRN(tick);
    },
  );

  const pad = Math.max(0, width / 2 - TICK / 2);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: H, borderRadius: 22, backgroundColor: c.canvasDeep, overflow: 'hidden', boxShadow: `inset 0px 2px 6px 0px ${c.shadow}` }}
    >
      {width > 0 ? (
        <Animated.ScrollView
          ref={ref}
          horizontal
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          snapToOffsets={offsets}
          decelerationRate="fast"
          style={WEB_SNAP}
          {...(WEB ? ({ onTouchStart: userTook, onPointerDown: userTook, onWheel: userTook } as object) : null)}
          overScrollMode="never"
          contentOffset={{ x: startX, y: 0 }}
          contentContainerStyle={{ paddingHorizontal: pad }}
        >
          {Array.from({ length: count }, (_, i) => {
            const lv = min + i;
            const major = lv % 10 === 0;
            const mid = !major && lv % 5 === 0;
            return (
              <View key={lv} style={[{ width: TICK, height: H, alignItems: 'center', paddingTop: 12 }, WEB_SNAP_TICK]}>
                <View style={{ width: major ? 3 : 2, height: major ? 24 : mid ? 17 : 11, borderRadius: 2, backgroundColor: major ? c.leafDeep : c.inkSoft, opacity: major ? 0.9 : 0.35 }} />
                {/* A number every five: with the wider spacing, every ten would leave the ruler bare. */}
                {major || mid ? (
                  <T style={{ position: 'absolute', top: 40, left: (TICK - 56) / 2, width: 56, textAlign: 'center', fontFamily: font.headingBold, fontSize: major ? 14 : 12, lineHeight: 20, color: c.inkSoft, opacity: major ? 1 : 0.75 }}>
                    {lv}
                  </T>
                ) : null}
              </View>
            );
          })}
        </Animated.ScrollView>
      ) : null}
      {/* The ends fade into the ruler, so a number scrolling off goes softly, never cut in half. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 34, backgroundImage: `linear-gradient(to right, ${c.canvasDeep}, ${clearOf(c.canvasDeep)})` }} />
      <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 34, backgroundImage: `linear-gradient(to left, ${c.canvasDeep}, ${clearOf(c.canvasDeep)})` }} />
      {/* The needle: a slim green stem with a bud on top, fixed at the centre. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: width / 2 - 2, top: 6, width: 4, height: 38, borderRadius: 2, backgroundColor: c.leaf }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width / 2 - 7, top: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: c.petalYellow, borderWidth: 3, borderColor: c.leaf }, bud]} />
    </View>
  );
}
