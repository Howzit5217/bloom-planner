import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { SPRING } from '@/theme/tokens';
import { MAX_APP_WIDTH } from './layout';
import { ScrollRail, useScrollRail } from './ScrollRail';
import { T } from './T';
import { t } from '@/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** false for content that scrolls itself (the time wheels), so the two never fight. */
  scroll?: boolean;
}

/** Bottom sheet on a soft scrim; springs up, fades away. */
export function Sheet({ visible, onClose, title, children, scroll = true }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const y = useSharedValue(600);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      y.value = 600;
      y.value = withSpring(0, SPRING);
      fade.value = withTiming(1, { duration: 180 });
    } else if (mounted) {
      fade.value = withTiming(0, { duration: 160 });
      y.value = withTiming(700, { duration: 200 }, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: fade.value }));
  const rail = useScrollRail();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const onScroll = useAnimatedScrollHandler((e) => rail.track(e));
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim }, scrim]}>
          <Pressable accessibilityLabel={t('Close')} accessibilityRole="button" style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              backgroundColor: c.canvas,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 10,
              paddingBottom: insets.bottom + 16,
              maxHeight: '88%',
              // On a wide screen the sheet keeps the app's width, centred under it.
              width: '100%',
              maxWidth: MAX_APP_WIDTH,
              alignSelf: 'center',
              boxShadow: `0px -6px 28px 0px ${c.shadow}`,
            },
            sheet,
          ]}
        >
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.divider, marginBottom: 10 }} />
          <T v="h2" style={{ paddingHorizontal: 22, marginBottom: 8 }} accessibilityRole="header">
            {title}
          </T>
          {scroll ? (
            <View style={{ flexShrink: 1 }}>
              <Animated.ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 8, gap: 16 }}>
                {children}
              </Animated.ScrollView>
              <ScrollRail rail={rail} scrollRef={scrollRef} />
            </View>
          ) : (
            <View style={{ paddingHorizontal: 22, paddingBottom: 8, gap: 16 }}>{children}</View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
