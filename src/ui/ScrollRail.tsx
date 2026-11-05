import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { scrollTo, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { Icon } from './Icon';

const THUMB_H = 56;
const THUMB_W = 48;
/** How much of the handle tucks past the screen's edge, as in the game. */
const TUCK = 12;

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

/**
 * A scroll bar like Pikmin Bloom's: a thin lavender track down the right edge and a soft white
 * handle with up and down arrows that you can drag to fly through a long page.
 */
export function ScrollRail({ rail, scrollRef, top = 8, bottom = 8 }: { rail: Rail; scrollRef: AnimatedRef<any>; top?: number; bottom?: number }) {
  const { c } = useTheme();
  const start = useSharedValue(0);
  const lavender = c.dark ? '#7075BE' : '#BFC2F2';
  const arrow = c.dark ? '#A9ADF0' : '#A6AAEE';

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
    <Animated.View pointerEvents="box-none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', right: 0, top, bottom, width: THUMB_W }, box]}>
      <View pointerEvents="none" style={{ position: 'absolute', right: 3, top: 0, bottom: 0, width: 4, borderRadius: 2, backgroundColor: lavender }} />
      <GestureDetector gesture={pan}>
        <Animated.View
          hitSlop={{ left: 12, top: 8, bottom: 8 }}
          style={[
            {
              position: 'absolute',
              top: 0,
              right: -TUCK,
              width: THUMB_W + TUCK,
              height: THUMB_H,
              borderRadius: THUMB_H / 2,
              backgroundColor: c.card,
              alignItems: 'center',
              justifyContent: 'center',
              paddingRight: TUCK,
              boxShadow: `0px 4px 16px 0px ${c.dark ? 'rgba(0,0,0,0.45)' : 'rgba(90,80,140,0.16)'}`,
            },
            thumb,
          ]}
        >
          <View style={{ marginBottom: -7 }}>
            <Icon name="chevron-up" size={22} color={arrow} />
          </View>
          <View style={{ marginTop: -7 }}>
            <Icon name="chevron-down" size={22} color={arrow} />
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
