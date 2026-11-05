import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { FlowerHead } from './FlowerHead';
import { STILL } from './still';

/**
 * A row of small flowers drawn like the welcome flower (back petals, front petals, golden centre),
 * one per item. A null item is a pale bud: a day not logged yet.
 */
export function FlowerRow({ items, height = 30, accessibilityLabel }: { items: Array<string | null>; height?: number; accessibilityLabel?: string }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const n = items.length;
  const slot = n > 0 ? w / n : 0;
  const R = Math.min(height * 0.46, slot * 0.46);
  return (
    <View accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 ? (
        <Canvas __destroyWebGLContextAfterRender={STILL} style={{ width: w, height }}>
          {items.map((col, i) => {
            const cx = slot * (i + 0.5);
            const cy = height / 2;
            return col ? (
              <FlowerHead key={i} r={R} color={col} rot={i * 0.7} transform={[{ translateX: cx }, { translateY: cy }]} />
            ) : (
              <Group key={i}>
                <Circle cx={cx} cy={cy} r={R * 0.34} color={c.leafPale} />
                <Circle cx={cx} cy={cy} r={R * 0.16} color={c.leaf} opacity={0.35} />
              </Group>
            );
          })}
        </Canvas>
      ) : null}
    </View>
  );
}
