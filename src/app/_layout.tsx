import { Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider as NavigationTheme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { MAX_APP_WIDTH } from '@/ui/layout';
import { WorldBackdrop } from '@/ui/Screen';
import { HomeScreenOnly } from '@/features/shared/HomeScreenOnly';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { preloadGameFont } from '@/ui/skia/gameFont';
import { ThemeSwitchHost } from '@/ui/ThemeSwitch';
import { useLifecycle } from '@/hooks/useLifecycle';
import { useWebAutoUpdate } from '@/hooks/useWebAutoUpdate';
import { configureNotifications } from '@/services/notifications';
import { useApp } from '@/store/app';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { PortraitOnly } from '@/features/shared/PortraitOnly';
import { PillButton } from '@/ui/PillButton';
import { Celebration } from '@/ui/skia/Celebration';
import { T } from '@/ui/T';
import { t, useT } from '@/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotifications();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Baloo2_700Bold, Baloo2_800ExtraBold, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const ready = useApp((s) => s.ready);
  const hydrate = useApp((s) => s.hydrate);
  // The drawn numbers' face too, so the first screen opens with its badges and numbers as they'll stay.
  const [numbers, setNumbers] = useState(false);
  useEffect(() => {
    void hydrate();
    void preloadGameFont().then(() => setNumbers(true));
  }, [hydrate]);
  const loaded = (fontsLoaded || !!fontError) && ready && numbers;
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* The real status-bar and screen-edge sizes from the first frame: measured a moment later, the
          whole page opened too high and then dropped into place. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>
          <ThemeSwitchHost>
            <Root />
          </ThemeSwitchHost>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const { c, isDark } = useTheme();
  const { width } = useWindowDimensions();
  useT();
  const profile = useApp((s) => s.profile);
  const loadError = useApp((s) => s.loadError);
  // The web app reloads into a newer version when it comes back to the screen.
  useWebAutoUpdate();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.canvas).catch(() => {});
  }, [c.canvas]);
  if (loadError) return <LoadError message={loadError} />;
  // On a tablet or a computer, the app keeps a phone's width, centred, and the meadow fills the
  // rest of the window behind it: pages there let it show through where they would show their own.
  const wide = width > MAX_APP_WIDTH;
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas, alignItems: 'center' }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {wide ? <WorldBackdrop /> : null}
      <HomeScreenOnly>
        {profile ? <Housekeeping /> : null}
        <View style={{ flex: 1, width: '100%', maxWidth: MAX_APP_WIDTH, backgroundColor: wide ? 'transparent' : c.canvas, overflow: 'hidden' }}>
          {/* The navigators' own background: the app's cream, or clear over the wide-screen meadow. */}
          <NavigationTheme value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: wide ? 'transparent' : c.canvas, card: c.canvas } }}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: wide ? 'transparent' : c.canvas }, animation: 'fade' }}>
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
          </NavigationTheme>
        </View>
        <CelebrationHost />
        {/* Portrait only: an iPhone's home-screen app turned sideways asks to be turned back. */}
        <PortraitOnly />
      </HomeScreenOnly>
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
  const title = cel.maxed ? t('The Very Top!') : cel.goal ? t('Goal Reached!') : t('Level Up!');
  const subtitle = cel.maxed ? t('Level {level}. Every flower planted, every step walked.', { level: cel.level }) : cel.goal ? t('You did it. Take a bow.') : t('On to Level {level}.', { level: cel.level + 1 });
  return <Celebration key={`${cel.level}`} level={cel.level} title={title} subtitle={subtitle} onDone={dismiss} />;
}

function LoadError({ message }: { message: string }) {
  const { c } = useTheme();
  const hydrate = useApp((s) => s.hydrate);
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <T v="h2" center>
        {t('Something Went Wrong Opening Your Log')}
      </T>
      <T v="small" soft center>
        {message}
      </T>
      <PillButton label={t('Try again')} onPress={() => void hydrate()} />
    </View>
  );
}
