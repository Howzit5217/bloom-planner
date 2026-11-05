import { useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Icon } from '@/ui/Icon';
import { FlowerAccent } from '@/ui/skia/FlowerAccent';
import { T } from '@/ui/T';
import { useT } from '@/i18n';

/** A phone, not a computer: a touch screen whose short side is a phone's. */
const touch = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/**
 * The app is made for a phone held upright. Android keeps the installed app in portrait; an iPhone
 * doesn't lock a home-screen app, so a phone turned sideways gets this until it's turned back.
 * Tablets and computer windows are left alone.
 */
export function PortraitOnly() {
  const { c } = useTheme();
  const { t } = useT();
  const { width, height } = useWindowDimensions();
  if (!(width > height && Math.min(width, height) < 600 && touch())) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
      <FlowerAccent arrangement="pair" width={132} height={50} />
      <Icon name="phone-rotate-portrait" size={44} color={c.leafDeep} />
      <T v="h2" center accessibilityRole="header">
        {t('Turn Your Phone Upright')}
      </T>
      <T soft center style={{ maxWidth: 360 }}>
        {t('Bloom Planner is made for a phone held upright.')}
      </T>
    </View>
  );
}
