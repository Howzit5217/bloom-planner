import { Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLifecycle } from '@/hooks/useLifecycle';
import { configureNotifications } from '@/services/notifications';
import { useApp } from '@/store/app';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { PillButton } from '@/ui/PillButton';
import { Celebration } from '@/ui/skia/Celebration';
import { T } from '@/ui/T';

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotifications();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Baloo2_700Bold, Baloo2_800ExtraBold, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const ready = useApp((s) => s.ready);
  const hydrate = useApp((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  const loaded = (fontsLoaded || !!fontError) && ready;
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const { c, isDark } = useTheme();
  const profile = useApp((s) => s.profile);
  const loadError = useApp((s) => s.loadError);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.canvas).catch(() => {});
  }, [c.canvas]);
  if (loadError) return <LoadError message={loadError} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {profile ? <Housekeeping /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.canvas }, animation: 'fade' }}>
        <Stack.Protected guard={!profile}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!profile}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="climate" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="location" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="seasons" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
      </Stack>
      <CelebrationHost />
    </View>
  );
}

function Housekeeping() {
  useLifecycle();
  return null;
}

function CelebrationHost() {
  const cel = useApp((s) => s.celebration);
  const dismiss = useApp((s) => s.dismissCelebration);
  if (!cel) return null;
  const title = cel.maxed ? 'The very top!' : cel.goal ? 'Goal reached!' : 'Level up!';
  const subtitle = cel.maxed ? 'Level 130. Every flower planted, every step walked.' : cel.goal ? 'You did it. Take a bow.' : `On to Level ${cel.level + 1}.`;
  return <Celebration key={`${cel.level}`} level={cel.level} title={title} subtitle={subtitle} onDone={dismiss} />;
}

function LoadError({ message }: { message: string }) {
  const { c } = useTheme();
  const hydrate = useApp((s) => s.hydrate);
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <T v="h2" center>
        Something went wrong opening your log
      </T>
      <T v="small" soft center>
        {message}
      </T>
      <PillButton label="Try again" onPress={() => void hydrate()} />
    </View>
  );
}
