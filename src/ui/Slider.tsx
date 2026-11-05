import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture, useTapGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';
import { SPRING } from '@/theme/tokens';

interface Props {
  /** 0..1 */
  value: number;
  onChange: (v: number) => void;
  label: string;
  step?: number;
}

const KNOB = 28;

/** Slider on the UI thread. Snaps to `step`; adjustable for screen readers. */
export function Slider({ value, onChange, label, step = 0.05 }: Props) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  const p = useSharedValue(value);
  const start = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    p.value = withSpring(value, SPRING);
  }, [value, p]);

  const commit = (v: number) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(v);
  };

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-14, 14],
    onActivate: () => {
      'worklet';
      start.set(p.get());
      scale.set(withSpring(1.18, SPRING));
    },
    onUpdate: (e) => {
      'worklet';
      if (w.value <= 0) return;
      p.set(Math.min(1, Math.max(0, start.get() + e.translationX / w.get())));
    },
    onDeactivate: () => {
      'worklet';
      scale.set(withSpring(1, SPRING));
      const snapped = Math.round(p.get() / step) * step;
      p.set(withSpring(snapped, SPRING));
      scheduleOnRN(commit, Math.min(1, Math.max(0, snapped)));
    },
  });
  const tap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      if (w.value <= 0) return;
      const snapped = Math.round(Math.min(1, Math.max(0, (e.x - KNOB / 2) / w.get())) / step) * step;
      p.set(withSpring(snapped, SPRING));
      scheduleOnRN(commit, snapped);
    },
  });
  const gesture = useSimultaneousGestures(pan, tap);

  const fill = useAnimatedStyle(() => ({ width: p.value * w.value + KNOB / 2 }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * w.value }, { scale: scale.value }] }));

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100), text: `${Math.round(value * 100)}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const d = e.nativeEvent.actionName === 'increment' ? step : -step;
        onChange(Math.min(1, Math.max(0, Math.round((value + d) / step) * step)));
      }}
    >
      <GestureDetector gesture={gesture}>
        <View
          onLayout={(e) => {
            const lw = e.nativeEvent.layout.width - KNOB;
            setWidth(lw);
            w.set(lw);
          }}
          style={{ height: 44, justifyContent: 'center' }}
        >
          <View style={{ height: 10, borderRadius: 5, backgroundColor: c.leafPale, marginHorizontal: KNOB / 2 - 4 }} />
          <Animated.View style={[{ position: 'absolute', left: KNOB / 2 - 4, height: 10, borderRadius: 5, backgroundColor: c.leaf }, fill]} />
          {width > 0 ? (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  width: KNOB,
                  height: KNOB,
                  borderRadius: KNOB / 2,
                  backgroundColor: '#FFFFFF',
                  boxShadow: `0px 2px 8px 0px ${c.shadow}, 0px 0px 0px 3px ${c.leaf}`,
                },
                knob,
              ]}
            />
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}
