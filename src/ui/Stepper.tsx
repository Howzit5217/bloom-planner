import { startTransition, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { GameNumber } from './skia/GameNumber';
import { LevelRuler } from './LevelRuler';
import { T } from './T';
import { t } from '@/i18n';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  size?: number;
  /** The small "slide or type" line under the ruler. */
  hint?: boolean;
}

/**
 * The app's level picker: the level in big game numbers, a ruler underneath to slide through
 * levels, and a tap on the number to type one in.
 */
export function Stepper({ label, value, min, max, onChange, size = 72, hint = true }: Props) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  // What the ruler was last slid to shows at once. The page's own work on it (checking a plan,
  // saving) follows as a background update, and a newer slide replaces one still in progress, so
  // the number keeps up with the ruler however much the page has to do.
  const [live, setLive] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // Set from elsewhere (typed, or the page's own change): that's what shows.
    setSeen(value);
    setLive(value);
  }
  const slide = (v: number) => {
    setLive(v);
    startTransition(() => onChange(v));
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: live, text: t('Level {level}', { level: live }) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(clamp(live + (e.nativeEvent.actionName === 'increment' ? 1 : -1)))}
      style={{ gap: 10 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Type {what}', { what: label })}
        onPress={() => {
          setDraft(String(live));
          setEditing(true);
        }}
        style={{ alignSelf: 'center', minWidth: size * 2.2, alignItems: 'center', justifyContent: 'center', minHeight: size * 1.15 }}
      >
        {editing ? (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={(t) => setDraft(t.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            onBlur={() => {
              const n = Number(draft);
              if (draft !== '' && Number.isFinite(n)) onChange(clamp(n));
              setEditing(false);
            }}
            style={{ fontFamily: font.heading, fontSize: size * 0.8, color: c.leafDeep, textAlign: 'center', minWidth: size * 1.6, padding: 0 }}
          />
        ) : (
          <GameNumber value={live} size={size} format={(n) => String(n)} />
        )}
      </Pressable>
      {/* Remount when the range moves, so its positions always match the levels. */}
      <LevelRuler key={`${min}-${max}`} value={live} min={min} max={max} onChange={slide} />
      {hint ? (
        <T v="caption" soft center>
          {t('Slide the ruler, or tap the number to type it.')}
        </T>
      ) : null}
    </View>
  );
}
