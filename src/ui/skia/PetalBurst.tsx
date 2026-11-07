import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';
import { PETALS } from '@/theme/tokens';
import { petalPath, rng } from './shapes';

interface PetalSpec {
  dx: number;
  rise: number;
  sway: number;
  phase: number;
  spin: number;
  size: number;
  color: string;
}

function Petal({ t, spec, ox, oy }: { t: SharedValue<number>; spec: PetalSpec; ox: number; oy: number }) {
  const path = useMemo(() => petalPath(spec.size), [spec.size]);
  const transform = useDerivedValue(() => {
    const k = t.value;
    return [
      { translateX: ox + spec.dx * k * 70 + Math.sin(k * 7 + spec.phase) * spec.sway },
      { translateY: oy - spec.rise * k * 130 + k * k * 25 },
      { rotate: spec.spin * k * 4 + spec.phase },
      { scale: 0.6 + 0.6 * Math.min(1, k * 4) },
    ];
  });
  const opacity = useDerivedValue(() => (t.value <= 0 || t.value >= 1 ? 0 : 1 - Math.pow(t.value, 2.2)));
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={path} color={spec.color} />
    </Group>
  );
}

/** 6-10 petals in random petal colours drift up and fade. Re-fires whenever `trigger` changes. */
export function PetalBurst({ trigger, width, height, originX, originY }: { trigger: number; width: number; height: number; originX: number; originY: number }) {
  const { c, reduceMotion } = useTheme();
  const t = useSharedValue(0);
  const specs = useMemo<PetalSpec[]>(() => {
    const colors = PETALS(c);
    const rand = rng(trigger * 7919 + 13);
    const n = 6 + Math.floor(rand() * 5);
    return Array.from({ length: n }, (_, i) => ({
      dx: (i / (n - 1) - 0.5) * 2 + (rand() - 0.5) * 0.4,
      rise: 0.7 + rand() * 0.6,
      sway: 6 + rand() * 10,
      phase: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 2,
      size: 10 + rand() * 8,
      color: colors[Math.floor(rand() * colors.length)],
    }));
  }, [trigger, c]);
  // Its canvas only while a burst plays: one fewer drawing surface the rest of the time (on the web
  // each takes one of the browser's few, and Home made them all afresh on every visit).
  const [finished, setFinished] = useState(0);
  useEffect(() => {
    if (trigger <= 0 || reduceMotion) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }, (done) => {
      if (done) scheduleOnRN(setFinished, trigger);
    });
  }, [trigger, reduceMotion, t]);
  if (reduceMotion || width <= 0 || trigger <= 0 || finished === trigger) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <Canvas style={{ width, height }}>
        {specs.map((s, i) => (
          <Petal key={`${trigger}-${i}`} t={t} spec={s} ox={originX} oy={originY} />
        ))}
      </Canvas>
    </View>
  );
}
