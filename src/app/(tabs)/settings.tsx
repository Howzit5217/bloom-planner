import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { PRESET_LABELS } from '@/engine/climate';
import { entriesToCsv } from '@/engine/csv';
import { addDaysKey, fromKey, toKey } from '@/engine/dates';
import { fmt, fmtDate } from '@/engine/format';
import { DEFAULT_RATES, RATE_KEYS, type RateKey } from '@/engine/rates';
import type { ThresholdPreset } from '@/engine/types';
import { runUpdateCheck, scheduleNotifications } from '@/hooks/useLifecycle';
import { requestPermission } from '@/services/notifications';
import { APP_VERSION, REPO_URL } from '@/services/updates';
import { useApp, useDashboard, type ThemePref } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { Banner } from '@/ui/Banner';
import { Card } from '@/ui/Card';
import { DateField } from '@/ui/DateField';
import { Icon, type IconName } from '@/ui/Icon';
import { NumberField } from '@/ui/NumberField';
import { PillButton } from '@/ui/PillButton';
import { Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';
import { T } from '@/ui/T';
import { Toggle } from '@/ui/Toggle';

const RATE_LABELS: Record<RateKey, string> = {
  walkStepsPerHour: 'Steps per hour walking',
  bikeFlowersPerHour: 'Flowers per hour biking',
  bikeStepsPerHour: 'Steps per hour biking',
  walkFlowersPerHour: 'Flowers per hour walking',
};

function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={22} color={c.leafDeep} />
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
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, opacity: pressed ? 0.6 : 1 })}>
      <T v="bodyBold" color={c.leafDeep}>
        {label}
      </T>
      <Icon name={icon} size={22} color={c.leafDeep} />
    </Pressable>
  );
}

