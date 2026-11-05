import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { T } from './T';

interface Props<K extends string> {
  options: Array<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
  label?: string;
}

const PAD = 4;
const GAP = 4;

/** A pill of choices; the paper thumb slides to the one you pick. */
export function Segmented<K extends string>({ options, value, onChange, label }: Props<K>) {
  const { c, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const n = options.length;
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const seg = width > 0 ? (width - PAD * 2 - GAP * (n - 1)) / n : 0;
  const x = useSharedValue(0);
  useEffect(() => {
    const to = index * (seg + GAP);
    x.value = reduceMotion || seg === 0 ? to : withSpring(to, { damping: 16, stiffness: 190, mass: 0.8 });
  }, [index, seg, reduceMotion, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', backgroundColor: c.canvasDeep, borderRadius: 999, padding: PAD, gap: GAP, boxShadow: `inset 0px 2px 5px 0px ${c.shadow}` }}
    >
      {seg > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: PAD, bottom: PAD, left: PAD, width: seg, borderRadius: 999, backgroundColor: c.card, boxShadow: `0px 2px 8px 0px ${c.shadow}, inset 0px 1px 0px 0px ${c.cardHighlight}` },
            thumb,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const sel = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (sel) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }}
            style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}
          >
            <T v="smallBold" color={sel ? c.leafDeep : c.inkSoft} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
