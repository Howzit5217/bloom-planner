import { startTransition, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
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
  /** What a screen reader says for a number (a level, unless it's something else). */
  valueText?: (n: number) => string;
}

/**
 * If the ruler's stop goes unreported (it always should be), the page still gets the number this
 * long after the last change.
 */
const FALLBACK_MS = 600;

/**
 * The app's level picker: the level in big game numbers, a ruler underneath to slide through
 * levels, and a tap on the number to type one in.
 */
export function Stepper({ label, value, min, max, onChange, size = 72, hint = true, valueText }: Props) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const negative = min < 0;
  // As wide as any number in the range gets, so the number never changes size as it changes.
  const room = (negative ? '-' : '') + '8'.repeat(Math.max(String(Math.abs(min)).length, String(Math.abs(max)).length));
  // The number follows the ruler as it slides, and only the number: the page's own work on it
  // (checking a plan, saving) waits until the ruler stops, so nothing slows the number down.
  const [live, setLive] = useState(value);
  const [seen, setSeen] = useState(value);
  // Numbers sent to the page that it hasn't shown back yet.
  const [sent, setSent] = useState<number[]>([]);
  if (value !== seen) {
    setSeen(value);
    const own = sent.lastIndexOf(value);
    // One of its own coming back, perhaps after the ruler has moved on: where the ruler is stands.
    if (own >= 0) setSent(sent.slice(own + 1));
    // Set from elsewhere (typed, or the page's own change): that's what shows.
    else {
      setSent([]);
      setLive(value);
    }
  }
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFallback = () => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
  };
  useEffect(() => stopFallback, []);
  // The page's latest, for a stop reported from a timer or the ruler's scrolling.
  const latest = useRef({ value, waiting: sent.length > 0, onChange });
  useEffect(() => {
    latest.current = { value, waiting: sent.length > 0, onChange };
  });
  const commit = (v: number) => {
    stopFallback();
    const now = latest.current;
    if (v === now.value && !now.waiting) return;
    setSent((s) => [...s.slice(-3), v]);
    startTransition(() => now.onChange(v));
  };
  const slide = (v: number) => {
    setLive(v);
    stopFallback();
    fallback.current = setTimeout(() => commit(v), FALLBACK_MS);
  };
  const settle = (v: number) => {
    setLive(v);
    commit(v);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: live, text: valueText ? valueText(live) : t('Level {level}', { level: live }) }}
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
        hitSlop={8}
        style={{ alignSelf: 'center', alignItems: 'center', justifyContent: 'center', minWidth: size * 1.6, minHeight: size * 1.15, paddingHorizontal: 12 }}
      >
        {editing ? (
          <TextInput
            autoFocus
            value={draft}
            // A minus sign only where the numbers go below zero (temperatures).
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '').slice(0, 3);
              setDraft(negative && text.trim().startsWith('-') ? `-${digits}` : digits);
            }}
            keyboardType={negative ? (Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric') : 'number-pad'}
            returnKeyType="done"
            selectTextOnFocus
            onBlur={() => {
              const n = Number(draft);
              if (draft !== '' && draft !== '-' && Number.isFinite(n)) onChange(clamp(n));
              setEditing(false);
            }}
            style={{ fontFamily: font.heading, fontSize: size * 0.8, color: c.leafDeep, textAlign: 'center', minWidth: size * 1.6, padding: 0 }}
          />
        ) : (
          // Changes as the ruler moves, with no roll to catch up on afterwards.
          <GameNumber value={live} size={size} format={(n) => String(n)} roll={false} room={room} />
        )}
      </Pressable>
      {/* Remount when the range moves, so its positions always match the levels. */}
      <LevelRuler key={`${min}-${max}`} value={live} min={min} max={max} onChange={slide} onSettle={settle} />
      {hint ? (
        <T v="caption" soft center>
          {t('Slide the ruler, or tap the number to type it.')}
        </T>
      ) : null}
    </View>
  );
}
