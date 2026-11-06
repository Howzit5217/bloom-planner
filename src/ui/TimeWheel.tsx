import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { interpolate, interpolateColor, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { uses12HourClock } from '@/engine/calendar';
import { useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { T } from './T';
import { useGlide } from './glide';
import { t } from '@/i18n';

const ITEM = 50;
const VISIBLE = 5;
const MINUTE_STEP = 5;

/** Whether this phone writes times as "1:00 PM" rather than "13:00". */
export const TWELVE_HOUR = uses12HourClock(new Date(2020, 0, 1, 13).toLocaleTimeString([], { hour: 'numeric' }));

/** "8:30 PM" or "20:30", the way the phone writes it. */
export function fmtClock(hour: number, minute: number): string {
  const d = new Date(2020, 0, 1, hour, minute);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const HOURS_12 = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0'));

interface Props {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}

/** The app's own time picker: scrolling wheels on a paper card, the chosen row on a soft green band. */
export function TimeWheel({ hour, minute, onChange }: Props) {
  const { c } = useTheme();
  const m = Math.min(MINUTES.length - 1, Math.round(minute / MINUTE_STEP));
  const pm = hour >= 12;
  const hIndex = TWELVE_HOUR ? hour % 12 : hour;
  const to24 = (i: number, isPm: boolean) => (TWELVE_HOUR ? (i % 12) + (isPm ? 12 : 0) : i);

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 26,
        paddingVertical: 8,
        paddingHorizontal: 14,
        boxShadow: `0px 6px 24px 0px ${c.shadow}, 0px 1px 3px 0px ${c.shadow}, inset 0px 1px 0px 0px ${c.cardHighlight}`,
      }}
    >
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 10, right: 10, top: 8 + ITEM * 2, height: ITEM, borderRadius: ITEM / 2, backgroundColor: c.leafPale }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Wheel label={t('Hour')} items={TWELVE_HOUR ? HOURS_12 : HOURS_24} index={hIndex} width={84} onIndex={(i) => onChange(to24(i, pm), m * MINUTE_STEP)} />
        <T style={{ fontFamily: font.heading, fontSize: 30, lineHeight: 40, color: c.leafDeep, marginTop: -4 }}>:</T>
        <Wheel label={t('Minutes')} items={MINUTES} index={m} width={84} onIndex={(i) => onChange(hour, i * MINUTE_STEP)} />
        {TWELVE_HOUR ? <Wheel label={t('AM or PM')} items={[t('AM'), t('PM')]} index={pm ? 1 : 0} width={84} onIndex={(i) => onChange(to24(hIndex, i === 1), m * MINUTE_STEP)} /> : null}
      </View>
    </View>
  );
}

interface WheelProps {
  label: string;
  items: string[];
  index: number;
  width: number;
  onIndex: (i: number) => void;
}

function Wheel({ label, items, index, width, onIndex }: WheelProps) {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const y = useSharedValue(index * ITEM);
  // A tap or a screen reader's step glides there at the app's own pace, whatever the device's animation speed.
  const slide = useGlide(ref, false);
  const last = useRef(index);
  const placed = useRef(false);
  // Only the first position goes in as a prop: Android re-applies contentOffset on every render.
  const [startY] = useState(() => index * ITEM);
  const clamp = (i: number) => Math.max(0, Math.min(items.length - 1, i));

  const settle = (offset: number) => {
    const i = clamp(Math.round(offset / ITEM));
    if (i !== last.current) {
      last.current = i;
      onIndex(i);
    }
  };
  const tick = () => {
    Haptics.selectionAsync().catch(() => {});
  };
  const jump = (i: number) => {
    const t = clamp(i);
    slide.go(t * ITEM, y.get());
    if (t !== last.current) {
      last.current = t;
      onIndex(t);
    }
  };

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      y.value = e.contentOffset.y;
    },
    onBeginDrag: () => {
      slide.stop();
    },
    onEndDrag: (e) => {
      // No fling: settle now. With a fling, wait for the momentum to end.
      if (Math.abs(e.velocity?.y ?? 0) < 0.05) scheduleOnRN(settle, e.contentOffset.y);
    },
    onMomentumEnd: (e) => {
      scheduleOnRN(settle, e.contentOffset.y);
    },
  });

  // A light tick each time a new row passes the band, like a real wheel.
  useAnimatedReaction(
    () => Math.round(y.value / ITEM),
    (cur, prev) => {
      if (prev !== null && cur !== prev) scheduleOnRN(tick);
    },
  );

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[clamp(index)] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => jump(last.current + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      style={{ width, height: ITEM * VISIBLE }}
    >
      <Animated.ScrollView
        ref={ref}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        nestedScrollEnabled
        overScrollMode="never"
        contentOffset={{ x: 0, y: startY }}
        onLayout={() => {
          if (placed.current) return;
          placed.current = true;
          ref.current?.scrollTo({ y: startY, animated: false });
        }}
        contentContainerStyle={{ paddingVertical: ITEM * 2 }}
      >
        {items.map((text, i) => (
          <WheelItem key={text} i={i} y={y} text={text} onPress={() => jump(i)} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function WheelItem({ i, y, text, onPress }: { i: number; y: SharedValue<number>; text: string; onPress: () => void }) {
  const { c } = useTheme();
  const style = useAnimatedStyle(() => {
    const d = Math.abs(y.value / ITEM - i);
    return {
      opacity: interpolate(d, [0, 1, 2, 2.6], [1, 0.5, 0.2, 0], 'clamp'),
      transform: [{ perspective: 400 }, { rotateX: `${interpolate(y.value / ITEM - i, [-2.5, 0, 2.5], [-55, 0, 55], 'clamp')}deg` }, { scale: interpolate(d, [0, 1, 2], [1, 0.82, 0.7], 'clamp') }],
    };
  });
  const color = useAnimatedStyle(() => {
    const d = Math.abs(y.value / ITEM - i);
    return { color: interpolateColor(d, [0, 0.8], [c.leafDeep, c.ink]) };
  });
  return (
    <Animated.View style={[{ height: ITEM, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.Text
        onPress={onPress}
        suppressHighlighting
        maxFontSizeMultiplier={1.3}
        style={[{ fontFamily: font.heading, fontSize: 30, lineHeight: 40, includeFontPadding: false, paddingHorizontal: 10 }, color]}
      >
        {text}
      </Animated.Text>
    </Animated.View>
  );
}
