import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { IconChip } from './IconChip';
import { T } from './T';
import { t } from '@/i18n';

interface Props {
  icon: IconName;
  title?: string;
  text: string;
  tone?: 'info' | 'alert' | 'nectar';
  onDismiss?: () => void;
  action?: { label: string; onPress: () => void };
}

export function Banner({ icon, title, text, tone = 'info', onDismiss, action }: Props) {
  const { c } = useTheme();
  const bg = tone === 'alert' ? c.alertPale : tone === 'nectar' ? (c.dark ? '#4A3A1C' : '#FFF1D6') : c.leafPale;
  const fg = tone === 'alert' ? c.alert : tone === 'nectar' ? (c.dark ? c.nectar : '#9A5B00') : c.leafDeep;
  return (
    <View accessibilityRole="summary" style={{ flexDirection: 'row', gap: 12, backgroundColor: bg, borderRadius: radius.card, padding: 14, alignItems: 'flex-start' }}>
      <IconChip name={icon} size="sm" bg={c.card} fg={fg} />
      <View style={{ flex: 1, gap: 2, paddingTop: title ? 0 : 7 }}>
        {title ? (
          <T v="bodyBold" color={fg}>
            {title}
          </T>
        ) : null}
        <T v="small">{text}</T>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 6, minHeight: 32, justifyContent: 'center' }}>
            <T v="smallBold" color={fg}>
              {action.label} →
            </T>
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('Dismiss')} onPress={onDismiss} hitSlop={10} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -4 }}>
          <Icon name="close" size={18} color={c.inkSoft} />
        </Pressable>
      ) : null}
    </View>
  );
}
