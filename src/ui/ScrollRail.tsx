import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { scrollTo, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
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

export interface Rail {
  y: SharedValue<number>;
  content: SharedValue<number>;
  view: SharedValue<number>;
  vis: SharedValue<number>;
  dragging: SharedValue<number>;
  /** Call from a scroll handler (a worklet) with the scroll event. */
  track: (e: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } }) => void;
}

/** The state behind a scroll rail: call `track` from the scroll view's animated scroll handler. */
export function useScrollRail(): Rail {
  const y = useSharedValue(0);
  const content = useSharedValue(0);
  const view = useSharedValue(0);
  const vis = useSharedValue(0);
  const dragging = useSharedValue(0);
  const shownAt = useSharedValue(0);
  const track: Rail['track'] = (e) => {
    'worklet';
    y.value = e.contentOffset.y;
    // The page's size only when it changes: the handle's length (a layout change) follows it, and
    // laying the page out again on every frame of a scroll made scrolling stutter.
    if (content.value !== e.contentSize.height) content.value = e.contentSize.height;
    if (view.value !== e.layoutMeasurement.height) view.value = e.layoutMeasurement.height;
    // Shows while you scroll, and slips away a moment after you stop (started afresh a few times a
    // second, not on every scroll event).
    const now = Date.now();
    if (!dragging.value && now - shownAt.value > 250) {
      shownAt.value = now;
      vis.value = withSequence(withTiming(1, { duration: 120 }), withDelay(1300, withTiming(0, { duration: 320 })));
    }
  };
  return { y, content, view, vis, dragging, track };
}

/**
 * A scroll bar like Pikmin Bloom's: a thin lavender bar flush with the right edge, darker where you
 * are on the page. Drag that part to fly through a long page. Long pages only; it shows while
 * scrolling and fades a moment after.
 */
export function ScrollRail({ rail, scrollRef, top = 8, bottom = 8 }: { rail: Rail; scrollRef: AnimatedRef<any>; top?: number; bottom?: number }) {
  const { c } = useTheme();
  const start = useSharedValue(0);
  const trackColor = c.dark ? 'rgba(167,171,242,0.28)' : 'rgba(141,146,224,0.28)';
  const handleColor = c.dark ? '#A7ABF2' : '#8D92E0';

  // The handle's length shows how much of the page fits on screen.
  const geometry = () => {
    'worklet';
    const trackLen = Math.max(0, rail.view.value - top - bottom);
    const len = rail.content.value > 0 ? Math.max(MIN_HANDLE, Math.min(trackLen, (rail.view.value / rail.content.value) * trackLen)) : MIN_HANDLE;
    return { trackLen, len, travel: Math.max(0, trackLen - len), max: Math.max(1, rail.content.value - rail.view.value) };
  };

  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      start.set(rail.y.get());
      rail.dragging.set(1);
      rail.vis.set(withTiming(1, { duration: 100 }));
    },
    onUpdate: (e) => {
      'worklet';
      const g = geometry();
      if (rail.content.get() <= rail.view.get() || g.travel <= 0) return;
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
  const box = useAnimatedStyle(() => ({ opacity: rail.content.value > rail.view.value + 40 ? rail.vis.value : 0 }));
  // Where the handle is moves with every frame of a scroll, as a transform; its length (a layout
  // change) only when the page's size changes.
  const grab = useAnimatedStyle(() => {
    const g = geometry();
    return { transform: [{ translateY: Math.min(1, Math.max(0, rail.y.value / g.max)) * g.travel }] };
  });
  const length = useAnimatedStyle(() => ({ height: geometry().len }));

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
        <Animated.View style={[{ position: 'absolute', top: 0, right: 0, width: GRAB_W }, grab]}>
          <Animated.View style={[{ alignItems: 'flex-end', paddingRight: EDGE }, length]}>
            <View style={{ flex: 1, width: HANDLE_W, borderRadius: HANDLE_W / 2, backgroundColor: handleColor }} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
