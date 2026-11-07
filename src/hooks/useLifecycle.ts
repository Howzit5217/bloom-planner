import * as Network from 'expo-network';
import { followLocation } from '@/services/followLocation';
import { judgeNightSky } from '@/services/nightSky';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { msUntilMidnight, todayKey } from '@/engine/dates';
import { planNotifications, type PlannedNotification } from '@/engine/notifyPlan';
import { fmtTemp, usesF } from '@/engine/units';
import { planWeatherAlerts, type AlertForecast, type WeatherAlert } from '@/engine/weatherAlerts';
import { fetchAlertForecast, fetchClimate, fetchForecast } from '@/services/climateApi';
import { applySchedule, cancelAll } from '@/services/notifications';
import { clearDownloadedUpdates } from '@/services/installUpdate';
import { checkForAppUpdate, fetchLatestLevelData } from '@/services/updates';
import { useApp, useDashboard } from '@/store/app';
import { useForecast } from '@/store/forecast';
import { fmtClock } from '@/ui/TimeWheel';
import { setLang, t, tn } from '@/i18n';

const DAY = 24 * 3600 * 1000;
const UPDATE_EVERY = 3600 * 1000;
/** How often an open app asks whether an update check is due (it runs at most every UPDATE_EVERY). */
const POLL_EVERY = 5 * 60 * 1000;

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
        void followLocation(true);
      }
    });
    void housekeeping();
    void followLocation(true);
    // A downloaded update has done its job once the app starts again.
    clearDownloadedUpdates();
    // Left open on the screen, the app still looks for a new version every hour, so its popup
    // comes up then and not only the next time the app is opened.
    const poll = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void checkAppUpdateIfDue();
      // Following the phone: where it is now.
      void followLocation();
      // And the weather alerts from a fresh forecast once the last is an hour old.
      if (weatherAlertsDue()) void scheduleNotifications();
    }, POLL_EVERY);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-plan notifications whenever the numbers change.
  const key = dash ? `${dash.today}|${dash.replay.days.length}|${dash.current.level}|${dash.standing.displayDays}|${dash.nextMilestone?.date ?? ''}|${dash.loggedToday}` : '';
  const notif = useApp((s) => s.settings.notifications);
  const weather = useApp((s) => s.settings.weatherAlerts);
  const where = useApp((s) => (s.location ? `${s.location.latitude}|${s.location.longitude}` : ''));
  const tempUnit = useApp((s) => s.settings.temp);
  // How dark the night sky is there, once for each place.
  useEffect(() => {
    if (where) void judgeNightSky();
  }, [where]);
  useEffect(() => {
    if (!dash) return;
    const t = setTimeout(() => void scheduleNotifications(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, notif.enabled, notif.hour, notif.minute, notif.nudges, notif.behind, notif.milestones, weather.enabled, weather.forecast, weather.hour, weather.minute, weather.uv, weather.rain, weather.severe, where, tempUnit]);
}

let forecastCache: { at: number; days: Awaited<ReturnType<typeof fetchForecast>> } | null = null;
/** The alerts' forecast, an hour at most: rain an hour off needs a fresh look. */
let alertCache: { at: number; key: string; forecast: AlertForecast } | null = null;
const ALERT_FRESH = 3600 * 1000;

/** The weather alerts are on and their forecast is an hour old (or not fetched yet). */
const weatherAlertsDue = () => {
  const st = useApp.getState();
  return st.settings.weatherAlerts.enabled && !!st.location && (!alertCache || Date.now() - alertCache.at >= ALERT_FRESH);
};

/** The weather alerts for today and tomorrow, from a fresh forecast (none without a play location). */
async function weatherAlertPlan(): Promise<WeatherAlert[]> {
  const st = useApp.getState();
  const prefs = st.settings.weatherAlerts;
  const loc = st.location;
  if (!prefs.enabled || !loc) return [];
  const key = `${loc.latitude}|${loc.longitude}`;
  let forecast = alertCache && alertCache.key === key && Date.now() - alertCache.at < ALERT_FRESH ? alertCache.forecast : null;
  if (!forecast) {
    try {
      forecast = await fetchAlertForecast(loc.latitude, loc.longitude, loc.timezone);
      alertCache = { at: Date.now(), key, forecast };
    } catch {
      // Offline: the last forecast, if it's from today at all.
      forecast = alertCache && alertCache.key === key && Date.now() - alertCache.at < 12 * 3600 * 1000 ? alertCache.forecast : null;
    }
  }
  if (!forecast) return [];
  const f = usesF(st.settings.temp);
  return planWeatherAlerts({
    prefs,
    forecast,
    limits: st.settings.limits,
    today: todayKey(),
    now: new Date(),
    text: { t, temp: (c) => fmtTemp(c, f), clock: fmtClock },
  });
}

// One plan at a time: asked for again while one is being made (a switch, its setting, the app
// coming back, all at once), it's made once more after. Side by side, each cleared the other's
// half-made schedule and the same alert came out two or three times.
let planning: Promise<void> | null = null;
let planAgain = false;

/** Make the notification plan afresh and schedule it (the check-in and its nudges, and the weather alerts). */
export function scheduleNotifications(): Promise<void> {
  if (planning) {
    planAgain = true;
    return planning;
  }
  planning = (async () => {
    do {
      planAgain = false;
      await scheduleOnce();
    } while (planAgain);
  })().finally(() => {
    planning = null;
  });
  return planning;
}

async function scheduleOnce() {
  const st = useApp.getState();
  const prefs = st.settings.notifications;
  setLang(st.settings.language);
  const weather = st.profile ? await weatherAlertPlan().catch(() => []) : [];
  if (!prefs.enabled || !st.profile) {
    // The weather alerts can be on without the check-in.
    if (weather.length) await applySchedule(weather).catch(() => {});
    else await cancelAll().catch(() => {});
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
  const plan: PlannedNotification[] = planNotifications({ prefs, dash, seasonRates: st.seasonRates.map((r) => r.rideable), forecast, preset: st.settings.preset, limits: st.settings.limits, now: new Date(), text: { t, tn } });
  await applySchedule([...plan, ...weather]).catch(() => {});
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

/**
 * At most hourly (on opening the app, coming back to it, or while it stays open): a new app
 * release (which pops up on Android) and newer level data on GitHub.
 */
async function checkAppUpdateIfDue() {
  const st = useApp.getState();
  if (!st.profile) return;
  const u = st.settings.updates;
  if (u.enabled && (!u.lastCheck || Date.now() - new Date(u.lastCheck).getTime() > UPDATE_EVERY)) {
    await runUpdateCheck();
  }
}

async function housekeeping() {
  const st = useApp.getState();
  if (!st.profile) return;
  await checkAppUpdateIfDue();
  // The weather alerts, from a forecast at most an hour old.
  if (weatherAlertsDue()) void scheduleNotifications();
  // The next 16 days' weather for the plan (every few hours).
  const loc = st.location;
  void useForecast.getState().refresh(loc);
  // Once a year, quietly on wifi: refresh the climate baseline. An older history (without the
  // feels-like highs the heat limits need) is fetched again once, on any connection.
  const old = !!st.climate && st.climate.v !== 3;
  if (loc && (old || Date.now() - new Date(loc.resolvedAt).getTime() > 365 * DAY)) {
    try {
      const net = await Network.getNetworkStateAsync();
      if ((old || net.type === Network.NetworkStateType.WIFI) && net.isConnected !== false && net.isInternetReachable !== false) {
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
