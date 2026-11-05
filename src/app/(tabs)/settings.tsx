import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { entriesToCsv } from '@/engine/csv';
import { addDaysKey, fromKey, toKey, type DayKey } from '@/engine/dates';
import { planDifficulty } from '@/engine/difficulty';
import { checkGoal } from '@/engine/goalCheck';
import { fmt, fmtDate } from '@/engine/format';
import { DEFAULT_RATES, RATE_KEYS, type RateKey } from '@/engine/rates';
import type { ThresholdPreset } from '@/engine/types';
import { DifficultyPill } from '@/features/shared/Difficulty';
import { CustomGoalForm } from '@/features/home/NewGoal';
import { GoalVerdict, useEarliestDate } from '@/features/shared/GoalVerdict';
import { runUpdateCheck, scheduleNotifications } from '@/hooks/useLifecycle';
import { requestPermission } from '@/services/notifications';
import { APP_VERSION, IS_BETA_BUILD, REPO_URL } from '@/services/updates';
import { shareTextFile } from '@/services/shareFile';
import { useApp, useDashboard, type LogMode, type ThemePref } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { Banner } from '@/ui/Banner';
import { Card } from '@/ui/Card';
import { DateField } from '@/ui/DateField';
import { Icon, type IconName } from '@/ui/Icon';
import { IconChip } from '@/ui/IconChip';
import { NumberField } from '@/ui/NumberField';
import { PillButton } from '@/ui/PillButton';
import { Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { FlowerAccent } from '@/ui/skia/FlowerAccent';
import { Stepper } from '@/ui/Stepper';
import { T } from '@/ui/T';
import { fmtClock, TimeWheel } from '@/ui/TimeWheel';
import { Toggle } from '@/ui/Toggle';
import { LANGS, tk, useT } from '@/i18n';

const RATE_LABELS: Record<RateKey, string> = {
  walkStepsPerHour: tk('Steps per hour walking'),
  bikeFlowersPerHour: tk('Flowers per hour biking'),
  walkFlowersPerHour: tk('Flowers per hour walking'),
};
const PRESET_NAMES: Record<ThresholdPreset, string> = {
  fair: tk('Fair weather'),
  normal: tk('Normal'),
  all: tk('All weather'),
};

const IS_WEB = Platform.OS === 'web';
function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconChip name={icon} />
        <T v="h3" accessibilityRole="header">
          {title}
        </T>
      </View>
      {children}
    </Card>
  );
}

function LinkRow({ label, onPress, icon = 'chevron-right' }: { label: string; onPress: () => void; icon?: IconName }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 48,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <T v="bodyBold" color={c.leafDeep}>
        {label}
      </T>
      <Icon name={icon} size={22} color={c.leafDeep} />
    </Pressable>
  );
}

