import { Tabs } from 'expo-router';
import { UpdatePrompt } from '@/features/shared/UpdatePrompt';
import { TabBar } from '@/ui/TabBar';
import { tabTransition } from '@/ui/tabMotion';
import { tk } from '@/i18n';

export default function TabsLayout() {
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
