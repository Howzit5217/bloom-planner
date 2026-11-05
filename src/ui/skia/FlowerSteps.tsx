import { Canvas, type Transforms3d } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { FlowerHead } from './FlowerHead';
import { SPRIG_COLORS } from './FlowerSprigs';

const SLOT = 30;
const GAP = 4;
const FLOWER = 34;

/**
 * Where you are in a run of pages: a little vine along the bottom, a leaf bud for each page done,
 * and a flower blooming on the page you're on.
 */
export function FlowerSteps({ step, count }: { step: number; count: number }) {
  const { c, reduceMotion } = useTheme();
  const total = count * SLOT + (count - 1) * GAP;
  // Vine length from the first marker's centre to the current one's.
  const centreOf = (i: number) => i * (SLOT + GAP);
  const grown = useSharedValue(centreOf(step));
  useEffect(() => {
    grown.value = reduceMotion ? centreOf(step) : withTiming(centreOf(step), { duration: 320 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reduceMotion]);
  const vine = useAnimatedStyle(() => ({ width: grown.value }));
  const colors = SPRIG_COLORS(c);

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`Page ${step + 1} of ${count}`} style={{ alignSelf: 'center', width: total, height: FLOWER }}>
      <View style={{ position: 'absolute', left: SLOT / 2, right: SLOT / 2, top: FLOWER / 2 - 1.5, height: 3, borderRadius: 2, backgroundColor: c.leafPale }} />
      <Animated.View style={[{ position: 'absolute', left: SLOT / 2, top: FLOWER / 2 - 1.5, height: 3, borderRadius: 2, backgroundColor: c.leaf }, vine]} />
      <View style={{ flexDirection: 'row', gap: GAP, height: FLOWER, alignItems: 'center' }}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={{ width: SLOT, height: FLOWER, alignItems: 'center', justifyContent: 'center' }}>
            {i === step ? (
              <MiniFlower key={`f${step}`} color={colors[i % colors.length]} />
            ) : i < step ? (
              <Animated.View entering={reduceMotion ? undefined : ZoomIn.springify().damping(11)}>
                <View style={{ width: 12, height: 12, borderRadius: 6, borderTopLeftRadius: 1, transform: [{ rotate: '-45deg' }], backgroundColor: c.leaf }} />
              </Animated.View>
            ) : (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.leafPale }} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function MiniFlower({ color }: { color: string }) {
  const { reduceMotion } = useTheme();
  const p = useSharedValue(reduceMotion ? 1 : 0);
  const rock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    p.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    // After it blooms, it rocks gently from side to side, like a flower in a breeze.
    // A continuous clock; the rock is a sine of it, so it loops without jumping or reversing.
    rock.value = withDelay(450, withRepeat(withTiming(1, { duration: 3600, easing: Easing.linear }), -1, false));
  }, [p, rock, reduceMotion]);
  const s = FLOWER;
  const R = s * 0.4;
  const tf = useDerivedValue((): Transforms3d => [{ translateX: s / 2 }, { translateY: s / 2 }, { rotate: (1 - p.value) * -1.2 + Math.sin(rock.value * Math.PI * 2) * 0.16 }, { scale: Math.max(0, p.value) }]);
  return (
    <Canvas style={{ width: s, height: s }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <FlowerHead r={R} color={color} transform={tf} />
    </Canvas>
  );
}
