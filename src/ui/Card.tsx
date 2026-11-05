import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';

interface Props {
  children: ReactNode;
  variant?: 'paper' | 'panel' | 'deep';
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

/** Paper cut-out on the canvas: warm soft shadow, 1px highlight on the top edge, no borders. */
export function Card({ children, variant = 'paper', style, padded = true }: Props) {
  const { c } = useTheme();
  const bg = variant === 'panel' ? c.panel : variant === 'deep' ? c.canvasDeep : c.card;
  const highlight = variant === 'panel' ? 'rgba(255,255,255,0.22)' : c.cardHighlight;
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.card,
          padding: padded ? 18 : 0,
          boxShadow:
            variant === 'deep'
              ? `inset 0px 2px 6px 0px ${c.shadow}`
              : `0px 6px 24px 0px ${c.shadow}, 0px 1px 3px 0px ${c.shadow}, inset 0px 1px 0px 0px ${highlight}`,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
