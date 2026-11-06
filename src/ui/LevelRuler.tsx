import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';
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
  /** The number under the needle, as it changes while you slide (at most once a frame). */
  onChange: (v: number) => void;
  /** Where it came to rest: a slide or fling ending, or a tap on the ruler. */
  onSettle?: (v: number) => void;
}

/** On the web, which sends no end of a drag: this long without a new number and it has come to rest. */
const WEB_REST_MS = 250;

/**
 * A ruler of numbers you drag sideways: it moves calmly under the finger, a short flick coasts
 * only a little, and it settles on one with a tick. Follows the value when it changes elsewhere (typing).
 */
export function LevelRuler({ value, min, max, onChange, onSettle }: Props) {
  const { c } = useTheme();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const x = useSharedValue((value - min) * TICK);
  const [width, setWidth] = useState(0);
  // Only the first position goes in as a prop: Android re-applies contentOffset on every render.
  const [startX] = useState(() => (value - min) * TICK);
  const emitted = useRef(value);
  const settled = useRef(value);
  const dragging = useRef(false);
  // The newest number waiting for the next frame: a fast slide passes several in one, and only the
  // last is wanted, never each in turn after the ruler has stopped.
  const pending = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const webRest = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The page's latest callbacks, for numbers reported from a frame, a timer or the scrolling.
  const calls = useRef({ onChange, onSettle });
  useEffect(() => {
    calls.current = { onChange, onSettle };
  });
  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      if (webRest.current) clearTimeout(webRest.current);
    },
    [],
  );
  const count = max - min + 1;
  const bob = useSharedValue(1);
  const bud = useAnimatedStyle(() => ({ transform: [{ scale: bob.value }] }));

  // The places it stops, one per number: exact offsets, as Android rounds a snap interval down to
  // whole pixels, and that error added up level by level until it stopped off the line.
  const offsets = useMemo(() => Array.from({ length: count }, (_, i) => i * TICK), [count]);
  // The value the app itself is gliding to (on the web, where a scroll can't tell who moved it):
  // until it gets there, or a finger or wheel takes over, the scrolling isn't the user's.
  const glide = useRef<number | null>(null);

  // What the scrolling calls, made once: a new number re-renders the ruler, and new functions would
  // set its scroll handlers up again every time, which slowed the number down mid-slide.
  const api = useMemo(() => {
    const clamp = (v: number) => Math.max(min, Math.min(max, v));
    const send = (n: number) => {
      if (n === emitted.current) return;
      emitted.current = n;
      calls.current.onChange(n);
    };
    const flush = () => {
      frame.current = null;
      const n = pending.current;
      pending.current = null;
      if (n != null) send(n);
    };
    // Come to rest on n: the page hears it once, however many ways the stop is reported.
    const rest = (n: number) => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
      pending.current = null;
      send(n);
      if (n === settled.current) return;
      settled.current = n;
      calls.current.onSettle?.(n);
    };
    return {
      userTook: () => {
        glide.current = null;
      },
      // Only a drag (or its fling) changes the level; a glide to a typed value must not step through.
      emit: (v: number) => {
        if (WEB) {
          // The web sends no drag events: every scroll is the user's, except the app's own glide.
          if (glide.current != null) {
            if (v === glide.current) glide.current = null;
            return;
          }
        } else if (!dragging.current) return;
        pending.current = clamp(v);
        if (frame.current == null) frame.current = requestAnimationFrame(flush);
        if (WEB) {
          if (webRest.current) clearTimeout(webRest.current);
          webRest.current = setTimeout(() => rest(pending.current ?? emitted.current), WEB_REST_MS);
        }
      },
      // A tick per level while dragging: a firmer one on every tenth, and a solid stop at either end.
      tick: (lv: number) => {
        if (!dragging.current) return;
        if (lv <= min || lv >= max) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        else if (lv % 10 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        else Haptics.selectionAsync().catch(() => {});
      },
      // A tap on the ruler glides to the number tapped.
      jump: (lv: number) => {
        const n = clamp(lv);
        if (n === emitted.current) return;
        Haptics.selectionAsync().catch(() => {});
        if (WEB) glide.current = n;
        rest(n);
        ref.current?.scrollTo({ x: (n - min) * TICK, animated: true });
      },
      setDragging: (d: boolean) => {
        dragging.current = d;
      },
      // Wherever a drag or fling ends, it finishes exactly on the nearest number's line, and that's
      // the number it rests on.
      settle: (at: number) => {
        const i = Math.max(0, Math.min(max - min, Math.round(at / TICK)));
        if (Math.abs(at - i * TICK) > 0.5) ref.current?.scrollTo({ x: i * TICK, animated: true });
        rest(min + i);
      },
    };
  }, [min, max, ref]);

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
    settled.current = value;
    if (WEB) glide.current = value;
    ref.current?.scrollTo({ x: (value - min) * TICK, animated: true });
  }, [value, min, ref]);

  const { emit, tick, settle, setDragging } = api;
  const onScroll = useAnimatedScrollHandler(
    {
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
    },
    [api],
  );

  // The level under the needle, live while you drag, with a tick per level.
  useAnimatedReaction(
    () => Math.round(x.value / TICK),
    (cur, prev) => {
      if (prev === null || cur === prev) return;
      bob.set(withSequence(withTiming(1.15, { duration: 50 }), withSpring(1, { damping: 12, stiffness: 260 })));
      scheduleOnRN(emit, min + cur);
      scheduleOnRN(tick, min + cur);
    },
    [api],
  );

  // The marks and numbers, drawn once: they don't change as the number does.
  const marks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const lv = min + i;
        const major = lv % 10 === 0;
        const mid = !major && lv % 5 === 0;
        return (
          <Pressable key={lv} onPress={() => api.jump(lv)} style={[{ width: TICK, height: H, alignItems: 'center', paddingTop: 12 }, WEB_SNAP_TICK]}>
            <View style={{ width: major ? 3 : 2, height: major ? 24 : mid ? 17 : 11, borderRadius: 2, backgroundColor: major ? c.leafDeep : c.inkSoft, opacity: major ? 0.9 : 0.35 }} />
            {/* A number every five: with the wider spacing, every ten would leave the ruler bare. */}
            {major || mid ? (
              <T style={{ position: 'absolute', top: 40, left: (TICK - 56) / 2, width: 56, textAlign: 'center', fontFamily: font.headingBold, fontSize: major ? 14 : 12, lineHeight: 20, color: c.inkSoft, opacity: major ? 1 : 0.75 }}>
                {lv}
              </T>
            ) : null}
          </Pressable>
        );
      }),
    [api, c, count, min],
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
          {...(WEB ? ({ onTouchStart: api.userTook, onPointerDown: api.userTook, onWheel: api.userTook } as object) : null)}
          overScrollMode="never"
          contentOffset={{ x: startX, y: 0 }}
          contentContainerStyle={{ paddingHorizontal: pad }}
        >
          {marks}
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
