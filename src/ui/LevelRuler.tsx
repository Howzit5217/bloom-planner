import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { clearOf } from './color';
import { useGlide } from './glide';
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
/** On the web, the browser's own glide to a number is surely done by then. */
const WEB_GLIDE_MS = 900;

/**
 * A ruler of numbers you drag sideways: it moves calmly under the finger, a short flick coasts
 * only a little, and it settles on one with a tick. Follows the value when it changes elsewhere (typing).
 */
export function LevelRuler({ value, min, max, onChange, onSettle }: Props) {
  const { c } = useTheme();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const x = useSharedValue((value - min) * TICK);
  // Gliding to a number runs at the app's own pace, whatever the device's animation speed.
  const slide = useGlide(ref, true);
  const [width, setWidth] = useState(0);
  // Only the first position goes in as a prop: Android re-applies contentOffset on every render.
  const [startX] = useState(() => (value - min) * TICK);
  const emitted = useRef(value);
  const settled = useRef(value);
  // A finger on the ruler, known on the UI thread where the scroll events arrive, in their order: a
  // flag set from them on the JS side could land late (a fling's end after the next drag began) and
  // left the number standing still for a whole drag.
  const touching = useSharedValue(0);
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
  // until it gets there, a finger or wheel takes over, or long enough has passed for it to have
  // arrived, the scrolling isn't the user's. (Waiting on the exact arrival alone, a glide that ended
  // a whisker off left the number standing still.)
  const glide = useRef<{ to: number; until: number } | null>(null);
  const glideTo = (n: number) => {
    glide.current = { to: n, until: Date.now() + WEB_GLIDE_MS };
  };

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
      // Every level the ruler passes is the number, except on the app's own glide to a number already
      // showing (a typed one, or a tap): it mustn't step through the ones between.
      emit: (v: number) => {
        if (WEB && glide.current) {
          // The web sends no drag events: every scroll is the user's, except the app's own glide.
          const g = glide.current;
          if (v === g.to || Date.now() > g.until) glide.current = null;
          if (v === g.to || Date.now() <= g.until) return;
        }
        pending.current = clamp(v);
        if (frame.current == null) frame.current = requestAnimationFrame(flush);
        if (WEB) {
          if (webRest.current) clearTimeout(webRest.current);
          webRest.current = setTimeout(() => rest(pending.current ?? emitted.current), WEB_REST_MS);
        }
      },
      // A tick per level as it moves: a firmer one on every tenth, and a solid stop at either end.
      tick: (lv: number) => {
        if (lv <= min || lv >= max) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        else if (lv % 10 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        else Haptics.selectionAsync().catch(() => {});
      },
      // A tap on the ruler glides to the number tapped.
      jump: (lv: number) => {
        const n = clamp(lv);
        if (n === emitted.current) return;
        Haptics.selectionAsync().catch(() => {});
        if (WEB) glideTo(n);
        rest(n);
        slide.go((n - min) * TICK, x.get());
      },
      // Wherever a drag or fling ends, it finishes exactly on the nearest number's line, and that's
      // the number it rests on.
      settle: (at: number) => {
        const i = Math.max(0, Math.min(max - min, Math.round(at / TICK)));
        if (Math.abs(at - i * TICK) > 0.5) slide.go(i * TICK, at);
        rest(min + i);
      },
    };
  }, [min, max, slide, x]);

  // Once laid out, sit on the value: the web ignores contentOffset, so it would open at the start.
  useEffect(() => {
    if (width <= 0) return;
    const id = requestAnimationFrame(() => ref.current?.scrollTo({ x: (emitted.current - min) * TICK, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [width, min, ref]);

  // A change from elsewhere: glide the ruler to it (never out from under a finger).
  useEffect(() => {
    if (value === emitted.current || touching.get()) return;
    emitted.current = value;
    settled.current = value;
    if (WEB) glideTo(value);
    slide.go((value - min) * TICK, x.get());
  }, [value, min, slide, x, touching]);

  const { emit, tick, settle } = api;
  const gliding = slide.active;
  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        x.set(e.contentOffset.x);
      },
      onBeginDrag: () => {
        // A finger takes over from any glide.
        touching.set(1);
        slide.stop();
      },
      onEndDrag: (e) => {
        touching.set(0);
        if (Math.abs(e.velocity?.x ?? 0) < 0.05) scheduleOnRN(settle, e.contentOffset.x);
      },
      onMomentumEnd: (e) => {
        // A fling's end reported once the next drag has begun: that drag settles it instead, and no
        // glide pulls the ruler out from under the finger.
        if (touching.get()) return;
        scheduleOnRN(settle, e.contentOffset.x);
      },
    },
    [api, touching, gliding],
  );

  // The level under the needle, live as the ruler moves (a finger, a fling, its settling), with a
  // tick per level; not on the app's own glide, where the number is already the one it's going to.
  useAnimatedReaction(
    () => Math.round(x.value / TICK),
    (cur, prev) => {
      if (prev === null || cur === prev || gliding.get()) return;
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
          // Not a stop for the keyboard: a focused tick made the browser scroll the ruler to it, away from the number.
          <Pressable key={lv} tabIndex={-1} onPress={() => api.jump(lv)} style={[{ width: TICK, height: H, alignItems: 'center', paddingTop: 12 }, WEB_SNAP_TICK]}>
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
          // The number is the keyboard's way in (tap to type): the ruler is no stop for Tab, which took focus mid-glide and stopped it.
          tabIndex={-1}
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
