import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { scrollTo, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';

/** The track: a thin lavender line down the right edge. */
const TRACK_W = 4;
/** The handle: the bar itself, a little wider and darker where you are on the page. */
const HANDLE_W = 6;
const MIN_HANDLE = 40;
/** Gap between the bar and the screen's edge. */
const EDGE = 3;
/** The invisible grab area around the handle, so it's easy to catch with a thumb. */
const GRAB_W = 22;
const GRAB_MIN = 56;
/** The handle's middle: a bar this tall, stretched to the handle's length (a stretch needs no new layout). */
const MID = 100;

export interface Rail {
  y: SharedValue<number>;
  content: SharedValue<number>;
  view: SharedValue<number>;
  vis: SharedValue<number>;
  dragging: SharedValue<number>;
  /** Call from a scroll handler (a worklet) with the scroll event. */
  track: (e: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } }) => void;
  /**
   * For the scroller's `onContentSizeChange` and `onLayout`: the page's size as soon as it's laid out
   * or changes (a section opening, a list filling in), so the bar is the right length the moment it
   * shows, not only after a scroll has reported it.
   */
  onContentSizeChange: (width: number, height: number) => void;
  onLayout: (e: LayoutChangeEvent) => void;
}

/** The state behind a scroll rail: call `track` from the scroll view's animated scroll handler. */
export function useScrollRail(): Rail {
  const y = useSharedValue(0);
  const content = useSharedValue(0);
  const view = useSharedValue(0);
  const vis = useSharedValue(0);
  const dragging = useSharedValue(0);
  const shownAt = useSharedValue(0);
  // One for the page's life, so effects that use it don't run again on every render.
  return useMemo<Rail>(() => {
    const track: Rail['track'] = (e) => {
      'worklet';
      y.set(e.contentOffset.y);
      if (content.get() !== e.contentSize.height) content.set(e.contentSize.height);
      if (view.get() !== e.layoutMeasurement.height) view.set(e.layoutMeasurement.height);
      // Shows while you scroll, and slips away a moment after you stop (started afresh a few times a
      // second, not on every scroll event).
      const now = Date.now();
      if (!dragging.get() && now - shownAt.get() > 250) {
        shownAt.set(now);
        vis.set(withSequence(withTiming(1, { duration: 120 }), withDelay(1300, withTiming(0, { duration: 320 }))));
      }
    };
    return {
      y,
      content,
      view,
      vis,
      dragging,
      track,
      onContentSizeChange: (_w, h) => content.set(h),
      onLayout: (e) => view.set(e.nativeEvent.layout.height),
    };
  }, [y, content, view, vis, dragging, shownAt]);
}

/**
 * A scroll bar like Pikmin Bloom's: a thin lavender bar flush with the right edge, darker where you
 * are on the page. Drag that part to fly through a long page. Long pages only; it shows while
 * scrolling and fades a moment after. The handle moves and stretches by transforms alone, both from
 * the same numbers on the same frame, so its length never lags behind where it is; and only while it
 * shows can it be caught, so a swipe along the edge of the page always just scrolls it.
 */
