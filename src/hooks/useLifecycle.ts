import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { msUntilMidnight, todayKey } from '@/engine/dates';
import { planNotifications } from '@/engine/notifyPlan';
import { fetchClimate, fetchForecast } from '@/services/climateApi';
import { applySchedule, cancelAll } from '@/services/notifications';
import { checkForAppUpdate, fetchLatestLevelData } from '@/services/updates';
import { useApp, useDashboard } from '@/store/app';
import { setLang, t, tn } from '@/i18n';

const DAY = 24 * 3600 * 1000;

/** Background housekeeping: day rollover, update checks, the yearly climate refresh, and notifications. */
export function useLifecycle() {
  const refreshToday = useApp((s) => s.refreshToday);
  const dash = useDashboard();

  // Foreground + local midnight.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        refreshToday();
        arm();
      }, msUntilMidnight());
    };
    arm();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        refreshToday();
        clearTimeout(timer);
        arm();
        void housekeeping();
      }
    });
    void housekeeping();
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-plan notifications whenever the numbers change.
  const key = dash ? `${dash.today}|${dash.replay.days.length}|${dash.current.level}|${dash.standing.displayDays}|${dash.nextMilestone?.date ?? ''}|${dash.loggedToday}` : '';
  const notif = useApp((s) => s.settings.notifications);
  useEffect(() => {
    if (!dash) return;
    const t = setTimeout(() => void scheduleNotifications(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, notif.enabled, notif.hour, notif.minute, notif.nudges, notif.behind, notif.milestones]);
}

let forecastCache: { at: number; days: Awaited<ReturnType<typeof fetchForecast>> } | null = null;

export async function scheduleNotifications() {
  const st = useApp.getState();
  const prefs = st.settings.notifications;
  if (!prefs.enabled || !st.profile) {
    await cancelAll().catch(() => {});
    return;
  }
  const { computeDashboard } = await import('@/engine/summary');
  const dash = computeDashboard({ table: st.table, overrides: st.overrides, profile: st.profile, entries: st.entries, seasonRates: st.seasonRates.map((r) => r.rideable), today: todayKey() });
  let forecast = forecastCache && Date.now() - forecastCache.at < 3 * 3600 * 1000 ? forecastCache.days : [];
  if (!forecast.length && st.location && prefs.nudges) {
    try {
      forecast = await fetchForecast(st.location.latitude, st.location.longitude, st.location.timezone);
      forecastCache = { at: Date.now(), days: forecast };
    } catch {
      forecast = [];
    }
  }
  setLang(st.settings.language);
  const plan = planNotifications({ prefs, dash, seasonRates: st.seasonRates.map((r) => r.rideable), forecast, preset: st.settings.preset, now: new Date(), text: { t, tn } });
  await applySchedule(plan).catch(() => {});
  // Record caps (behind once a week, nudges twice a week, milestone once per level).
  const behind = plan.find((p) => p.kind === 'behind');
  const nudge = plan.find((p) => p.kind === 'nudge');
  const milestone = plan.find((p) => p.kind === 'milestone');
  if (behind || nudge || milestone) {
    await st.updateSettings({
      notifications: {
        ...prefs,
        lastBehindAlert: behind ? behind.date : prefs.lastBehindAlert,
        nudgeDates: nudge ? [...prefs.nudgeDates.filter((d) => d !== nudge.date), nudge.date].slice(-6) : prefs.nudgeDates,
        lastMilestoneLevel: milestone?.level ?? prefs.lastMilestoneLevel,
      },
    });
  }
}

async function housekeeping() {
  const st = useApp.getState();
  if (!st.profile) return;
  // Once a day: new app release and newer level data on GitHub.
  const u = st.settings.updates;
  if (u.enabled && (!u.lastCheck || Date.now() - new Date(u.lastCheck).getTime() > DAY)) {
    await runUpdateCheck();
  }
  // Once a year, quietly on wifi: refresh the climate baseline.
  const loc = st.location;
  if (loc && Date.now() - new Date(loc.resolvedAt).getTime() > 365 * DAY) {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.type === Network.NetworkStateType.WIFI && net.isInternetReachable !== false) {
        const climate = await fetchClimate(loc.latitude, loc.longitude, loc.timezone);
        const manual = st.seasonRates.some((r) => r.source === 'manual');
        await useApp.getState().setLocationAndClimate({ ...loc, resolvedAt: new Date().toISOString(), climateYears: climate.years }, climate);
        if (manual) await useApp.getState().setSeasonRates(st.seasonRates);
      }
    } catch {
      // Try again next time.
    }
  }
}

export async function runUpdateCheck(): Promise<{ app: boolean; levels: boolean }> {
  const st = useApp.getState();
  const [latest, levels] = await Promise.all([checkForAppUpdate(st.settings.dev.betaUpdates).catch(() => null), fetchLatestLevelData().catch(() => null)]);
  const gotLevels = levels ? await useApp.getState().setRemoteTable(levels) : false;
  await useApp.getState().updateSettings({ updates: { ...st.settings.updates, lastCheck: new Date().toISOString(), latest } });
  return { app: !!latest, levels: gotLevels };
}
