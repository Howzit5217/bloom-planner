import type { ComponentProps } from 'react';
import type { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { SPRING } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { useT } from '@/i18n';
import { shadow } from './shadow';
import { noteTab } from './tabMotion';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['flower', 'flower-outline'],
  progress: ['chart-bell-curve-cumulative', 'chart-bell-curve-cumulative'],
  levels: ['stairs-up', 'stairs-up'],
  settings: ['cog', 'cog-outline'],
};

export const TAB_BAR_SPACE = 96;

/** The bar's padding round its tabs, and the highlight behind the tab picked. */
const PAD_X = 6;
const PAD_Y = 4;
const TAB_H = 56;
const PILL_W = 64;
const PILL_H = 44;
/** The highlight's glide to another tab: quick, with the least settle at the end. */
const GLIDE = { damping: 20, stiffness: 260, mass: 1 } as const;

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function Tab({ name, label, focused, onPress }: { name: string; label: string; focused: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const s = useSharedValue(focused ? 1 : 0);
  const pop = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    s.value = withSpring(focused ? 1 : 0, SPRING);
    // Picked, its icon gives a little pop as the highlight arrives under it.
    if (focused && !first.current) pop.value = withSequence(withTiming(1.16, { duration: 130, easing: Easing.out(Easing.quad) }), withSpring(1, SPRING));
    first.current = false;
  }, [focused, s, pop]);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * s.value }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
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
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: TAB_H }}
    >
      <Animated.View style={[{ alignItems: 'center' }, lift]}>
        <Animated.View style={icon}>
          <Icon name={focused ? on : off} size={24} color={focused ? c.leafDeep : c.inkSoft} />
        </Animated.View>
        <T v="caption" color={focused ? c.leafDeep : c.inkSoft} style={{ fontSize: 11, lineHeight: 14 }}>
          {label}
        </T>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Floating pill tab bar, like the game's rounded floating controls. One soft highlight sits behind
 * the tab picked and glides across to the next one picked, stretching a little on the way (more the
 * further it goes) and settling round again under it.
 */
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const count = state.routes.length;
  // Before the pages hear of a change of tab, so each knows which way it went.
  const noted = useRef(false);
  useLayoutEffect(() => {
    noteTab(state.index, !noted.current);
    noted.current = true;
  }, [state.index]);

  const width = useSharedValue(0);
  const at = useSharedValue(state.index);
  const stretch = useSharedValue(0);
  const shown = useRef(state.index);
  useEffect(() => {
    const far = Math.abs(state.index - shown.current);
    shown.current = state.index;
    if (!far) return;
    at.value = withSpring(state.index, GLIDE);
    const amount = Math.min(1, 0.55 + 0.25 * far);
    stretch.value = withSequence(withTiming(amount, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(0, GLIDE));
  }, [state.index, at, stretch]);
  const onLayout = (e: LayoutChangeEvent) => width.set(e.nativeEvent.layout.width);
  const pill = useAnimatedStyle(() => {
    const tab = (width.value - PAD_X * 2) / count;
    const k = stretch.value;
    return {
      opacity: width.value > 0 ? 1 : 0,
      transform: [{ translateX: PAD_X + (at.value + 0.5) * tab - PILL_W / 2 }, { scaleX: 1 + 0.32 * k }, { scaleY: 1 - 0.1 * k }],
    };
  });

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 16 }}>
      <View
        accessibilityRole="tablist"
        onLayout={onLayout}
        style={{
          flexDirection: 'row',
          backgroundColor: c.card,
          borderRadius: 999,
          paddingHorizontal: PAD_X,
          paddingVertical: PAD_Y,
          ...shadow(`0px 8px 26px 0px ${c.shadow}, 0px 2px 6px 0px ${c.shadow}, inset 0px 1px 0px 0px ${c.cardHighlight}`),
        }}
      >
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: PAD_Y + (TAB_H - PILL_H) / 2, width: PILL_W, height: PILL_H, borderRadius: PILL_H / 2, backgroundColor: c.leafPale }, pill]} />
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
