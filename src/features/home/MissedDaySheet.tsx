import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { addDaysKey } from '@/engine/dates';
import type { Dashboard } from '@/engine/summary';
import { DayLog } from '@/features/home/TodayCard';
import { useApp } from '@/store/app';
import { PillButton } from '@/ui/PillButton';
import { Sheet } from '@/ui/Sheet';
import { T } from '@/ui/T';
import { useT } from '@/i18n';

/** Days a put-away sheet is remembered for: long enough that it never asks about one of them again. */
const KEEP_DAYS = 14;

/**
 * Coming back after a day with nothing logged: a sheet asking for yesterday, from a screenshot or the
 * numbers, so the plan stays right. Put away (Not Now, or pulled down) it doesn't ask about that day
 * again; the card's Fill In a Missed Day still can.
 */
export function MissedDaySheet({ dash }: { dash: Dashboard }) {
  const { t } = useT();
  const focused = useIsFocused();
  const profile = useApp((s) => s.profile);
  const entries = useApp((s) => s.entries);
  const dismissed = useApp((s) => s.settings.dismissed);
  const updateSettings = useApp((s) => s.updateSettings);
  const yesterday = addDaysKey(dash.today, -1);
  const missed = profile && dash.phase === 'active' && yesterday >= profile.startDate && !entries.some((e) => e.date === yesterday) ? yesterday : null;
  const key = `missed-${yesterday}`;
  // The day stays in the sheet while it slides away, once it's logged.
  const [day, setDay] = useState(missed);
  if (missed && missed !== day) setDay(missed);
  const [putAway, setPutAway] = useState<string | null>(null);
  const open = !!missed && focused && !dismissed[key] && putAway !== missed;

  const close = () => {
    if (!missed) return;
    setPutAway(missed);
    // Only the last fortnight's are kept.
    const oldest = addDaysKey(dash.today, -KEEP_DAYS);
    const kept = Object.fromEntries(Object.entries(dismissed).filter(([k]) => !k.startsWith('missed-') || k.slice(7) >= oldest));
    void updateSettings({ dismissed: { ...kept, [key]: true } });
  };

  return (
    <Sheet visible={open} onClose={close} title={t('Log Yesterday to Stay on Track')}>
      <T v="body" soft>
        {t("Yesterday isn't logged yet. Read a screenshot of your Pikmin Bloom profile, or put the numbers in, and the plan stays right.")}
      </T>
      {day ? <DayLog dash={dash} date={day} /> : null}
      <PillButton label={t('Not now')} variant="ghost" size="sm" onPress={close} />
    </Sheet>
  );
}
