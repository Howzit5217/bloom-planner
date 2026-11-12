import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Platform, View } from 'react-native';
import { GestureDetector, usePanGesture, type PanGestureConfig } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { clearOf } from './color';
import { T } from './T';
import { shadow } from './shadow';

/** Room per number: wide enough that a drag moves calmly, a number at a time. */
const TICK = 22;
const H = 74;

const WEB = Platform.OS === 'web';

/** How far a flick carries on once the finger lets go, as seconds of its speed: a short flick coasts only a little. */
const COAST_S = 0.14;
/** Past either end the ruler gives a little under the finger (this share of the pull), then springs back. */
const GIVE = 0.3;
/** Moved less than this, a touch is a tap. */
const TAP_SLOP = 6;
/** The web's wheel or trackpad: this long without a turn and the ruler settles on a number. */
const WHEEL_REST_MS = 160;
/** A tick this late is no longer felt as the number passing. */
const TICK_LATE_MS = 120;

/** How long the app's own glide to a number takes: a short hop quickly, a long way a little longer. */
const glideMs = (distance: number) => {
  'worklet';
  return Math.round(Math.min(420, 200 + Math.sqrt(Math.abs(distance)) * 5));
};

interface Props {
  value: number;
  min: number;
  max: number;
  /** The number under the needle, as it changes while you slide (at most once a frame). */
  onChange: (v: number) => void;
  /** Where it came to rest: a slide or fling ending, or a tap on the ruler. */
  onSettle?: (v: number) => void;
  /**
   * The number under the needle, set on the UI thread the moment it changes: what to show over the
   * ruler, so it keeps up however busy the JS side is (LiveGameNumber).
   */
  shown?: SharedValue<number>;
}

/**
 * A ruler of numbers you drag sideways: it moves calmly under the finger, a short flick coasts only
 * a little, and it settles on one with a tick. A tap on it goes to the number tapped; it follows the
 * value when it changes elsewhere (typing).
 *
 * Everything that moves it (the finger, the coast after it, the settling on a number, a tap, a typed
 * value) moves one number on the UI thread, `at`. It used to be a scroll view, moved by the finger,
 * by Android's own snapping and by the app's glides all at once: after the first slide they could
 * leave the view's own idea of where it was out of step, and the next slide jumped, stuck or fought
 * the finger. Here a touch always takes the ruler from exactly where it is.
 */
