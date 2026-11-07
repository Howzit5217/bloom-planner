import * as Haptics from 'expo-haptics';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { font, SPRING } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { shadow } from './shadow';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  size?: 'lg' | 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  haptic?: boolean;
}

/** Full pill. Squashes on press, springs back. */
export function PillButton({ label, onPress, variant = 'primary', icon, disabled, size = 'lg', style, accessibilityHint, haptic = true }: Props) {
  const { c } = useTheme();
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleX: sx.value }, { scaleY: sy.value }] }));
  const h = size === 'lg' ? 58 : size === 'md' ? 48 : 44;
  const bg =
    variant === 'primary' ? c.button : variant === 'danger' ? c.alert : variant === 'secondary' ? c.card : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? c.onButton : variant === 'secondary' ? c.ink : c.leafDeep;
  return (
    <Animated.View style={[anim, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        hitSlop={4}
        onPressIn={() => {
          sx.set(withSpring(1.04, SPRING));
          sy.set(withSpring(0.9, SPRING));
        }}
        onPressOut={() => {
          sx.set(withSequence(withTiming(0.98, { duration: 70 }), withSpring(1, SPRING)));
          sy.set(withSequence(withTiming(1.04, { duration: 70 }), withSpring(1, SPRING)));
        }}
        onPress={() => {
          if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress?.();
        }}
        style={({ pressed }) => ({
          height: h,
          minWidth: 44,
          borderRadius: 999,
          paddingHorizontal: size === 'sm' ? 16 : 24,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: disabled ? 0.45 : 1,
          backgroundColor: pressed && variant === 'primary' ? c.buttonPressed : bg,
          ...shadow(variant === 'ghost' ? undefined : `0px 4px 14px 0px ${c.shadow}, inset 0px 1px 0px 0px ${variant === 'secondary' ? c.cardHighlight : 'rgba(255,255,255,0.25)'}`),
        })}
      >
        {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 19} color={fg} /> : null}
        <T style={{ fontFamily: font.heading, fontSize: size === 'lg' ? 20 : 17, lineHeight: size === 'lg' ? 26 : 22, color: fg, textAlign: 'center', flexShrink: 1 }}>{label}</T>
      </Pressable>
    </Animated.View>
  );
}

/** Small round icon button (the game's floating circles). */
export function RoundButton({ icon, onPress, label, size = 48, tone = 'card' }: { icon: IconName; onPress: () => void; label: string; size?: number; tone?: 'card' | 'leaf' }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'leaf' ? (pressed ? c.buttonPressed : c.button) : c.card,
        transform: [{ scale: pressed ? 0.92 : 1 }],
        ...shadow(`0px 4px 12px 0px ${c.shadow}`),
      })}
    >
      <View>
        <Icon name={icon} size={size * 0.5} color={tone === 'leaf' ? c.onButton : c.ink} />
      </View>
    </Pressable>
  );
}
