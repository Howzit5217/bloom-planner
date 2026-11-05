import { Circle, Group, Path, type Transforms3d } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { CENTRE_COLOR, CENTRE_R, flowerPath, mixHex } from './shapes';

const isWhite = (color: string) => ['#FFFFFF', '#EDE8DF'].includes(color.toUpperCase());

/**
 * The app's flower: five round petals in one flat colour and a round golden centre, like the
 * flowers in Pikmin Bloom. White ones sit on a faint, crisp underlay so they still read on cream.
 */
export function FlowerHead({ r, color, rot = 0, transform, underlay }: { r: number; color: string; rot?: number; transform?: Transforms3d | SharedValue<Transforms3d>; underlay?: boolean }) {
  const path = useMemo(() => flowerPath(0, 0, r, 1, 5, rot), [r, rot]);
  const showUnder = underlay ?? isWhite(color);
  return (
    <Group transform={transform}>
      {showUnder ? (
        <Group transform={[{ translateY: Math.max(0.8, r * 0.07) }]}>
          <Path path={path} color={mixHex(color, '#8A7A5C', 0.35)} />
        </Group>
      ) : null}
      <Path path={path} color={color} />
      <Circle cx={0} cy={0} r={r * CENTRE_R} color={CENTRE_COLOR} />
    </Group>
  );
}