export function LevelRuler({ value, min, max, onChange, onSettle, shown: shownProp }: Props) {
  const { c } = useTheme();
  const count = Math.max(1, max - min + 1);
  const end = (count - 1) * TICK;
  const [width, setWidth] = useState(0);
  const clampValue = (v: number) => Math.max(min, Math.min(max, v));
  // Where the ruler is: points from its first number to the needle.
  const at = useSharedValue((clampValue(value) - min) * TICK);
  // Where it was when the finger came down, and where the finger came down on it.
  const from = useSharedValue(0);
  const downX = useSharedValue(0);
  const downY = useSharedValue(0);
  // A finger on it that has started to slide it.
  const touching = useSharedValue(0);
  // It was moving on its own (coasting, settling, gliding) when the finger came down: lifting
  // without a slide then leaves it there, rather than counting as a tap.
  const caught = useSharedValue(0);
  // The app's own glide to a number already showing (a typed one, or a tap): it doesn't step through
  // the numbers between.
  const auto = useSharedValue(0);
  const moving = useSharedValue(0);
  const own = useSharedValue(value);
  const shown = shownProp ?? own;
  const bob = useSharedValue(1);
  const bud = useAnimatedStyle(() => ({ transform: [{ scale: bob.value }] }));

  const emitted = useRef(value);
  const settled = useRef(value);
  // The newest number waiting for the next frame: a fast slide passes several in one, and only the
  // last is wanted, never each in turn after the ruler has stopped.
  const pending = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  // The page's latest callbacks, for numbers reported from a frame or the UI thread.
  const calls = useRef({ onChange, onSettle });
  useEffect(() => {
    calls.current = { onChange, onSettle };
  });
  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // What the UI thread calls back, made once for the ruler's life.
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
    // Come to rest on n: the page hears it once.
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
      // Each number the ruler passes, as it passes it.
      emit: (v: number) => {
        pending.current = clamp(v);
        if (frame.current == null) frame.current = requestAnimationFrame(flush);
      },
      rest: (v: number) => rest(clamp(v)),
      // A tap: the number at once, while the ruler glides over to it.
      tapped: (v: number) => {
        Haptics.selectionAsync().catch(() => {});
        rest(clamp(v));
      },
      // A tick per number as it moves: a firmer one on every tenth, and a solid stop at either end.
      // One arriving late (the JS side busy) is left out: a burst of them after the ruler stopped felt broken.
      tick: (lv: number, when: number) => {
        if (Date.now() - when > TICK_LATE_MS) return;
        if (lv <= min || lv >= max) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        else if (lv % 10 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        else Haptics.selectionAsync().catch(() => {});
      },
    };
  }, [min, max]);

  // The gesture, set up once (again only if the ruler's size or range changes). Handed new
  // functions on every render, it was set up afresh each time a slide's own numbers re-rendered
  // the ruler, right in the middle of the slide.
  const config = useMemo((): PanGestureConfig => {
    // From the finger's speed to a stop exactly on a number's line, never past it: the number there
    // is the one it rests on.
    const settleTo = (target: number, speed: number) => {
      'worklet';
      moving.set(1);
      at.set(
        withSpring(target, { velocity: speed, stiffness: 220, damping: 26, mass: 1, overshootClamping: true }, (done) => {
          if (!done) return;
          moving.set(0);
          scheduleOnRN(api.rest, min + Math.round(target / TICK));
        }),
      );
    };
    const nearest = (p: number) => {
      'worklet';
      return Math.max(0, Math.min(end, Math.round(p / TICK) * TICK));
    };
    return {
      activeOffsetX: [-TAP_SLOP, TAP_SLOP],
      // Up or down is the page's (or a sheet's) to scroll.
      failOffsetY: [-14, 14],
      onBegin: (e) => {
        'worklet';
        // A finger stops it wherever it's going, and takes it from there.
        caught.set(moving.get());
        cancelAnimation(at);
        auto.set(0);
        moving.set(0);
        from.set(at.get());
        downX.set(e.x);
        downY.set(e.y);
      },
      onActivate: () => {
        'worklet';
        touching.set(1);
        from.set(at.get());
      },
      onUpdate: (e) => {
        'worklet';
        const raw = from.get() - e.translationX;
        at.set(raw < 0 ? raw * GIVE : raw > end ? end + (raw - end) * GIVE : raw);
      },
      onDeactivate: (e) => {
        'worklet';
        // Taken over part way (the page scrolling instead), it settles where it is; let go, the ruler
        // moves the other way to the finger, and a flick carries it on a little.
        const speed = e.canceled ? 0 : -e.velocityX;
        settleTo(nearest(at.get() + speed * COAST_S), speed);
      },
      onFinalize: (e) => {
        'worklet';
        if (touching.get()) {
          touching.set(0);
          return;
        }
        if (!caught.get() && Math.abs(e.x - downX.get()) < TAP_SLOP && Math.abs(e.y - downY.get()) < TAP_SLOP && width > 0) {
          // A tap: the number under it at once, with the ruler gliding over.
          const target = nearest(at.get() + e.x - width / 2);
          shown.set(min + Math.round(target / TICK));
          scheduleOnRN(api.tapped, min + Math.round(target / TICK));
          auto.set(1);
          moving.set(1);
          at.set(
            withTiming(target, { duration: glideMs(target - at.get()), easing: Easing.out(Easing.cubic) }, (done) => {
              if (!done) return;
              auto.set(0);
              moving.set(0);
            }),
          );
          return;
        }
        // Stopped by a touch, or let go of before it slid: onto the nearest number.
        settleTo(nearest(at.get()), 0);
      },
    };
  }, [api, at, auto, caught, downX, downY, end, from, min, moving, shown, touching, width]);
  const pan = usePanGesture(config);

  // A change from elsewhere (typed): the ruler glides there, never out from under a finger.
  useEffect(() => {
    if (value === emitted.current || touching.get()) return;
    const v = clampValue(value);
    emitted.current = v;
    settled.current = v;
    shown.set(v);
    const target = (v - min) * TICK;
    cancelAnimation(at);
    auto.set(1);
    moving.set(1);
    at.set(
      withTiming(target, { duration: glideMs(target - at.get()), easing: Easing.out(Easing.cubic) }, (done) => {
        if (!done) return;
        auto.set(0);
        moving.set(0);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min]);

  // The web's mouse wheel and trackpad: they slide it too, and it settles once they stop.
  const box = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!WEB) return;
    const node = box.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    let rest: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      cancelAnimation(at);
      auto.set(0);
      at.set(Math.max(0, Math.min(end, at.get() + d * 0.5)));
      if (rest) clearTimeout(rest);
      rest = setTimeout(() => {
        const target = Math.max(0, Math.min(end, Math.round(at.get() / TICK) * TICK));
        moving.set(1);
        at.set(
          withTiming(target, { duration: 160, easing: Easing.out(Easing.cubic) }, (done) => {
            if (!done) return;
            moving.set(0);
            scheduleOnRN(api.rest, min + Math.round(target / TICK));
          }),
        );
      }, WHEEL_REST_MS);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      if (rest) clearTimeout(rest);
    };
  }, [api, at, auto, end, min, moving]);

  // The number under the needle, live as the ruler moves (a finger, a coast, its settling), with a
  // tick per number; not on the app's own glide, where the number is already the one it's going to.
  useAnimatedReaction(
    () => Math.max(0, Math.min(count - 1, Math.round(at.value / TICK))),
    (cur, prev) => {
      if (prev === null || cur === prev || auto.get()) return;
      shown.set(min + cur);
      bob.set(withSequence(withTiming(1.15, { duration: 50 }), withSpring(1, { damping: 12, stiffness: 260 })));
      scheduleOnRN(api.emit, min + cur);
      scheduleOnRN(api.tick, min + cur, Date.now());
    },
    [api, count, min, shown],
  );

  // The marks slide under the needle: the number at `at` sits in the middle.
  const pad = width / 2 - TICK / 2;
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: pad - at.value }] }));

  // The marks and numbers, drawn once: they don't change as the number does.
  const marks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const lv = min + i;
        const major = lv % 10 === 0;
        const mid = !major && lv % 5 === 0;
        return (
          <View key={lv} style={{ width: TICK, height: H, alignItems: 'center', paddingTop: 12 }}>
            <View style={{ width: major ? 3 : 2, height: major ? 24 : mid ? 17 : 11, borderRadius: 2, backgroundColor: major ? c.leafDeep : c.inkSoft, opacity: major ? 0.9 : 0.35 }} />
            {/* A number every five: with the wider spacing, every ten would leave the ruler bare. */}
            {major || mid ? (
              <T style={{ position: 'absolute', top: 40, left: (TICK - 56) / 2, width: 56, textAlign: 'center', fontFamily: font.headingBold, fontSize: major ? 14 : 12, lineHeight: 20, color: c.inkSoft, opacity: major ? 1 : 0.75 }}>
                {lv}
              </T>
            ) : null}
          </View>
        );
      }),
    [c, count, min],
  );

  return (
    <GestureDetector gesture={pan}>
      <View
        ref={box}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: H, borderRadius: 22, backgroundColor: c.canvasDeep, overflow: 'hidden', ...shadow(`inset 0px 2px 6px 0px ${c.shadow}`) }}
      >
        {width > 0 ? <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height: H, width: count * TICK, flexDirection: 'row' }, row]}>{marks}</Animated.View> : null}
        {/* The ends fade into the ruler, so a number sliding off goes softly, never cut in half. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 34, backgroundImage: `linear-gradient(to right, ${c.canvasDeep}, ${clearOf(c.canvasDeep)})` }} />
        <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 34, backgroundImage: `linear-gradient(to left, ${c.canvasDeep}, ${clearOf(c.canvasDeep)})` }} />
        {/* The needle: a slim green stem with a bud on top, fixed at the centre. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: width / 2 - 2, top: 6, width: 4, height: 38, borderRadius: 2, backgroundColor: c.leaf }} />
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width / 2 - 7, top: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: c.petalYellow, borderWidth: 3, borderColor: c.leaf }, bud]} />
      </View>
    </GestureDetector>
  );
}
