import type { ComponentProps } from 'react';
import type { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { SPRING } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { useT } from '@/i18n';
import { shadow } from './shadow';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['flower', 'flower-outline'],
  progress: ['chart-bell-curve-cumulative', 'chart-bell-curve-cumulative'],
  levels: ['stairs-up', 'stairs-up'],
  settings: ['cog', 'cog-outline'],
};

export const TAB_BAR_SPACE = 96;

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function Tab({ name, label, focused, onPress }: { name: string; label: string; focused: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const s = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    s.value = withSpring(focused ? 1 : 0, SPRING);
  }, [focused, s]);
  const pill = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: 0.7 + 0.3 * s.value }] }));
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * s.value }] }));
  const [on, off] = ICONS[name] ?? ['circle', 'circle-outline'];
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={() => {
        if (!focused) Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56 }}
    >
      <Animated.View style={[{ position: 'absolute', width: 64, height: 44, borderRadius: 22, backgroundColor: c.leafPale }, pill]} />
      <Animated.View style={[{ alignItems: 'center' }, lift]}>
        <Icon name={focused ? on : off} size={24} color={focused ? c.leafDeep : c.inkSoft} />
        <T v="caption" color={focused ? c.leafDeep : c.inkSoft} style={{ fontSize: 11, lineHeight: 14 }}>
          {label}
        </T>
      </Animated.View>
    </Pressable>
  );
}

/** Floating pill tab bar, like the game's rounded floating controls. */
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 16 }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          backgroundColor: c.card,
          borderRadius: 999,
          paddingHorizontal: 6,
          paddingVertical: 4,
          ...shadow(`0px 8px 26px 0px ${c.shadow}, 0px 2px 6px 0px ${c.shadow}, inset 0px 1px 0px 0px ${c.cardHighlight}`),
        }}
      >
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const label = t(descriptors[route.key].options.title ?? route.name);
          return (
            <Tab
              key={route.key}
              name={route.name}
              label={label}
              focused={focused}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
