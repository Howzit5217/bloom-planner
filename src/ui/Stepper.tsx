import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { GameNumber } from './skia/GameNumber';
import { Icon } from './Icon';
import { T } from './T';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  size?: number;
}

/** Big tappable level stepper: hold +/- to run, tap the number to type it. */
export function Stepper({ label, value, min, max, onChange, size = 72 }: Props) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const bump = (d: number) => {
    const v = Math.min(max, Math.max(min, valueRef.current + d));
    if (v !== valueRef.current) {
      Haptics.selectionAsync().catch(() => {});
      onChange(v);
      valueRef.current = v;
    }
  };
  const startRepeat = (d: number) => {
    let delay = 380;
    const tick = () => {
      bump(d);
      delay = Math.max(45, delay * 0.82);
      timer.current = setTimeout(tick, delay);
    };
    timer.current = setTimeout(tick, delay);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `Level ${value}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => bump(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }}
    >
      <StepButton icon="minus" label={`Decrease ${label}`} disabled={value <= min} onPress={() => bump(-1)} onLongPress={() => startRepeat(-1)} onRelease={stop} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Type ${label}`}
        onPress={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        style={{ minWidth: size * 1.9, alignItems: 'center', justifyContent: 'center', minHeight: size * 1.15 }}
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
              if (draft !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
              setEditing(false);
            }}
            style={{ fontFamily: font.heading, fontSize: size * 0.8, color: c.leafDeep, textAlign: 'center', minWidth: size * 1.6, padding: 0 }}
          />
        ) : (
          <GameNumber value={value} size={size} format={(n) => String(n)} />
        )}
      </Pressable>
      <StepButton icon="plus" label={`Increase ${label}`} disabled={value >= max} onPress={() => bump(1)} onLongPress={() => startRepeat(1)} onRelease={stop} />
    </View>
  );
}

function StepButton({ icon, label, disabled, onPress, onLongPress, onRelease }: { icon: 'minus' | 'plus'; label: string; disabled: boolean; onPress: () => void; onLongPress: () => void; onRelease: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      onPressOut={onRelease}
      style={({ pressed }) => ({
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.card,
        opacity: disabled ? 0.35 : 1,
        transform: [{ scale: pressed ? 0.9 : 1 }],
        boxShadow: `0px 4px 14px 0px ${c.shadow}, inset 0px 1px 0px 0px ${c.cardHighlight}`,
      })}
    >
      <Icon name={icon} size={28} color={c.leafDeep} />
    </Pressable>
  );
}

export function StepperCaption({ text }: { text: string }) {
  return (
    <T v="small" soft center style={{ marginTop: 10 }}>
      {text}
    </T>
  );
}
