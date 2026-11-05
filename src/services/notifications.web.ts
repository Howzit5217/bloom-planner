import type { PlannedNotification } from '@/engine/notifyPlan';

/**
 * The web version has no scheduled reminders (a web page can't wake itself up at 8pm), so these
 * keep notifications.ts's shape and do nothing. Settings hides the reminders on the web.
 */
export function configureNotifications() {}

export async function hasPermission(): Promise<boolean> {
  return false;
}

export async function requestPermission(): Promise<boolean> {
  return false;
}

export async function applySchedule(_plan: PlannedNotification[]): Promise<void> {}

export async function cancelAll(): Promise<void> {}
