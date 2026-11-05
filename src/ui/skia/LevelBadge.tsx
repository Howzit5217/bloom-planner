import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Canvas, Group, LinearGradient, Path, Text, useFont, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { badgeTier, type BadgeTier } from '@/engine/badge';
import { hexPath } from './shapes';
import { t } from '@/i18n';

export interface Metal {
  /** The rim, light to dark. */
  rim: [string, string, string];
  /** The centre, top to bottom. */
  face: [string, string];
  /** Behind the rim, and the outline round the lettering. */
  deep: string;
}

export const METALS: Record<BadgeTier, Metal> = {
  bronze: { rim: ['#F6C79A', '#D08A52', '#9A5A2B'], face: ['#D9925A', '#F3BE8C'], deep: '#7E4720' },
  silver: { rim: ['#FBFCFD', '#C9D0D7', '#8C969F'], face: ['#C3CBD3', '#EEF2F5'], deep: '#66707A' },
  gold: { rim: ['#FFE07A', '#F2B530', '#B8740C'], face: ['#F2B530', '#FFE07A'], deep: '#9A5F08' },
  top: { rim: ['#FFE07A', '#F2B530', '#B8740C'], face: ['#D8413A', '#F26E5B'], deep: '#8E2A1F' },
};

/** The hexagon level badge ("Lv 110"), in the metal of its level. */
export function LevelBadge({ level, size = 96 }: { level: number; size?: number }) {
  const big = useFont(Baloo2_800ExtraBold, size * (level >= 100 ? 0.36 : 0.42));
  const small = useFont(Baloo2_800ExtraBold, size * 0.2);
  const cx = size / 2;
  const outer = useMemo(() => hexPath(cx, cx, size * 0.48, size * 0.08), [cx, size]);
  const inner = useMemo(() => hexPath(cx, cx, size * 0.4, size * 0.065), [cx, size]);
  const label = String(level);
  const sw = size * 0.035;
  const m = METALS[badgeTier(level)];
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t('Level {level}', { level })} style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={outer} color={m.deep} />
        <Group transform={[{ translateY: -size * 0.025 }]}>
          <Path path={outer}>
            <LinearGradient start={vec(0, 0)} end={vec(0, size)} colors={m.rim} />
          </Path>
          <Path path={inner}>
            <LinearGradient start={vec(0, size * 0.1)} end={vec(0, size * 0.9)} colors={m.face} />
          </Path>
          {small ? (
            <Group>
              <Text x={cx - small.measureText('Lv').width / 2} y={size * 0.37} text="Lv" font={small} color={m.deep} style="stroke" strokeWidth={sw * 2} strokeJoin="round" />
              <Text x={cx - small.measureText('Lv').width / 2} y={size * 0.37} text="Lv" font={small} color="#FFFFFF" />
            </Group>
          ) : null}
          {big ? (
            <Group>
              <Text x={cx - big.measureText(label).width / 2} y={size * 0.7} text={label} font={big} color={m.deep} style="stroke" strokeWidth={sw * 2.4} strokeJoin="round" />
              <Text x={cx - big.measureText(label).width / 2} y={size * 0.7} text={label} font={big} color="#FFFFFF" />
            </Group>
          ) : null}
        </Group>
      </Canvas>
    </View>
  );
}
