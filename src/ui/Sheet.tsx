import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { SPRING } from '@/theme/tokens';
import { T } from './T';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Bottom sheet on a soft scrim; springs up, fades away. */
export function Sheet({ visible, onClose, title, children }: Props) {
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
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim }, scrim]}>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" style={{ flex: 1 }} onPress={onClose} />
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
              boxShadow: `0px -6px 28px 0px ${c.shadow}`,
            },
            sheet,
          ]}
        >
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.divider, marginBottom: 10 }} />
          <T v="h2" style={{ paddingHorizontal: 22, marginBottom: 8 }} accessibilityRole="header">
            {title}
          </T>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 8, gap: 16 }}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
