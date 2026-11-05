import { Tabs } from 'expo-router';
import { TabBar } from '@/ui/TabBar';
import { tk } from '@/i18n';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, animation: 'none' }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: tk('Home') }} />
      <Tabs.Screen name="progress" options={{ title: tk('Progress') }} />
      <Tabs.Screen name="levels" options={{ title: tk('Levels') }} />
      <Tabs.Screen name="settings" options={{ title: tk('Settings') }} />
    </Tabs>
  );
}
