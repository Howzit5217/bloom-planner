import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
// The gesture handler's own text box: a touch starting on it still pulls the page down to refresh
// (Android's own box stopped that) and scrolls the page; a tap focuses it.
import { TextInput } from 'react-native-gesture-handler';

import { fmt } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { T } from './T';
import { t } from '@/i18n';
import { shadow } from './shadow';

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
export function NumberField({ label, value, onChange, placeholder, hint, size = 'lg', max = 99_999_999, style, suffix, error, onSubmit }: Props) {
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
          ...shadow(`inset 0px 2px 5px 0px ${c.shadow}`),
        }}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          value={text}
          onChangeText={(raw) => {
            const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
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
          // Tapping a filled field selects it, so typing replaces the number instead of adding to it.
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          placeholder={placeholder ?? t('Tap to type')}
          placeholderTextColor={c.inkSoft + '88'}
          maxLength={12}
          selectionColor={c.leaf}
          // minWidth 0: on the web an input is about 20 characters wide by default, which pushed the
          // unit off the edge of the screen.
          style={{ flex: 1, minWidth: 0, fontFamily: font.heading, fontSize: fs, color: c.leafDeep, paddingVertical: 6, includeFontPadding: false }}
        />
        {suffix ? (
          <T v="smallBold" soft style={{ flexShrink: 0, marginLeft: 10 }}>
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
