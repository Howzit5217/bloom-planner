import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Canvas, Group, LinearGradient, Path, Text, useFont, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { hexPath } from './shapes';

/** The gold hexagon level badge ("Lv 110"). */
export function LevelBadge({ level, size = 96 }: { level: number; size?: number }) {
  const { c } = useTheme();
  const big = useFont(Baloo2_800ExtraBold, size * (level >= 100 ? 0.36 : 0.42));
  const small = useFont(Baloo2_800ExtraBold, size * 0.2);
  const cx = size / 2;
  const outer = useMemo(() => hexPath(cx, cx, size * 0.48, size * 0.08), [cx, size]);
  const inner = useMemo(() => hexPath(cx, cx, size * 0.4, size * 0.065), [cx, size]);
  const label = String(level);
  const sw = size * 0.035;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Level ${level}`} style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={outer} color={c.goldDeep} />
        <Group transform={[{ translateY: -size * 0.025 }]}>
          <Path path={outer}>
            <LinearGradient start={vec(0, 0)} end={vec(0, size)} colors={[c.goldLight, c.gold, c.goldDeep]} />
          </Path>
          <Path path={inner}>
            <LinearGradient start={vec(0, size * 0.1)} end={vec(0, size * 0.9)} colors={[c.gold, c.goldLight]} />
          </Path>
          {small ? (
            <Group>
              <Text x={cx - small.measureText('Lv').width / 2} y={size * 0.37} text="Lv" font={small} color={c.goldDeep} style="stroke" strokeWidth={sw * 2} strokeJoin="round" />
              <Text x={cx - small.measureText('Lv').width / 2} y={size * 0.37} text="Lv" font={small} color="#FFFFFF" />
            </Group>
          ) : null}
          {big ? (
            <Group>
              <Text x={cx - big.measureText(label).width / 2} y={size * 0.7} text={label} font={big} color={c.goldDeep} style="stroke" strokeWidth={sw * 2.4} strokeJoin="round" />
              <Text x={cx - big.measureText(label).width / 2} y={size * 0.7} text={label} font={big} color="#FFFFFF" />
            </Group>
          ) : null}
        </Group>
      </Canvas>
    </View>
  );
}
