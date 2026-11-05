import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { SPRING } from '@/theme/tokens';
import { T } from './T';

interface Props {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  tone?: 'paper' | 'panel';
}

/** Pill switch with a springy knob. The whole row is the touch target. */
export function Toggle({ label, value, onChange, hint, tone = 'paper' }: Props) {
  const { c } = useTheme();
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(value ? 1 : 0, SPRING);
  }, [value, p]);
  const off = tone === 'panel' ? c.panelTrack : c.canvasDeep;
  const on = tone === 'panel' ? c.gameYellow : c.button;
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [off, on]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * 22 }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onChange(!value);
      }}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <T v="bodyBold" color={tone === 'panel' ? c.onPanel : undefined}>
          {label}
        </T>
        {hint ? (
          <T v="caption" color={tone === 'panel' ? c.onPanelSoft : undefined} soft={tone !== 'panel'}>
            {hint}
          </T>
        ) : null}
      </View>
      <Animated.View style={[{ width: 52, height: 30, borderRadius: 15, padding: 3, boxShadow: `inset 0px 1px 3px 0px ${c.shadow}` }, track]}>
        <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', boxShadow: '0px 2px 4px 0px rgba(0,0,0,0.18)' }, knob]} />
      </Animated.View>
    </Pressable>
  );
}
