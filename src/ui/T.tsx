import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';

export type TVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyBold' | 'small' | 'smallBold' | 'caption' | 'label' | 'number';

const styles: Record<TVariant, TextStyle> = {
  display: { fontFamily: font.heading, fontSize: 48, lineHeight: 56 },
  h1: { fontFamily: font.heading, fontSize: 30, lineHeight: 38 },
  h2: { fontFamily: font.heading, fontSize: 22, lineHeight: 30 },
  h3: { fontFamily: font.headingBold, fontSize: 18, lineHeight: 25 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 23 },
  bodyBold: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20 },
  smallBold: { fontFamily: font.bodyHeavy, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: font.bodySemi, fontSize: 12.5, lineHeight: 17 },
  label: { fontFamily: font.bodyHeavy, fontSize: 13, lineHeight: 18, letterSpacing: 0.3 },
  number: { fontFamily: font.heading, fontSize: 40, lineHeight: 48 },
};

/** A variant's line height, in points (before the phone's text size setting). */
export const lineHeightOf = (v: TVariant) => styles[v].lineHeight as number;

interface Props extends TextProps {
  v?: TVariant;
  color?: string;
  soft?: boolean;
  center?: boolean;
}

export function T({ v = 'body', color, soft, center, style, ...rest }: Props) {
  const { c } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[styles[v], { color: color ?? (soft ? c.inkSoft : c.ink) }, center && { textAlign: 'center' }, style]}
    />
  );
}
