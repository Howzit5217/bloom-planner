import type { DayEntry } from './types';

const HEADER = ['date', 'steps', 'flowers', 'leveled_up', 'new_level', 'minutes_out', 'out_mode', 'game_steps_to_go', 'game_flowers_to_go', 'game_quest_to_go', 'note'];

function cell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function entriesToCsv(entries: DayEntry[]): string {
  const rows = [...entries]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) =>
      [e.date, e.steps, e.flowers, e.leveledUp ? 1 : 0, e.newLevel, e.minutesOut, e.outMode, e.gameStepsToGo, e.gameFlowersToGo, e.gameTaskToGo ?? null, e.note].map(cell).join(','),
    );
  return [HEADER.join(','), ...rows].join('\n') + '\n';
}
