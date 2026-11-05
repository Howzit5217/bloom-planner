import { useState } from 'react';
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

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: t('Level {level}', { level: value }) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? 1 : -1)))}
      style={{ gap: 10 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Type {what}', { what: label })}
        onPress={() => {
          setDraft(String(value));
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
          <GameNumber value={value} size={size} format={(n) => String(n)} />
        )}
      </Pressable>
      {/* Remount when the range moves, so its positions always match the levels. */}
      <LevelRuler key={`${min}-${max}`} value={value} min={min} max={max} onChange={onChange} />
      {hint ? (
        <T v="caption" soft center>
          {t('Slide the ruler, or tap the number to type it.')}
        </T>
      ) : null}
    </View>
  );
}
