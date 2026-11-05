import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { T } from './T';

interface Props<K extends string> {
  options: Array<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
  label?: string;
}

export function Segmented<K extends string>({ options, value, onChange, label }: Props<K>) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: c.canvasDeep, borderRadius: 999, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const sel = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={o.label}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 8,
              backgroundColor: sel ? c.card : 'transparent',
              boxShadow: sel ? `0px 2px 8px 0px ${c.shadow}` : undefined,
            }}
          >
            <T v="smallBold" color={sel ? c.leafDeep : c.inkSoft} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
