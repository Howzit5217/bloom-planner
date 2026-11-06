import { Canvas, Circle } from '@shopify/react-native-skia';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import type { Difficulty, PlanDifficulty } from '@/engine/difficulty';
import { fmtHours } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import { radius, type Palette } from '@/theme/tokens';
import { FlowerHead } from '@/ui/skia/FlowerHead';
import { T } from '@/ui/T';
import { tk, useT } from '@/i18n';
import { STILL } from '@/ui/skia/still';

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: tk('Easy Plan'),
  steady: tk('Steady Plan'),
  hard: tk('Hard Plan'),
  veryHard: tk('Very Hard Plan'),
  extreme: tk('EXTREME Plan'),
};

/**
 * The settings key that says this EXTREME goal was kept on purpose (after "Are you sure?"), so
 * Home doesn't warn about it again.
 */
export const keptExtremeKey = (level: number, date: string) => `extreme-${level}-${date}`;

/** A plan's flower: white when it's easy, then yellow, red, blue, and deep purple past what's realistic. */
export function difficultyColor(c: Palette, d: Difficulty): string {
  return { easy: c.petalWhite, steady: c.petalYellow, hard: c.petalRed, veryHard: c.petalBlue, extreme: c.petalExtreme }[d];
}

/** The plan's flower on its own, small; on a round backing when it sits on a white card. */
export function DifficultyFlower({ difficulty, size = 24, backdrop }: { difficulty: Difficulty; size?: number; backdrop?: string }) {
  const { c } = useTheme();
  const r = size * (backdrop ? 0.34 : 0.42);
  return (
    <Animated.View key={difficulty} entering={ZoomIn.duration(260)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Canvas __destroyWebGLContextAfterRender={STILL} style={{ width: size, height: size }}>
        {backdrop ? <Circle cx={size / 2} cy={size / 2} r={size / 2} color={backdrop} /> : null}
        <FlowerHead r={r} color={difficultyColor(c, difficulty)} transform={[{ translateX: size / 2 }, { translateY: size / 2 - size * 0.03 }]} />
      </Canvas>
    </Animated.View>
  );
}

/**
 * The plan's flower, its grade, and the time behind it. `wide`: a full-width tile among a form's
 * fields, shaped like them (Settings, a new goal); otherwise a pill sized to its words.
 */
export function DifficultyPill({ d, onPanel, wide }: { d: PlanDifficulty; onPanel?: boolean; wide?: boolean }) {
  const { c } = useTheme();
  const { t } = useT();
  const time = fmtHours(d.hours);
  if (wide)
    return (
      <View accessible style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 9, paddingLeft: 11, paddingRight: 16, borderRadius: radius.field, backgroundColor: onPanel ? c.panelTrack : c.canvasDeep }}>
        {/* The flower on a small light tile, like the date field's calendar. */}
        <View style={{ width: 42, height: 46, borderRadius: 12, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', boxShadow: `0px 2px 6px 0px ${c.shadow}` }}>
          <DifficultyFlower difficulty={d.level} size={34} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyBold" color={onPanel ? c.onPanel : undefined}>
            {t(DIFFICULTY_NAMES[d.level])}
          </T>
          <T v="small" soft={!onPanel} color={onPanel ? c.onPanelSoft : undefined}>
            {t('About {time} on the move a day', { time })}
          </T>
        </View>
      </View>
    );
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
          {t('About {time} on the move a day', { time })}
        </T>
      </View>
    </View>
  );
}
