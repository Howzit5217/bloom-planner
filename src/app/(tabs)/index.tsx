import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { fmt, fmtHours } from '@/engine/format';
import { newsLine } from '@/engine/releaseNotes';
import { severeName } from '@/engine/severe';
import { HomeHeader, MilestoneCard, PaceCard, RingsCard, showsMilestoneCard, showsTimeCard, showsWeekCard, StreakCard, TimeCard, WeekCard } from '@/features/home/Cards';
import { CustomGoalCard, NewGoalCard, showsCustomGoal, showsNewGoal } from '@/features/home/NewGoal';
import { keptExtremeKey } from '@/features/shared/Difficulty';
import { MissedDaySheet } from '@/features/home/MissedDaySheet';
import { TodayCard } from '@/features/home/TodayCard';
import { runUpdateCheck, scheduleNotifications } from '@/hooks/useLifecycle';
import { updateLabel } from '@/features/shared/UpdatePrompt';
import { useUpdateInstall } from '@/services/installUpdate';
import { requestPermission } from '@/services/notifications';
import { isNewerThanThisBuild } from '@/services/updates';
import { useApp, useDashboard } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { Reveal } from '@/ui/Reveal';
import { useBloom } from '@/ui/bloom';
import { fmtClock } from '@/ui/TimeWheel';
import { Screen } from '@/ui/Screen';
import { StaggerIn } from '@/ui/StaggerIn';
import { useT } from '@/i18n';