export default function Settings() {
  const { c } = useTheme();
  const dash = useDashboard();
  const st = useApp();
  const profile = st.profile;
  const [confirmReset, setConfirmReset] = useState(false);
  const [timeSheet, setTimeSheet] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  if (!profile || !dash) return null;

  const minGoal = dash.current.level + 1;
  const notif = st.settings.notifications;
  const reminderDate = new Date();
  reminderDate.setHours(notif.hour, notif.minute, 0, 0);
  const overrides = Object.values(st.overrides).sort((a, b) => a.level - b.level);
  const obs = dash.observed;

  const setRate = (k: RateKey, v: number | null) => st.setRates({ ...profile.rates, [k]: v });
  const pickTime = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: reminderDate,
        mode: 'time',
        onValueChange: (_e, d) => void st.updateSettings({ notifications: { ...notif, hour: d.getHours(), minute: d.getMinutes() } }),
      });
    } else setTimeSheet(true);
  };
  const exportCsv = async () => {
    const file = new File(Paths.cache, `bloom-planner-log-${dash.today}.csv`);
    if (file.exists) file.delete();
    file.create();
    file.write(entriesToCsv(st.entries));
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export your log', UTI: 'public.comma-separated-values-text' });
  };

  return (
    <Screen>
      <T v="h1" accessibilityRole="header">
        Settings
      </T>

      <Section title="Goal" icon="flag-checkered">
        <Stepper label="Target level" value={Math.max(minGoal, profile.goalLevel)} min={Math.min(minGoal, st.table.maxLevel)} max={st.table.maxLevel} onChange={(v) => void st.updateProfile({ goalLevel: v })} size={60} />
        <DateField label="Target date" value={profile.goalDate} onChange={(k) => void st.updateProfile({ goalDate: k })} minimumDate={fromKey(addDaysKey(dash.today, 1))} />
        {profile.goalLevel <= dash.current.level ? <Banner icon="trophy" tone="nectar" text="You've reached this goal. Raise the level to plan the next stretch." /> : null}
      </Section>

      <Section title="Your pace" icon="speedometer">
        {obs.loggedDays > 0 ? (
          <T v="small" soft>
            From {plural(obs.loggedDays, 'logged day')}: you average {fmt(obs.medianSteps)} steps and {fmt(obs.medianFlowers)} flowers a day.
          </T>
        ) : null}
        {RATE_KEYS.map((k) => {
          const v = profile.rates[k];
          const suggestion = k === 'bikeFlowersPerHour' ? obs.bikeFlowersPerHour : k === 'walkFlowersPerHour' ? obs.walkFlowersPerHour : null;
          return (
            <View key={k} style={{ gap: 6 }}>
              <NumberField label={RATE_LABELS[k]} value={v} onChange={(n) => void setRate(k, n)} placeholder={fmt(DEFAULT_RATES[k])} size="md" hint={v == null ? `Using a typical ${fmt(DEFAULT_RATES[k])} until you set it.` : undefined} />
              {suggestion && obs.ready && suggestion !== v ? (
                <Pressable accessibilityRole="button" onPress={() => void setRate(k, suggestion)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}>
                  <Icon name="lightbulb-on-outline" size={18} color={c.nectar} />
                  <T v="smallBold" color={c.leafDeep}>
                    Your log says about {fmt(suggestion)}/h. Use that
                  </T>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        <Toggle label="I can get steps indoors" hint="Treadmill, walking at work. Splits steps into outdoor and indoor time." value={profile.rates.treadmillAvailable} onChange={(b) => void st.setRates({ ...profile.rates, treadmillAvailable: b })} />
      </Section>

      <Section title="Where you play" icon="map-marker-radius">
        <T v="bodyBold">{st.location ? st.location.label || `${st.location.latitude.toFixed(2)}, ${st.location.longitude.toFixed(2)}` : 'Not set'}</T>
        <T v="caption" soft>
          {st.location ? `Weather history from ${st.location.climateYears} years, looked up ${fmtDate(toKey(new Date(st.location.resolvedAt)))}. ` : ''}
          {st.seasonRates.some((r) => r.source === 'manual') ? 'Months set by hand.' : st.seasonRates.every((r) => r.source === 'default') ? 'Every day counts as rideable.' : 'Months from the climate record.'}
        </T>
        <LinkRow label={st.location ? 'Change place' : 'Find my place'} onPress={() => router.push('/location')} />
        {st.location && st.climate ? <LinkRow label="Climate details" onPress={() => router.push('/climate')} /> : null}
        <LinkRow label="Edit months by hand" onPress={() => router.push('/seasons')} />
        <View style={{ gap: 6 }}>
          <T v="smallBold">How tough are you?</T>
          <Segmented<ThresholdPreset>
            label="Weather threshold"
            value={st.settings.preset}
            onChange={(p) => void st.setPreset(p)}
            options={(['fair', 'normal', 'all'] as const).map((k) => ({ key: k, label: PRESET_LABELS[k] }))}
          />
          <T v="caption" soft>
            {st.settings.preset === 'fair'
              ? 'No rain at all, at least 5°C and 11 hours of daylight.'
              : st.settings.preset === 'all'
                ? 'Up to 15mm of rain, 3cm of snow, down to -5°C, 8 hours of daylight.'
                : 'Up to 5mm of rain, 1cm of snow, at least 2°C and 9.5 hours of daylight.'}
            {st.seasonRates.some((r) => r.source === 'manual') ? ' Your hand-set months stay as they are.' : ''}
          </T>
        </View>
        <T v="caption" soft>
          Only coordinates go to Open-Meteo, for weather. No analytics, no other third party.
        </T>
      </Section>

      <Section title="Your corrections" icon="pencil-circle">
        {overrides.length === 0 ? (
          <T v="small" soft>
            None yet. Tap any level in Levels to correct it with what your game shows.
          </T>
        ) : (
          overrides.map((o) => {
            const row = st.table.byLevel[o.level];
            return (
              <View key={o.level} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyBold">Level {o.level}</T>
                  <T v="caption" soft>
                    {fmt(o.steps ?? row.steps)} steps · {fmt(o.flowers ?? row.flowers)} flowers (bundled {fmt(row.steps)} / {fmt(row.flowers)})
                  </T>
                </View>
                <PillButton label="Remove" size="sm" variant="ghost" onPress={() => void st.removeOverride(o.level)} />
              </View>
            );
          })
        )}
      </Section>

      <Section title="Reminders" icon="bell-outline">
        <Toggle
          label="Evening check-in"
          hint="One friendly reminder a day at most."
          value={notif.enabled}
          onChange={async (on) => {
            const ok = on ? await requestPermission() : true;
            await st.updateSettings({ notifications: { ...notif, enabled: on && ok, askedAt: notif.askedAt ?? new Date().toISOString() } });
            void scheduleNotifications();
          }}
        />
        {notif.enabled ? (
          <>
            <LinkRow label={`Remind me at ${reminderDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`} onPress={pickTime} icon="clock-edit-outline" />
            <Toggle label="Good-day-to-ride nudges" hint="When a bright, dry day follows a day without flowers. Twice a week at most." value={notif.nudges} onChange={(b) => void st.updateSettings({ notifications: { ...notif, nudges: b } })} />
            <Toggle label="Behind-pace heads-up" hint="Only past 5 days behind, once a week at most." value={notif.behind} onChange={(b) => void st.updateSettings({ notifications: { ...notif, behind: b } })} />
            <Toggle label="Level-up coming" hint="When a level is about 2 days away." value={notif.milestones} onChange={(b) => void st.updateSettings({ notifications: { ...notif, milestones: b } })} />
          </>
        ) : null}
      </Section>

      <Section title="Appearance" icon="theme-light-dark">
        <Segmented<ThemePref>
          label="Theme"
          value={st.settings.theme}
          onChange={(t) => void st.updateSettings({ theme: t })}
          options={[
            { key: 'system', label: 'Match phone' },
            { key: 'light', label: 'Day' },
            { key: 'dark', label: 'Night' },
          ]}
        />
      </Section>

      <Section title="Your data" icon="database-outline">
        <PillButton label="Export log as CSV" variant="secondary" icon="file-delimited-outline" size="md" onPress={() => void exportCsv()} disabled={st.entries.length === 0} />
        {!confirmReset ? (
          <PillButton label="Reset everything" variant="ghost" icon="delete-outline" size="md" onPress={() => setConfirmReset(true)} />
        ) : (
          <Card variant="deep" style={{ gap: 10 }}>
            <T v="bodyBold">Delete your log, goal, corrections and settings?</T>
            <T v="small" soft>
              This can't be undone. Export your log first if you want to keep it.
            </T>
            <PillButton label="Yes, delete everything" variant="danger" size="md" onPress={() => void st.resetEverything()} />
            <PillButton label="Keep my data" variant="ghost" size="md" onPress={() => setConfirmReset(false)} />
          </Card>
        )}
      </Section>

      <Section title="Updates" icon="update">
        <Toggle label="Check GitHub for updates" hint="Once a day: new app versions and corrected level data. Nothing about you is sent." value={st.settings.updates.enabled} onChange={(b) => void st.updateSettings({ updates: { ...st.settings.updates, enabled: b } })} />
        <T v="small" soft>
          Version {APP_VERSION} · level data v{st.table.version} (checked {st.table.retrieved})
          {st.settings.updates.lastCheck ? ` · last check ${fmtDate(toKey(new Date(st.settings.updates.lastCheck)))}` : ''}
        </T>
        <PillButton
          label={checking ?? 'Check now'}
          size="md"
          variant="secondary"
          icon="refresh"
          onPress={async () => {
            setChecking('Checking…');
            const r = await runUpdateCheck().catch(() => ({ app: false, levels: false }));
            setChecking(r.app ? 'An update is ready (see Home)' : r.levels ? 'Level data updated' : "You're up to date");
            setTimeout(() => setChecking(null), 2500);
          }}
        />
        <LinkRow label="Project page on GitHub" onPress={() => void WebBrowser.openBrowserAsync(REPO_URL)} icon="open-in-new" />
      </Section>

      <Section title="About" icon="information-outline">
        <T v="small">Level data: Pikmin wiki (Pikipedia), "Level" page, retrieved {st.table.retrieved}. Only the factual requirement numbers are used; a few levels are estimates or player-verified (see Levels).</T>
        <LinkRow label="pikminwiki.com/Level" onPress={() => void WebBrowser.openBrowserAsync('https://www.pikminwiki.com/Level')} icon="open-in-new" />
        <T v="small">Weather history and place search: Open-Meteo, free for non-commercial use under CC BY 4.0.</T>
        <LinkRow label="open-meteo.com" onPress={() => void WebBrowser.openBrowserAsync('https://open-meteo.com')} icon="open-in-new" />
        <T v="caption" soft>
          Bloom Planner is an unofficial fan-made planner. It is not affiliated with or endorsed by Scopely or Nintendo. Pikmin Bloom is a trademark of its owners.
        </T>
      </Section>

      {Platform.OS === 'ios' ? (
        <Sheet visible={timeSheet} onClose={() => setTimeSheet(false)} title="Reminder time">
          <DateTimePicker
            value={reminderDate}
            mode="time"
            display="spinner"
            onValueChange={(_, d) => void st.updateSettings({ notifications: { ...notif, hour: d.getHours(), minute: d.getMinutes() } })}
          />
          <PillButton label="Done" onPress={() => setTimeSheet(false)} />
        </Sheet>
      ) : null}
    </Screen>
  );
}

const plural = (n: number, w: string) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;
