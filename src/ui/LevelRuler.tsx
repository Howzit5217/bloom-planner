import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { T } from './T';

const TICK = 12;
const H = 74;

interface Props {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

/**
 * A ruler of levels you drag sideways: a flick runs through dozens of levels, and it settles on
 * one with a tick. Follows the value when it changes elsewhere (the ± buttons or typing).
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
  // Only a drag (or its fling) changes the level; a glide to a typed value must not step through.
  const emit = (v: number) => {
    if (!dragging.current) return;
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

  // A change from elsewhere: glide the ruler to it.
  useEffect(() => {
    if (value === emitted.current || dragging.current) return;
    emitted.current = value;
    ref.current?.scrollTo({ x: (value - min) * TICK, animated: true });
  }, [value, min, ref]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.value = e.contentOffset.x;
    },
    onBeginDrag: () => {
      scheduleOnRN(setDragging, true);
    },
    onMomentumEnd: () => {
      scheduleOnRN(setDragging, false);
    },
    onEndDrag: (e) => {
      if (Math.abs(e.velocity?.x ?? 0) < 0.05) scheduleOnRN(setDragging, false);
    },
  });

  // The level under the needle, live while you drag, with a tick per level.
  useAnimatedReaction(
    () => Math.round(x.value / TICK),
    (cur, prev) => {
      if (prev === null || cur === prev) return;
      bob.set(withSequence(withTiming(1.35, { duration: 50 }), withSpring(1, { damping: 8, stiffness: 260 })));
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
          snapToInterval={TICK}
          decelerationRate="normal"
          overScrollMode="never"
          contentOffset={{ x: startX, y: 0 }}
          contentContainerStyle={{ paddingHorizontal: pad }}
        >
          {Array.from({ length: count }, (_, i) => {
            const lv = min + i;
            const major = lv % 10 === 0;
            const mid = !major && lv % 5 === 0;
            return (
              <View key={lv} style={{ width: TICK, height: H, alignItems: 'center', paddingTop: 12 }}>
                <View style={{ width: major ? 3 : 2, height: major ? 24 : mid ? 17 : 11, borderRadius: 2, backgroundColor: major ? c.leafDeep : c.inkSoft, opacity: major ? 0.9 : 0.35 }} />
                {major ? (
                  <T style={{ position: 'absolute', top: 40, left: (TICK - 56) / 2, width: 56, textAlign: 'center', fontFamily: font.headingBold, fontSize: 14, lineHeight: 20, color: c.inkSoft }}>
                    {lv}
                  </T>
                ) : null}
              </View>
            );
          })}
        </Animated.ScrollView>
      ) : null}
      {/* The needle: a slim green stem with a bud on top, fixed at the centre. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: width / 2 - 2, top: 6, width: 4, height: 38, borderRadius: 2, backgroundColor: c.leaf }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width / 2 - 7, top: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: c.petalYellow, borderWidth: 3, borderColor: c.leaf }, bud]} />
    </View>
  );
}