export function ScrollRail({ rail, scrollRef, top = 8, bottom = 8 }: { rail: Rail; scrollRef: AnimatedRef<any>; top?: number; bottom?: number }) {
  const { c } = useTheme();
  const start = useSharedValue(0);
  const trackColor = c.dark ? 'rgba(167,171,242,0.28)' : 'rgba(141,146,224,0.28)';
  const handleColor = c.dark ? '#A7ABF2' : '#8D92E0';

  // The handle's length shows how much of the page fits on screen. Each worklet below reads the
  // sizes itself and passes them in: Reanimated only follows the values a worklet reads directly, so
  // a length read inside this helper alone never updated (the bar kept a stale length).
  const { y, content, view, vis } = rail;
  const lengthOf = (pageH: number, viewH: number) => {
    'worklet';
    const trackLen = Math.max(0, viewH - top - bottom);
    const len = pageH > 0 ? Math.max(MIN_HANDLE, Math.min(trackLen, (viewH / pageH) * trackLen)) : MIN_HANDLE;
    return { trackLen, len, travel: Math.max(0, trackLen - len), max: Math.max(1, pageH - viewH) };
  };

  // The grab area's height is laid out (it's only for touches), so it follows the handle's length by
  // React, which is only when the page's size changes.
  const [grabLen, setGrabLen] = useState(GRAB_MIN);
  useAnimatedReaction(
    () => Math.max(GRAB_MIN, Math.round(lengthOf(content.value, view.value).len)),
    (now, before) => {
      if (now !== before) scheduleOnRN(setGrabLen, now);
    },
  );
  // Caught only while it shows (and the page is long enough to have it).
  const [catchable, setCatchable] = useState(false);
  useAnimatedReaction(
    () => vis.value > 0.05 && content.value > view.value + 40,
    (now, before) => {
      if (now !== before) scheduleOnRN(setCatchable, now);
    },
  );

  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      start.set(rail.y.get());
      rail.dragging.set(1);
      rail.vis.set(withTiming(1, { duration: 100 }));
    },
    onUpdate: (e) => {
      'worklet';
      const g = lengthOf(content.get(), view.get());
      if (content.get() <= view.get() || g.travel <= 0) return;
      const to = Math.min(g.max, Math.max(0, start.get() + (e.translationY / g.travel) * g.max));
      scrollTo(scrollRef, 0, to, false);
    },
    onDeactivate: () => {
      'worklet';
      rail.dragging.set(0);
      rail.vis.set(withDelay(1100, withTiming(0, { duration: 320 })));
    },
  });

  // Only for pages long enough to need it.
  const box = useAnimatedStyle(() => ({ opacity: content.value > view.value + 40 ? vis.value : 0 }));
  // Where you are on the page, every frame of a scroll: the grab area, centred on the handle.
  const grab = useAnimatedStyle(() => {
    const g = lengthOf(content.value, view.value);
    const at = Math.min(1, Math.max(0, y.value / g.max)) * g.travel;
    return { transform: [{ translateY: at + g.len / 2 - grabLen / 2 }] };
  });
  // The handle about the grab area's middle: two round ends and the stretch between them, which
  // change only with the page's size.
  const topEnd = useAnimatedStyle(() => ({ transform: [{ translateY: grabLen / 2 - lengthOf(content.value, view.value).len / 2 }] }));
  const bottomEnd = useAnimatedStyle(() => ({ transform: [{ translateY: grabLen / 2 + lengthOf(content.value, view.value).len / 2 - HANDLE_W }] }));
  const middle = useAnimatedStyle(() => {
    const run = Math.max(0, lengthOf(content.value, view.value).len - HANDLE_W);
    return { transform: [{ translateY: grabLen / 2 - MID / 2 }, { scaleY: Math.max(0.001, run / MID) }] };
  });
  const piece = { position: 'absolute', top: 0, right: EDGE, width: HANDLE_W, backgroundColor: handleColor } as const;

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ position: 'absolute', right: 0, top, bottom, width: GRAB_W }, box]}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, right: EDGE + (HANDLE_W - TRACK_W) / 2, width: TRACK_W, borderRadius: TRACK_W / 2, backgroundColor: trackColor }} />
      <GestureDetector gesture={pan}>
        {/* The grab area is wide and clear; only the bar inside it shows. */}
        <Animated.View pointerEvents={catchable ? 'auto' : 'none'} style={[{ position: 'absolute', top: 0, right: 0, width: GRAB_W, height: grabLen }, grab]}>
          <Animated.View pointerEvents="none" style={[piece, { height: MID }, middle]} />
          <Animated.View pointerEvents="none" style={[piece, { height: HANDLE_W, borderRadius: HANDLE_W / 2 }, topEnd]} />
          <Animated.View pointerEvents="none" style={[piece, { height: HANDLE_W, borderRadius: HANDLE_W / 2 }, bottomEnd]} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
