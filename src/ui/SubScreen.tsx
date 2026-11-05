import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { Icon } from './Icon';
import { T } from './T';

/** A pushed screen with a back link and a title. */
export function SubScreen({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, minWidth: 44 }}>
          <Icon name="chevron-left" size={28} color={c.leafDeep} />
          <T v="bodyBold" color={c.leafDeep}>
            Settings
          </T>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 16 }}>
        <T v="h1" accessibilityRole="header">
          {title}
        </T>
        {children}
      </ScrollView>
    </View>
  );
}
