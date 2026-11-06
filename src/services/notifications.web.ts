import { fromKey } from '@/engine/dates';
import type { Schedulable } from '@/engine/notifyPlan';

/**
 * The web app's notifications, through the browser. A web page can't wake itself up, so they come
 * while Bloom Planner is open, in a tab or in the background (the plan is made again on opening and
 * hourly, so they keep up). They show through the app's service worker (public/sw.js): Android's
 * browsers and iPhone home-screen web apps show notifications no other way.
 */
const BASE = process.env.EXPO_BASE_URL ?? '';
const DAY = 24 * 3600 * 1000;
/** A notification this late (the computer asleep, the tab frozen) is old news: it's left out. */
const TOO_LATE = 30 * 60 * 1000;
const SHOWN_KEY = 'bloom-planner-notified';

let registration: ServiceWorkerRegistration | null = null;
const timers: Array<ReturnType<typeof setTimeout>> = [];

/** Whether this browser can show notifications at all (not Safari outside a home-screen web app). */
export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export function configureNotifications() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register(`${BASE}/sw.js`, { scope: `${BASE}/` })
    .then((r) => {
      registration = r;
    })
    .catch(() => {});
}

export async function hasPermission(): Promise<boolean> {
  return notificationsSupported() && Notification.permission === 'granted';
}

export async function requestPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission !== 'default') return Notification.permission === 'granted';
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Each one shows once, even with the app open in two tabs or reloaded in between. */
function firstTime(id: string): boolean {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]');
    if (seen.includes(id)) return false;
    localStorage.setItem(SHOWN_KEY, JSON.stringify([...seen, id].slice(-60)));
  } catch {
    // No storage (a private window): show it anyway.
  }
  return true;
}

async function show(n: Schedulable, at: number) {
  if (Date.now() - at > TOO_LATE || !(await hasPermission())) return;
  const id = `${n.date}|${n.hour}:${n.minute}|${n.kind}`;
  if (!firstTime(id)) return;
  const options = { body: n.body, icon: `${BASE}/logo192.png`, tag: id };
  try {
    const reg = registration ?? (await navigator.serviceWorker?.getRegistration(`${BASE}/`)) ?? null;
    if (reg) {
      await reg.showNotification(n.title, options);
      return;
    }
    new Notification(n.title, options);
  } catch {
    // The browser said no after all.
  }
}

/** Replace everything waiting with the given plan: what falls in the next day. */
export async function applySchedule(plan: Schedulable[]): Promise<void> {
  await cancelAll();
  if (!plan.length || !(await hasPermission())) return;
  const now = Date.now();
  for (const n of plan) {
    const d = fromKey(n.date);
    d.setHours(n.hour, n.minute, 0, 0);
    const at = d.getTime();
    const wait = at - now;
    if (wait <= 0 || wait > DAY) continue;
    timers.push(setTimeout(() => void show(n, at), wait));
  }
}

export async function cancelAll(): Promise<void> {
  for (const t of timers) clearTimeout(t);
  timers.length = 0;
}
