import { Canvas, Group, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useSharedValue, withDelay, withSpring, type SharedValue } from 'react-native-reanimated';
import { MONTHS, MONTHS_SHORT } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import { T } from '@/ui/T';

function Bar({ i, v, x, w, h, grow, colors }: { i: number; v: number; x: number; w: number; h: number; grow: SharedValue<number>; colors: [string, string] }) {
  const bh = useDerivedValue(() => Math.max(4, v * h * grow.value));
  const y = useDerivedValue(() => h - bh.value);
  return (
    <Group>
      <RoundedRect x={x} y={y} width={w} height={bh} r={Math.min(8, w / 2)}>
        <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={colors} />
      </RoundedRect>
    </Group>
  );
}

/** Twelve monthly rideable rates (0..1) as soft bars that grow in on mount. */
export function MonthBars({ rates, width, height = 120 }: { rates: number[]; width: number; height?: number }) {
  const { c } = useTheme();
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = 0;
    grow.value = withDelay(120, withSpring(1, { damping: 14, stiffness: 90 }));
  }, [rates.join(','), grow]); // eslint-disable-line react-hooks/exhaustive-deps
  const gap = 6;
  const bw = (width - gap * 11) / 12;
  const label = rates.map((r, i) => `${MONTHS[i]} ${Math.round(r * 100)}%`).join(', ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Rideable days by month: ${label}`}>
      <Canvas style={{ width, height }}>
        {rates.map((v, i) => (
          <Bar
            key={i}
            i={i}
            v={v}
            x={i * (bw + gap)}
            w={bw}
            h={height}
            grow={grow}
            colors={v >= 0.6 ? [c.leaf, c.leafDeep] : v >= 0.35 ? [c.petalYellow, c.nectar] : [c.petalRed, c.alert]}
          />
        ))}
      </Canvas>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {MONTHS_SHORT.map((m, i) => (
          <T key={m} v="caption" soft center style={{ width: bw + (i < 11 ? gap : 0), textAlign: 'center', marginRight: 0, fontSize: 11 }}>
            {m[0]}
          </T>
        ))}
      </View>
    </View>
  );
}
