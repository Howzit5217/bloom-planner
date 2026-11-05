import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { scrollTo, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';

/** The handle: a soft white tile, a little taller than wide, centred on the bar. */
const THUMB_W = 54;
const THUMB_H = 62;
/** The bar: a thin lavender line with round ends. */
const BAR_W = 4;
/** Gap between the bar and the screen's edge. */
const EDGE = 14;
const LANE = THUMB_W;

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
  const track: Rail['track'] = (e) => {
    'worklet';
    y.value = e.contentOffset.y;
    content.value = e.contentSize.height;
    view.value = e.layoutMeasurement.height;
    // Shows while you scroll, and slips away a moment after you stop.
    if (!dragging.value) vis.value = withSequence(withTiming(1, { duration: 120 }), withDelay(1300, withTiming(0, { duration: 320 })));
  };
  return { y, content, view, vis, dragging, track };
}

/** One chevron as two thick, round-ended strokes meeting at a point (up or down). */
function Chevron({ up, color }: { up: boolean; color: string }) {
  const len = 13;
  const thick = 4;
  const tilt = up ? 40 : -40;
  return (
    <View style={{ width: 20, height: 11, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: 1.5, width: len, height: thick, borderRadius: thick / 2, backgroundColor: color, transform: [{ rotate: `${-tilt}deg` }] }} />
      <View style={{ position: 'absolute', right: 1.5, width: len, height: thick, borderRadius: thick / 2, backgroundColor: color, transform: [{ rotate: `${tilt}deg` }] }} />
    </View>
  );
}

/**
 * A scroll bar like Pikmin Bloom's: a thin lavender bar down the right of the page and a soft
 * white handle centred on it, with an up and a down arrow, that you can drag to fly through a
 * long page. Long pages only; it shows while scrolling and fades a moment after.
 */
export function ScrollRail({ rail, scrollRef, top = 8, bottom = 8 }: { rail: Rail; scrollRef: AnimatedRef<any>; top?: number; bottom?: number }) {
  const { c } = useTheme();
  const start = useSharedValue(0);
  const lavender = c.dark ? '#6F74C2' : '#C3C6F4';
  const arrow = c.dark ? '#A7ABF2' : '#AEB2F0';

  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      start.set(rail.y.get());
      rail.dragging.set(1);
      rail.vis.set(withTiming(1, { duration: 100 }));
    },
    onUpdate: (e) => {
      'worklet';
      const max = rail.content.get() - rail.view.get();
      const travel = rail.view.get() - top - bottom - THUMB_H;
      if (max <= 0 || travel <= 0) return;
      const to = Math.min(max, Math.max(0, start.get() + (e.translationY / travel) * max));
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
  const thumb = useAnimatedStyle(() => {
    const max = Math.max(1, rail.content.value - rail.view.value);
    const travel = Math.max(0, rail.view.value - top - bottom - THUMB_H);
    return { transform: [{ translateY: Math.min(1, Math.max(0, rail.y.value / max)) * travel }] };
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // A lane as wide as the handle, its middle on the bar: the handle always sits centred on it.
      style={[{ position: 'absolute', right: EDGE - (LANE - BAR_W) / 2, top, bottom, width: LANE, alignItems: 'center' }, box]}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: BAR_W, borderRadius: BAR_W / 2, backgroundColor: lavender }} />
      <GestureDetector gesture={pan}>
        <Animated.View
          hitSlop={{ left: 10, right: 10, top: 8, bottom: 8 }}
          style={[
            {
              position: 'absolute',
              top: 0,
              width: THUMB_W,
              height: THUMB_H,
              borderRadius: 22,
              backgroundColor: c.dark ? c.card : '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              boxShadow: c.dark ? '0px 6px 22px 0px rgba(0,0,0,0.5)' : '0px 6px 24px 0px rgba(110,110,170,0.16), 0px 1px 3px 0px rgba(110,110,170,0.10)',
            },
            thumb,
          ]}
        >
          <Chevron up color={arrow} />
          <Chevron up={false} color={arrow} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
