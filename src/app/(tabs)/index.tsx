import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { fmt, fmtHours } from '@/engine/format';
import { HomeHeader, MilestoneCard, PaceCard, RingsCard, StreakCard, TimeCard } from '@/features/home/Cards';
import { TodayCard } from '@/features/home/TodayCard';
import { runUpdateCheck, scheduleNotifications } from '@/hooks/useLifecycle';
import { requestPermission } from '@/services/notifications';
import { isNewerThanThisBuild } from '@/services/updates';
import { useApp, useDashboard } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { fmtClock } from '@/ui/TimeWheel';
import { Screen } from '@/ui/Screen';
import { StaggerIn } from '@/ui/StaggerIn';
import { useT } from '@/i18n';

export default function Home() {
  const { t } = useT();
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
  const showUpdate = latest && latest.version !== settings.updates.dismissedVersion && isNewerThanThisBuild(latest.version);
  const obs = dash.observed;
  const drift = [obs.bikeDrift, obs.walkDrift].some((d) => d != null && Math.abs(d) > 0.2);
  const observedKey = `observed-${Math.floor(obs.loggedDays / 7)}`;

  const banners: Array<{ key: string; node: React.ReactNode }> = [];
  if (showUpdate)
    banners.push({
      key: 'update',
      node: (
        <Banner
          icon="gift"
          tone="nectar"
          title={t('Version {version} Is Ready', { version: latest!.version })}
          text={latest!.notes ? (latest!.notes.split('\n').find((l) => l.trim())?.replace(/^[#*\-\s]+/, '') ?? t('A new version is available.')) : t('A new version is available.')}
          action={{
            label: Platform.OS === 'android' && latest!.apkUrl ? t('Download the update') : t('See what’s new'),
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
          icon="alert-circle"
          tone="alert"
          title={t('An Honest Heads-Up')}
          text={t("This needs {steps} steps a day at its busiest. That's about {time} of walking. A later date would be kinder.", { steps: fmt(Math.round(dash.impossible.stepsPerDay / 1000) * 1000), time: fmtHours(dash.impossible.walkHours) })}
          action={{ label: t('Change the goal'), onPress: () => router.push('/settings') }}
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
          text={t("Looks like you've hit both targets for Level {level}. Did you level up?", { level: dash.current.level + 1 })}
          action={{
            label: t('Yes, levelled up'),
            onPress: () => {
              if (dash.todayEntry) void saveEntry({ ...dash.todayEntry, leveledUp: true, newLevel: dash.current.level + 1 });
              else setLevelUpRequest((n) => n + 1);
            },
          }}
        />
      ),
    });
  // Reminders are the phone app's: a web page can't send them.
  if (Platform.OS !== 'web' && dash.replay.days.length >= 1 && !settings.notifications.askedAt)
    banners.push({
      key: 'notify',
      node: (
        <Banner
          icon="bell-ring"
          text={t('Want a gentle nudge each evening?')}
          action={{
            label: t('Yes, at {time}', { time: fmtClock(settings.notifications.hour, settings.notifications.minute) }),
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
    banners.push({ key: 'rates', node: <Banner icon="speedometer-slow" text={t('Log a few days to work out your real rates.')} onDismiss={() => dismiss('rates-week')} /> });
  if (obs.ready && (dash.rates.estimated.length > 0 || drift) && !dismissed[observedKey])
    banners.push({
      key: 'observed',
      node: (
        <Banner
          icon="chart-box"
          text={`${t('A week of logs in: you average {steps} steps and {flowers} flowers a day.', { steps: fmt(obs.medianSteps), flowers: fmt(obs.medianFlowers) })}${obs.bikeFlowersPerHour ? ` ${t('Biking, you plant about {n} an hour.', { n: fmt(obs.bikeFlowersPerHour) })}` : ''}`}
          action={{ label: t('Compare with your rates'), onPress: () => router.push('/settings') }}
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
    >
      {cards.map((card, i) => (
        <StaggerIn key={(card as { key: string }).key ?? i} index={i}>
          {card}
        </StaggerIn>
      ))}
    </Screen>
  );
}
