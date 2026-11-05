import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { fmt, fmtHours } from '@/engine/format';
import { HomeHeader, MilestoneCard, PaceCard, RingsCard, StreakCard, TimeCard } from '@/features/home/Cards';
import { TodayCard } from '@/features/home/TodayCard';
import { runUpdateCheck, scheduleNotifications } from '@/hooks/useLifecycle';
import { requestPermission } from '@/services/notifications';
import { useApp, useDashboard } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { Walker } from '@/ui/skia/Walker';
import { StaggerIn } from '@/ui/StaggerIn';
import { TAB_BAR_SPACE } from '@/ui/TabBar';

export default function Home() {
  const dash = useDashboard();
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const saveEntry = useApp((s) => s.saveEntry);
  const refreshToday = useApp((s) => s.refreshToday);
  const [levelUpRequest, setLevelUpRequest] = useState(0);
  if (!dash) return null;

  const dismissed = settings.dismissed;
  const dismiss = (k: string) => updateSettings({ dismissed: { ...dismissed, [k]: true } });
  const latest = settings.updates.latest;
  const showUpdate = latest && latest.version !== settings.updates.dismissedVersion;
  const obs = dash.observed;
  const drift = [obs.bikeDrift, obs.walkDrift].some((d) => d != null && Math.abs(d) > 0.2);
  const observedKey = `observed-${Math.floor(obs.loggedDays / 7)}`;

  const banners: Array<{ key: string; node: React.ReactNode }> = [];
  if (showUpdate)
    banners.push({
      key: 'update',
      node: (
        <Banner
          icon="gift-outline"
          tone="nectar"
          title={`Version ${latest!.version} is ready`}
          text={latest!.notes ? latest!.notes.split('\n').find((l) => l.trim())?.replace(/^[#*\-\s]+/, '') ?? 'A new version is available.' : 'A new version is available.'}
          action={{
            label: Platform.OS === 'android' && latest!.apkUrl ? 'Download the update' : 'See what’s new',
            onPress: () => (Platform.OS === 'android' && latest!.apkUrl ? Linking.openURL(latest!.apkUrl) : WebBrowser.openBrowserAsync(latest!.url)),
          }}
          onDismiss={() => updateSettings({ updates: { ...settings.updates, dismissedVersion: latest!.version } })}
        />
      ),
    });
  if (dash.impossible)
    banners.push({
      key: 'impossible',
      node: (
        <Banner
          icon="alert-circle-outline"
          tone="alert"
          title="An honest heads-up"
          text={`This needs ${fmt(Math.round(dash.impossible.stepsPerDay / 1000) * 1000)} steps a day at its busiest. That's about ${fmtHours(dash.impossible.walkHours)} of walking. A later date would be kinder.`}
          action={{ label: 'Change the goal', onPress: () => router.push('/settings') }}
        />
      ),
    });
  if (dash.phase === 'active' && dash.replay.readyToLevel)
    banners.push({
      key: 'ready',
      node: (
        <Banner
          icon="party-popper"
          tone="nectar"
          text={`Looks like you've hit both targets for Level ${dash.current.level + 1}. Did you level up?`}
          action={{
            label: 'Yes, I levelled up',
            onPress: () => {
              if (dash.todayEntry) void saveEntry({ ...dash.todayEntry, leveledUp: true, newLevel: dash.current.level + 1 });
              else setLevelUpRequest((n) => n + 1);
            },
          }}
        />
      ),
    });
  if (dash.replay.days.length >= 1 && !settings.notifications.askedAt)
    banners.push({
      key: 'notify',
      node: (
        <Banner
          icon="bell-ring-outline"
          text="Want a gentle nudge each evening? One reminder a day at most, never a guilt trip."
          action={{
            label: 'Yes, remind me at 8:30pm',
            onPress: async () => {
              const ok = await requestPermission();
              await updateSettings({ notifications: { ...settings.notifications, enabled: ok, askedAt: new Date().toISOString() } });
            },
          }}
          onDismiss={() => updateSettings({ notifications: { ...settings.notifications, askedAt: new Date().toISOString() } })}
        />
      ),
    });
  if (dash.rates.estimated.length > 0 && obs.loggedDays < 7 && !dismissed['rates-week'])
    banners.push({ key: 'rates', node: <Banner icon="speedometer-slow" text="Log a few days and I'll work out your real rates." onDismiss={() => dismiss('rates-week')} /> });
  if (obs.ready && (dash.rates.estimated.length > 0 || drift) && !dismissed[observedKey])
    banners.push({
      key: 'observed',
      node: (
        <Banner
          icon="chart-line"
          text={`A week of logs in: you average ${fmt(obs.medianSteps)} steps and ${fmt(obs.medianFlowers)} flowers a day.${obs.bikeFlowersPerHour ? ` Biking, you plant about ${fmt(obs.bikeFlowersPerHour)} an hour.` : ''}`}
          action={{ label: 'Compare with my rates', onPress: () => router.push('/settings') }}
          onDismiss={() => dismiss(observedKey)}
        />
      ),
    });

  const cards = [
    <HomeHeader key="h" dash={dash} />,
    ...banners.map((b) => <View key={b.key}>{b.node}</View>),
    <TodayCard key={`today-${dash.today}`} dash={dash} levelUpRequest={levelUpRequest} />,
    <RingsCard key="rings" dash={dash} />,
    <PaceCard key="pace" dash={dash} />,
    <TimeCard key="time" dash={dash} />,
    <StreakCard key="streak" dash={dash} />,
    <MilestoneCard key="milestone" dash={dash} />,
  ];

  return (
    <Screen
      backdrop="meadow"
      onRefresh={async () => {
        refreshToday();
        if (settings.updates.enabled) await runUpdateCheck().catch(() => {});
        await scheduleNotifications().catch(() => {});
      }}
      bottomExtra={<Walker bottom={TAB_BAR_SPACE + 4} />}
    >
      {cards.map((card, i) => (
        <StaggerIn key={(card as { key: string }).key ?? i} index={i}>
          {card}
        </StaggerIn>
      ))}
    </Screen>
  );
}