export default function Home() {
  const { t } = useT();
  const dash = useDashboard();
  const settings = useApp((s) => s.settings);
  const profile = useApp((s) => s.profile);
  const updateSettings = useApp((s) => s.updateSettings);
  const saveEntry = useApp((s) => s.saveEntry);
  const refreshToday = useApp((s) => s.refreshToday);
  const [levelUpRequest, setLevelUpRequest] = useState(0);
  // Banners on their way out: each folds away first, and is dismissed once it has.
  const [closing, setClosing] = useState<Record<string, () => void>>({});
  const fold = (key: string, done: () => void) => () => setClosing((s) => ({ ...s, [key]: done }));
  const folded = (key: string) => {
    const done = closing[key];
    setClosing(({ [key]: _gone, ...rest }) => rest);
    done?.();
  };
  const install = useUpdateInstall();
  // The meadow grows fuller with the level reached.
  const level = dash?.current.level ?? null;
  const maxLevel = useApp((s) => s.table.maxLevel);
  const setBloom = useBloom((s) => s.setShare);
  useEffect(() => {
    if (level != null) setBloom(level / Math.max(1, maxLevel));
  }, [level, maxLevel, setBloom]);
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
          text={newsLine(latest!.notes) ?? t('A new version is available.')}
          action={{
            // Android: downloads in the app (with its progress) and opens the installer, so it's one
            // tap on Install; the same download as the popup's.
            label: Platform.OS === 'android' && latest!.apkUrl ? updateLabel(install.step, install.share, t) : t('See what’s new'),
            onPress: () => {
              if (Platform.OS !== 'android' || !latest!.apkUrl) return void WebBrowser.openBrowserAsync(latest!.url);
              if (install.step === 'downloading') return;
              void install.start(latest!.apkUrl);
            },
          }}
          onDismiss={fold('update', () => void updateSettings({ updates: { ...settings.updates, dismissedVersion: latest!.version } }))}
        />
      ),
    });
  // Severe weather today or tomorrow: what's coming, and that the plan already asks less of that day.
  const severeDay = dash.week.slice(0, 2).find((d) => d.severe.length && !d.logged);
  const severeKey = severeDay ? `severe-${severeDay.date}` : '';
  if (severeDay && !dismissed[severeKey])
    banners.push({
      key: 'severe',
      node: (
        <Banner
          icon="alert"
          tone="alert"
          title={severeDay.date === dash.today ? t('Severe Weather Today') : t('Severe Weather Tomorrow')}
          text={t('{what} in the forecast. Stay safe: that day asks for very little, and other days make up the difference.', { what: severeName(severeDay.severe[0], t) })}
          onDismiss={fold('severe', () => dismiss(severeKey))}
        />
      ),
    });
  // Not for a goal kept on purpose after "Are you sure?", and it can be put away.
  const extremeKey = profile ? keptExtremeKey(profile.goalLevel, profile.goalDate) : '';
  // Past what's possible every day, it comes back even for a kept goal (put away on its own).
  const impossibleKey = dash.impossible?.everyDay ? `${extremeKey}-every` : extremeKey;
  if (dash.impossible && !dismissed[impossibleKey])
    banners.push({
      key: 'impossible',
      node: (
        <Banner
          icon="alert-circle"
          tone="alert"
          title={t('An Honest Heads-Up')}
          text={
            dash.impossible.everyDay
              ? t('This now needs about {steps} steps every day, more than anyone can keep up. A later date would work.', { steps: fmt(Math.round(dash.impossible.stepsPerDay / 1000) * 1000) })
              : t("This needs {steps} steps a day at its busiest, about {time} of walking. A later date would be kinder.", { steps: fmt(Math.round(dash.impossible.stepsPerDay / 1000) * 1000), time: fmtHours(dash.impossible.walkHours) })
          }
          action={{ label: t('Change the goal'), onPress: () => router.push('/settings') }}
          onDismiss={fold('impossible', () => dismiss(impossibleKey))}
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
          text={t('Everything for Level {level} looks cleared. Did you level up?', { level: dash.current.level + 1 })}
          action={{
            label: t('Yes, leveled up'),
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
          onDismiss={fold('notify', () => void updateSettings({ notifications: { ...settings.notifications, askedAt: new Date().toISOString() } }))}
        />
      ),
    });
  if (dash.rates.estimated.length > 0 && obs.loggedDays < 7 && !dismissed['rates-week'])
    banners.push({ key: 'rates', node: <Banner icon="speedometer-slow" text={t('Log a few days to work out your real rates.')} onDismiss={fold('rates', () => dismiss('rates-week'))} /> });
  if (obs.ready && (dash.rates.estimated.length > 0 || drift) && !dismissed[observedKey])
    banners.push({
      key: 'observed',
      node: (
        <Banner
          icon="chart-box"
          text={`${t('A week of logs in: you average {steps} steps and {flowers} flowers a day.', { steps: fmt(obs.medianSteps), flowers: fmt(obs.medianFlowers) })}${obs.bikeFlowersPerHour ? ` ${t('Biking, you plant about {n} an hour.', { n: fmt(obs.bikeFlowersPerHour) })}` : ''}`}
          action={{ label: t('Compare with your rates'), onPress: () => router.push('/settings') }}
          onDismiss={fold('observed', () => dismiss(observedKey))}
        />
      ),
    });

  const bannerKeys = new Set(banners.map((b) => b.key));
  // Only cards with something to show, so every gap between them is the same.
  const cards = [
    <HomeHeader key="h" dash={dash} />,
    ...banners.map((b) => <View key={b.key}>{b.node}</View>),
    showsNewGoal(dash) ? <NewGoalCard key="new-goal" dash={dash} /> : null,
    <TodayCard key={`today-${dash.today}`} dash={dash} levelUpRequest={levelUpRequest} />,
    // At the top level there's no next level: the user's own goal takes the rings.
    dash.phase === 'maxed' ? (showsCustomGoal(dash) ? <CustomGoalCard key="custom" dash={dash} /> : null) : <RingsCard key="rings" dash={dash} />,
    <PaceCard key="pace" dash={dash} />,
    showsWeekCard(dash) ? <WeekCard key="week" dash={dash} /> : null,
    showsTimeCard(dash) ? <TimeCard key="time" dash={dash} /> : null,
    <StreakCard key="streak" dash={dash} />,
    showsMilestoneCard(dash) ? <MilestoneCard key="milestone" dash={dash} /> : null,
  ].filter((card): card is React.ReactElement => card != null);

  return (
    <>
      <Screen
        backdrop="meadow"
        onRefresh={async () => {
          refreshToday();
          if (settings.updates.enabled) await runUpdateCheck().catch(() => {});
          await scheduleNotifications().catch(() => {});
        }}
      >
        {cards.map((card, i) => {
          const key = (card as { key: string }).key ?? String(i);
          const shown = (
            <StaggerIn key={key} index={i} page="home">
              {card}
            </StaggerIn>
          );
          // A banner folds away when it's put away, and what's below moves up to close the gap.
          return bannerKeys.has(key) ? (
            <Reveal key={key} open={!closing[key]} gap={16} onClosed={() => folded(key)}>
              {shown}
            </Reveal>
          ) : (
            shown
          );
        })}
      </Screen>
      {/* A day gone by with nothing logged: asked for once, on coming back. */}
      <MissedDaySheet dash={dash} />
    </>
  );
}
