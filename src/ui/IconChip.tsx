import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Icon, type IconName } from './Icon';

const SIZES = { sm: 36, md: 40, lg: 48 } as const;

/**
 * Every header, notice and card icon sits in one of these: a round chip, solid glyph, at one of
 * three sizes. Inline icons (in buttons, pills and lists) stay bare.
 */
export function IconChip({ name, size = 'md', bg, fg }: { name: IconName; size?: keyof typeof SIZES; bg?: string; fg?: string }) {
  const { c } = useTheme();
  const d = SIZES[size];
  return (
    <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: bg ?? c.leafPale, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(d * 0.55)} color={fg ?? c.leafDeep} />
    </View>
  );
}