export default function Settings() {
  const { c } = useTheme();
  const { t, tn, lang } = useT();
  const [langSheet, setLangSheet] = useState(false);
  const dash = useDashboard();
  const st = useApp();
  const profile = st.profile;
  const [confirmReset, setConfirmReset] = useState(false);
  const [timeSheet, setTimeSheet] = useState(false);
  const [timeDraft, setTimeDraft] = useState({ hour: 20, minute: 0 });
  const [checking, setChecking] = useState<string | null>(null);
  // A goal change is checked first: a reasonable one saves (a moment after you stop sliding),
  // an unreasonable one stays here as a draft with the earliest date that would work.
  const [goalDraft, setGoalDraft] = useState<{
    level: number;
    date: DayKey;
  } | null>(null);
  const goalBase =
    profile && dash
      ? {
          start: dash.plan.start,
          startKey: dash.plan.startKey,
          seasonRates: st.seasonRates.map((r) => r.rideable),
          req: dash.req,
          bikeFlowersPerHour: dash.rates.bikeFlowersPerHour,
          bikes: dash.rates.bikes,
          walkFlowersPerHour: dash.rates.walkFlowersPerHour,
        }
      : null;
  const draftCheck =
    goalBase && goalDraft
      ? checkGoal({
          ...goalBase,
          goalLevel: goalDraft.level,
          goalKey: goalDraft.date,
        })
      : null;
  const earliest = useEarliestDate(goalBase && goalDraft && draftCheck && !draftCheck.ok ? { ...goalBase, goalLevel: goalDraft.level } : null);
  const draftOk = !!draftCheck?.ok;
  const saveGoal = st.updateProfile;
  useEffect(() => {
    if (!goalDraft || !draftOk) return;
    const timer = setTimeout(() => {
      void saveGoal({ goalLevel: goalDraft.level, goalDate: goalDraft.date });
      setGoalDraft(null);
    }, 350);
    return () => clearTimeout(timer);
  }, [goalDraft, draftOk, saveGoal]);
  if (!profile || !dash) return null;
  const shownGoal = goalDraft ?? {
    level: profile.goalLevel,
    date: profile.goalDate,
  };
  // How hard the goal on show is: the draft while you're changing it, otherwise the saved plan.
  const shownDifficulty = goalDraft ? (draftCheck?.ok && draftCheck.plan?.status === 'ok' ? planDifficulty(draftCheck.stepsPerDay, draftCheck.flowersPerRideDay, dash.rates) : null) : dash.difficulty;

  const minGoal = dash.current.level + 1;
  const notif = st.settings.notifications;
  const dev = st.settings.dev;
  const overrides = Object.values(st.overrides).sort((a, b) => a.level - b.level);
  const obs = dash.observed;
  const bikes = dash.rates.bikes;
  // When the level data was looked up, as a date like the rest of the app shows.
  const retrieved = /^\d{4}-\d{2}-\d{2}$/.test(st.table.retrieved) ? fmtDate(st.table.retrieved as DayKey) : st.table.retrieved;

  const setRate = (k: RateKey, v: number | null) => st.setRates({ ...profile.rates, [k]: v });
  const pickTime = () => {
    setTimeDraft({ hour: notif.hour, minute: notif.minute });
    setTimeSheet(true);
  };
  const exportCsv = () => shareTextFile(`bloom-planner-log-${dash.today}.csv`, entriesToCsv(st.entries), 'text/csv', t('Export your log'));

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <T v="h1" accessibilityRole="header">
          {t('Settings')}
        </T>
        <FlowerAccent arrangement="scatter" width={132} height={50} />
      </View>

      <Section title={t('Goal')} icon="flag-checkered">
        {dash.phase === 'maxed' ? (
          // Past the top level the goal is the user's own: steps and flowers by a date.
          <CustomGoalForm dash={dash} />
        ) : (
          <>
            <Stepper label={t('Target level')} value={Math.max(minGoal, shownGoal.level)} min={Math.min(minGoal, st.table.maxLevel)} max={st.table.maxLevel} onChange={(v) => setGoalDraft({ level: v, date: shownGoal.date })} size={60} />
            <DateField label={t('Target date')} value={shownGoal.date} onChange={(k) => setGoalDraft({ level: shownGoal.level, date: k })} minimumDate={fromKey(addDaysKey(dash.today, 1))} />
            {shownDifficulty ? <DifficultyPill d={shownDifficulty} /> : null}
            {goalDraft && draftCheck && !draftCheck.ok ? (
              <>
                <GoalVerdict check={draftCheck} earliest={earliest} onUseDate={(k) => setGoalDraft({ level: goalDraft.level, date: k })} />
                <T v="caption" soft>
                  {t('Your saved goal stays level {level} by {date} until you pick one that works.', { level: profile.goalLevel, date: fmtDate(profile.goalDate) })}
                </T>
                <PillButton label={t('Keep the saved goal')} variant="ghost" size="md" onPress={() => setGoalDraft(null)} />
              </>
            ) : null}
            {!goalDraft && profile.goalLevel <= dash.current.level ? <Banner icon="trophy" tone="nectar" text={t("You've reached this goal. Raise the level to plan the next stretch.")} /> : null}
          </>
        )}
      </Section>

      <Section title={t('Daily Log')} icon="notebook-edit-outline">
        <Segmented<LogMode>
          label={t('Log each day by')}
          value={st.settings.logMode}
          onChange={(m) => void st.updateSettings({ logMode: m })}
          options={[
            { key: 'daily', label: t('Step count') },
            { key: 'left', label: t('Amount remaining') },
          ]}
        />
        <T v="caption" soft>
          {st.settings.logMode === 'left' ? t("What the game's level-up screen shows still to go: steps, flowers and the level's quest, like mushrooms or expeditions.") : t("The day's steps and flowers.")}
        </T>
      </Section>

      <Section title={t('Your Pace')} icon="speedometer">
        {obs.loggedDays > 0 ? (
          <T v="small" soft>
            {t('From {days}: you average {steps} steps and {flowers} flowers a day.', {
              days: tn(obs.loggedDays, '{n} logged day', '{n} logged days', {
                n: fmt(obs.loggedDays),
              }),
              steps: fmt(obs.medianSteps),
              flowers: fmt(obs.medianFlowers),
            })}
          </T>
        ) : null}
        <Toggle label={t('Biking for Flowers')} hint={t('Turn off to plan flowers from walking only.')} value={bikes} onChange={(b) => void st.setRates({ ...profile.rates, bikes: b })} />
        {RATE_KEYS.filter((k) => bikes || k !== 'bikeFlowersPerHour').map((k) => {
          const v = profile.rates[k];
          const suggestion = k === 'bikeFlowersPerHour' ? obs.bikeFlowersPerHour : k === 'walkFlowersPerHour' ? obs.walkFlowersPerHour : null;
          return (
            <View key={k} style={{ gap: 6 }}>
              <NumberField
                label={t(RATE_LABELS[k])}
                value={v}
                onChange={(n) => void setRate(k, n)}
                placeholder={fmt(DEFAULT_RATES[k])}
                size="md"
                hint={
                  v == null
                    ? t('Using a typical {n} until you set it.', {
                        n: fmt(DEFAULT_RATES[k]),
                      })
                    : undefined
                }
              />
              {suggestion && obs.ready && suggestion !== v ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void setRate(k, suggestion)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 40,
                  }}
                >
                  <Icon name="lightbulb-on" size={18} color={c.nectar} />
                  <T v="smallBold" color={c.leafDeep}>
                    {t('Your log says about {n}/h. Use that', {
                      n: fmt(suggestion),
                    })}
                  </T>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        <Toggle label={t('Indoor Walking')} hint={t('Treadmill, walking at work.')} value={profile.rates.treadmillAvailable} onChange={(b) => void st.setRates({ ...profile.rates, treadmillAvailable: b })} />
      </Section>

      <Section title={t('Where You Play')} icon="map-marker-radius">
        {bikes ? (
          <>
            <T v="bodyBold">{st.location ? st.location.label || `${st.location.latitude.toFixed(2)}, ${st.location.longitude.toFixed(2)}` : t('Not set')}</T>
            <T v="caption" soft>
              {st.location ? `${t('Weather history from {years} years, looked up {date}.', { years: st.location.climateYears, date: fmtDate(toKey(new Date(st.location.resolvedAt))) })} ` : ''}
              {st.seasonRates.some((r) => r.source === 'manual') ? t('Months set by hand.') : st.seasonRates.every((r) => r.source === 'default') ? t('Every day counts as rideable.') : t('Months from the climate record.')}
            </T>
            <LinkRow label={st.location ? t('Change place') : t('Find your place')} onPress={() => router.push('/location')} />
            {st.location && st.climate ? <LinkRow label={t('Climate details')} onPress={() => router.push('/climate')} /> : null}
            <LinkRow label={t('Edit months by hand')} onPress={() => router.push('/seasons')} />
            <View style={{ gap: 6 }}>
              <T v="smallBold">{t('How Tough Are You?')}</T>
              <Segmented<ThresholdPreset>
                label={t('Weather threshold')}
                value={st.settings.preset}
                onChange={(p) => void st.setPreset(p)}
                options={(['fair', 'normal', 'all'] as const).map((k) => ({
                  key: k,
                  label: t(PRESET_NAMES[k]),
                }))}
              />
              <T v="caption" soft>
                {st.settings.preset === 'fair'
                  ? t('No rain at all, at least 5°C and 11 hours of daylight.')
                  : st.settings.preset === 'all'
                    ? t('Up to 15mm of rain, 3cm of snow, down to -5°C, 8 hours of daylight.')
                    : t('Up to 5mm of rain, 1cm of snow, at least 2°C and 9.5 hours of daylight.')}
                {st.seasonRates.some((r) => r.source === 'manual') ? ` ${t('Your hand-set months stay as they are.')}` : ''}
              </T>
            </View>
          </>
        ) : (
          <T v="small" soft>
            {t('Weather only matters for riding, so walking-only plans leave it out.')}
          </T>
        )}
      </Section>

      <Section title={t('Your Corrections')} icon="pencil-circle">
        {overrides.length === 0 ? (
          <T v="small" soft>
            {t('None yet. Tap any level in Levels to correct it with what your game shows.')}
          </T>
        ) : (
          overrides.map((o) => {
            const row = st.table.byLevel[o.level];
            return (
              <View key={o.level} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyBold">{t('Level {level}', { level: o.level })}</T>
                  <T v="caption" soft>
                    {t('{steps} steps · {flowers} flowers (bundled {bSteps} / {bFlowers})', {
                      steps: fmt(o.steps ?? row.steps),
                      flowers: fmt(o.flowers ?? row.flowers),
                      bSteps: fmt(row.steps),
                      bFlowers: fmt(row.flowers),
                    })}
                  </T>
                </View>
                <PillButton label={t('Remove')} size="sm" variant="ghost" onPress={() => void st.removeOverride(o.level)} />
              </View>
            );
          })
        )}
      </Section>

      {/* A web page cannot remind anyone at 8pm, so the web version has no reminders. */}
      {!IS_WEB ? (
        <Section title={t('Reminders')} icon="bell">
          <Toggle
            label={t('Evening Check-In')}
            hint={t('One friendly reminder a day at most.')}
            value={notif.enabled}
            onChange={async (on) => {
              const ok = on ? await requestPermission() : true;
              await st.updateSettings({
                notifications: {
                  ...notif,
                  enabled: on && ok,
                  askedAt: notif.askedAt ?? new Date().toISOString(),
                },
              });
              void scheduleNotifications();
            }}
          />
          {notif.enabled ? (
            <>
              <LinkRow
                label={t('Reminder at {time}', {
                  time: fmtClock(notif.hour, notif.minute),
                })}
                onPress={pickTime}
                icon="clock-edit"
              />
              {bikes ? (
                <Toggle
                  label={t('Good-Day-to-Ride Nudges')}
                  hint={t('When a bright, dry day follows a day without flowers. Twice a week at most.')}
                  value={notif.nudges}
                  onChange={(b) =>
                    void st.updateSettings({
                      notifications: { ...notif, nudges: b },
                    })
                  }
                />
              ) : null}
              <Toggle
                label={t('Behind-Pace Heads-Up')}
                hint={t('Only past 5 days behind, once a week at most.')}
                value={notif.behind}
                onChange={(b) =>
                  void st.updateSettings({
                    notifications: { ...notif, behind: b },
                  })
                }
              />
              <Toggle
                label={t('Level-Up Coming')}
                hint={t('When a level is about 2 days away.')}
                value={notif.milestones}
                onChange={(b) =>
                  void st.updateSettings({
                    notifications: { ...notif, milestones: b },
                  })
                }
              />
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title={t('Appearance')} icon="theme-light-dark">
        <Segmented<ThemePref>
          label={t('Theme')}
          value={st.settings.theme}
          onChange={(th) => void st.updateSettings({ theme: th })}
          options={[
            { key: 'system', label: t('Match phone') },
            { key: 'light', label: t('Day') },
            { key: 'dark', label: t('Night') },
          ]}
        />
        <LinkRow label={`${t('Language')}: ${st.settings.language === 'system' ? `${t('Match phone')} (${LANGS.find((l) => l.code === lang)?.name})` : LANGS.find((l) => l.code === st.settings.language)?.name}`} onPress={() => setLangSheet(true)} icon="translate" />
      </Section>

      <Section title={t('Your Data')} icon="database">
        <PillButton label={t('Export log as CSV')} variant="secondary" icon="file-delimited" size="md" onPress={() => void exportCsv()} disabled={st.entries.length === 0} />
        {!confirmReset ? (
          <PillButton label={t('Reset everything')} variant="ghost" icon="delete" size="md" onPress={() => setConfirmReset(true)} />
        ) : (
          <Card variant="deep" style={{ gap: 10 }}>
            <T v="bodyBold">{t('Delete your log, goal, corrections and settings?')}</T>
            <T v="small" soft>
              {t("This can't be undone. Export your log first if you want to keep it.")}
            </T>
            <PillButton label={t('Yes, delete everything')} variant="danger" size="md" onPress={() => void st.resetEverything()} />
            <PillButton label={t('No, keep everything')} variant="ghost" size="md" onPress={() => setConfirmReset(false)} />
          </Card>
        )}
      </Section>

      {/* The web version is always the newest, and its level data refreshes by itself. */}
      {!IS_WEB ? (
        <Section title={t('Updates')} icon="update">
          <Toggle
            label={t('Check GitHub for Updates')}
            hint={t('Once a day: new app versions and corrected level data. Nothing about you is sent.')}
            value={st.settings.updates.enabled}
            onChange={(b) =>
              void st.updateSettings({
                updates: { ...st.settings.updates, enabled: b },
              })
            }
          />
          <T v="small" soft>
            {t('Version {version} · level data v{data} (checked {date})', {
              version: APP_VERSION,
              data: st.table.version,
              date: retrieved,
            })}
            {st.settings.updates.lastCheck ? ` · ${t('last check {date}', { date: fmtDate(toKey(new Date(st.settings.updates.lastCheck))) })}` : ''}
          </T>
          <PillButton
            label={checking ?? t('Check now')}
            size="md"
            variant="secondary"
            icon="refresh"
            onPress={async () => {
              setChecking(t('Checking…'));
              const r = await runUpdateCheck().catch(() => ({
                app: false,
                levels: false,
              }));
              setChecking(r.app ? t('An update is ready (see Home)') : r.levels ? t('Level data updated') : t('Fresh as a daisy: you’re up to date'));
              setTimeout(() => setChecking(null), 2500);
            }}
          />
          <LinkRow label={t('Project page on GitHub')} onPress={() => void WebBrowser.openBrowserAsync(REPO_URL)} icon="open-in-new" />
        </Section>
      ) : null}

      <Section title={t('About')} icon="information">
        <T v="small">{t('Level data: Pikmin wiki (Pikipedia), "Level" page, retrieved {date}. Only the factual requirement numbers are used.', { date: retrieved })}</T>
        <LinkRow label="pikminwiki.com/Level" onPress={() => void WebBrowser.openBrowserAsync('https://www.pikminwiki.com/Level')} icon="open-in-new" />
        <T v="small">{t('Weather history and place search: Open-Meteo, free for non-commercial use under CC BY 4.0.')}</T>
        <LinkRow label="open-meteo.com" onPress={() => void WebBrowser.openBrowserAsync('https://open-meteo.com')} icon="open-in-new" />
        <T v="caption" soft>
          {t('Bloom Planner is an unofficial fan-made planner. It is not affiliated with or endorsed by Scopely or Nintendo. Pikmin Bloom is a trademark of its owners.')}
        </T>
      </Section>

      {/* Only in beta builds (tools/beta.ps1): release builds have no developer options at all. */}
      {IS_BETA_BUILD ? (
        <Section title={t('Developer')} icon="code-braces">
          <Toggle
            label={t('Beta Updates')}
            hint={t('This test build takes new test builds too. Turn off to wait for releases, like everyone else.')}
            value={dev.betaUpdates}
            onChange={async (b) => {
              await st.updateSettings({ dev: { betaUpdates: b } });
              void runUpdateCheck().catch(() => {});
            }}
          />
        </Section>
      ) : null}

      <Sheet visible={timeSheet} onClose={() => setTimeSheet(false)} title={t('Reminder Time')} scroll={false}>
        <TimeWheel hour={timeDraft.hour} minute={timeDraft.minute} onChange={(hour, minute) => setTimeDraft({ hour, minute })} />
        <T v="small" soft center>
          {t('Your evening check-in comes at {time}, once a day at most.', {
            time: fmtClock(timeDraft.hour, timeDraft.minute),
          })}
        </T>
        <PillButton
          label={t('Set Reminder')}
          icon="bell-check"
          onPress={async () => {
            setTimeSheet(false);
            await st.updateSettings({
              notifications: {
                ...notif,
                hour: timeDraft.hour,
                minute: timeDraft.minute,
              },
            });
            void scheduleNotifications();
          }}
        />
      </Sheet>

      <Sheet visible={langSheet} onClose={() => setLangSheet(false)} title={t('Language')}>
        {[{ code: 'system' as const, name: t('Match phone') }, ...LANGS].map((l) => {
          const sel = st.settings.language === l.code;
          return (
            <Pressable
              key={l.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              onPress={() => {
                void st.updateSettings({ language: l.code });
                setLangSheet(false);
                void scheduleNotifications();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 52,
                paddingHorizontal: 16,
                borderRadius: 18,
                backgroundColor: sel ? c.leafPale : pressed ? c.canvasDeep : c.card,
                marginBottom: -8,
              })}
            >
              <T v="bodyBold" color={sel ? c.leafDeep : c.ink}>
                {l.name}
              </T>
              {sel ? <Icon name="check-circle" size={22} color={c.leafDeep} /> : null}
            </Pressable>
          );
        })}
        <T v="caption" soft style={{ marginTop: 8 }}>
          {t('The same languages as Pikmin Bloom.')}
        </T>
      </Sheet>
    </Screen>
  );
}
