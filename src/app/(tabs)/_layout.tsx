import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { UpdatePrompt } from '@/features/shared/UpdatePrompt';
import { TabBar } from '@/ui/TabBar';
import { tabTransition } from '@/ui/tabMotion';
import { tk } from '@/i18n';

/** The other pages, built one at a time once Home has settled. */
const LATER = ['/progress', '/levels', '/settings'] as const;
const FIRST_AFTER_MS = 1800;
const APART_MS = 700;

export default function TabsLayout() {
  // Built ahead, the first visit to a page fades into the finished page, not a blank one while it's
  // made. On the web a page out of sight draws nothing anyway (its canvases are let go).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const ids = LATER.map((href, i) => setTimeout(() => router.prefetch(href), FIRST_AFTER_MS + i * APART_MS));
    return () => ids.forEach(clearTimeout);
  }, []);
  return (
    <>
      <Tabs screenOptions={{ headerShown: false, ...tabTransition, sceneStyle: { backgroundColor: 'transparent' } }} tabBar={(props) => <TabBar {...props} />}>
        <Tabs.Screen name="index" options={{ title: tk('Home') }} />
        <Tabs.Screen name="progress" options={{ title: tk('Progress') }} />
        <Tabs.Screen name="levels" options={{ title: tk('Levels') }} />
        <Tabs.Screen name="settings" options={{ title: tk('Settings') }} />
      </Tabs>
      {/* A new version pops up over whichever page is open. */}
      <UpdatePrompt />
    </>
  );
}
