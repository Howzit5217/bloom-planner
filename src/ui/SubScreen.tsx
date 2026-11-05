import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedRef, useAnimatedScrollHandler } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { Icon } from './Icon';
import { ScrollRail, useScrollRail } from './ScrollRail';
import { T } from './T';
import { t } from '@/i18n';

/** A pushed screen with a back link and a title. */
export function SubScreen({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const rail = useScrollRail();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const onScroll = useAnimatedScrollHandler((e) => rail.track(e));
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => router.back()} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, minWidth: 44 }}>
          <Icon name="chevron-left" size={28} color={c.leafDeep} />
          <T v="bodyBold" color={c.leafDeep}>
            {t('Settings')}
          </T>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        <Animated.ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 16 }}>
          <T v="h1" accessibilityRole="header">
            {title}
          </T>
          {children}
        </Animated.ScrollView>
        <ScrollRail rail={rail} scrollRef={scrollRef} top={8} bottom={insets.bottom + 12} />
      </View>
    </View>
  );
}
