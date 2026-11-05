import { useState } from 'react';
import { TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { fmt } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { T } from './T';

interface Props {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  hint?: string;
  size?: 'xl' | 'lg' | 'md';
  max?: number;
  style?: StyleProp<ViewStyle>;
  suffix?: string;
  error?: string | null;
  onSubmit?: () => void;
}

/** Big numeric input. Shows thousands separators; stores a plain number (or null when empty). */
export function NumberField({ label, value, onChange, placeholder = '0', hint, size = 'lg', max = 99_999_999, style, suffix, error, onSubmit }: Props) {
  const { c } = useTheme();
  const [text, setText] = useState(value == null ? '' : fmt(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    // The value changed from outside (not from typing): show it.
    setPrevValue(value);
    const parsed = text.replace(/\D/g, '');
    const current = parsed === '' ? null : Number(parsed);
    if (current !== value) setText(value == null ? '' : fmt(value));
  }
  const fs = size === 'xl' ? 40 : size === 'lg' ? 30 : 22;
  return (
    <View style={style}>
      <T v="label" soft style={{ marginBottom: 6 }}>
        {label}
      </T>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.canvasDeep,
          borderRadius: radius.field,
          paddingHorizontal: 16,
          minHeight: size === 'md' ? 52 : 64,
          boxShadow: `inset 0px 2px 5px 0px ${c.shadow}`,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          value={text}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
            if (digits === '') {
              setText('');
              setPrevValue(null);
              onChange(null);
              return;
            }
            const n = Math.min(max, Number(digits));
            setText(fmt(n));
            setPrevValue(n);
            onChange(n);
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={c.inkSoft + '88'}
          maxLength={12}
          selectionColor={c.leaf}
          style={{ flex: 1, fontFamily: font.heading, fontSize: fs, color: c.leafDeep, paddingVertical: 6, includeFontPadding: false }}
        />
        {suffix ? (
          <T v="smallBold" soft>
            {suffix}
          </T>
        ) : null}
      </View>
      {error ? (
        <T v="caption" color={c.alert} style={{ marginTop: 6 }}>
          {error}
        </T>
      ) : hint ? (
        <T v="caption" soft style={{ marginTop: 6 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}
