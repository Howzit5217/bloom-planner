import type { DayKey } from '@/engine/dates';
import type { OutMode } from '@/engine/types';

/** What's been typed into a day's log but not saved yet. */
export interface DayDraft {
  steps: number | null;
  flowers: number | null;
  leveled: boolean;
  newLevel: number;
  minutes: number | null;
  mode: OutMode;
  syncSteps: number | null;
  syncFlowers: number | null;
  questLeft: number | null;
  note: string;
}

/**
 * Unsaved day logs, by day, for as long as the app is open: on the web a page out of sight lets go
 * of its contents (see Screen's useLive), and a half-typed log would go with it. Saving or cancelling
 * clears a day's draft.
 */
const drafts = new Map<DayKey, DayDraft>();

export const draftFor = (date: DayKey): DayDraft | null => drafts.get(date) ?? null;
export const keepDraft = (date: DayKey, d: DayDraft) => void drafts.set(date, d);
export const dropDraft = (date: DayKey) => void drafts.delete(date);
