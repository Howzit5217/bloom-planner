import { TextInput, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { T } from './T';

/** A labelled one-line text box, in the app's paper style (like NumberField, for words). */
export function TextField({ label, value, onChange, placeholder, hint, maxLength = 40 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; maxLength?: number }) {
  const { c } = useTheme();
  return (
    <View>
      <T v="label" soft style={{ marginBottom: 6 }}>
        {label}
      </T>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.inkSoft + '99'}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ minHeight: 52, borderRadius: radius.field, backgroundColor: c.canvasDeep, paddingHorizontal: 16, fontFamily: font.bodyBold, fontSize: 18, color: c.ink }}
      />
      {hint ? (
        <T v="caption" soft style={{ marginTop: 6 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}
