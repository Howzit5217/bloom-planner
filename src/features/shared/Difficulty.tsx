import { Canvas, Circle } from '@shopify/react-native-skia';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import type { Difficulty, PlanDifficulty } from '@/engine/difficulty';
import { fmtHours } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { FlowerHead } from '@/ui/skia/FlowerHead';
import { T } from '@/ui/T';
import { tk, useT } from '@/i18n';

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: tk('Easy Plan'),
  steady: tk('Steady Plan'),
  hard: tk('Hard Plan'),
  veryHard: tk('Very Hard Plan'),
};

/** A plan's flower: white when it's easy, then yellow, red, and blue for the hardest. */
export function difficultyColor(c: Palette, d: Difficulty): string {
  return { easy: c.petalWhite, steady: c.petalYellow, hard: c.petalRed, veryHard: c.petalBlue }[d];
}

/** The plan's flower on its own, small; on a round backing when it sits on a white card. */
export function DifficultyFlower({ difficulty, size = 24, backdrop }: { difficulty: Difficulty; size?: number; backdrop?: string }) {
  const { c } = useTheme();
  const r = size * (backdrop ? 0.34 : 0.42);
  return (
    <Animated.View key={difficulty} entering={ZoomIn.duration(260)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Canvas style={{ width: size, height: size }}>
        {backdrop ? <Circle cx={size / 2} cy={size / 2} r={size / 2} color={backdrop} /> : null}
        <FlowerHead r={r} color={difficultyColor(c, difficulty)} transform={[{ translateX: size / 2 }, { translateY: size / 2 - size * 0.03 }]} />
      </Canvas>
    </Animated.View>
  );
}

/** The plan's flower, its grade, and the time behind it. */
export function DifficultyPill({ d, onPanel }: { d: PlanDifficulty; onPanel?: boolean }) {
  const { c } = useTheme();
  const { t } = useT();
  const time = fmtHours(d.hours);
  return (
    <View
      accessible
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', backgroundColor: onPanel ? c.panelTrack : c.canvasDeep, borderRadius: 999, paddingVertical: 6, paddingLeft: 8, paddingRight: 16 }}
    >
      <DifficultyFlower difficulty={d.level} size={30} />
      <View style={{ flexShrink: 1 }}>
        <T v="smallBold" color={onPanel ? c.onPanel : undefined}>
          {t(DIFFICULTY_NAMES[d.level])}
        </T>
        <T v="caption" color={onPanel ? c.onPanelSoft : c.inkSoft}>
          {d.riding ? t('About {time} on the move on a riding day', { time }) : t('About {time} on the move a day', { time })}
        </T>
      </View>
    </View>
  );
}
