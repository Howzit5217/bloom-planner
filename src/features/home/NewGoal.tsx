import { useState } from 'react';
import { View } from 'react-native';
import { addDaysKey, fromKey, type DayKey } from '@/engine/dates';
import { checkDifficulty } from '@/engine/difficulty';
import { fmt, fmtDate, roundNice } from '@/engine/format';
import { checkGoal } from '@/engine/goalCheck';
import type { Dashboard } from '@/engine/summary';
import { DifficultyPill, keptExtremeKey } from '@/features/shared/Difficulty';
import { EasyVerdict, GoalVerdict, useEarliestDate, useMoreChallenge } from '@/features/shared/GoalVerdict';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { Card } from '@/ui/Card';
import { DateField } from '@/ui/DateField';
import { IconChip } from '@/ui/IconChip';
import { NumberField } from '@/ui/NumberField';
import { PillButton } from '@/ui/PillButton';
import { Ring } from '@/ui/skia/Ring';
import { Stepper } from '@/ui/Stepper';
import { T } from '@/ui/T';
import { useT } from '@/i18n';

const customActive = (dash: Dashboard) => !!dash.custom && !dash.custom.reached && !dash.custom.passed;
/** Whether Home shows the new-goal card, or the custom goal's progress. */
export const showsNewGoal = (dash: Dashboard) => (dash.phase === 'maxed' ? !customActive(dash) : dash.phase === 'goalReached' || dash.phase === 'datePassed');
export const showsCustomGoal = (dash: Dashboard) => dash.phase === 'maxed' && customActive(dash);

/**
 * Asks for the next goal once one is done (or its date has gone by). Below the top level that's a
 * level and a date; at the top level it's the user's own steps and flowers by a date.
 */
export function NewGoalCard({ dash }: { dash: Dashboard }) {
  const { t } = useT();
  if (dash.phase === 'maxed') {
    if (dash.custom && !dash.custom.reached && !dash.custom.passed) return null;
    return (
      <Card style={{ gap: 14 }}>
        <Heading text={t('What Do You Want Your New Goal to Be?')} />
        <T v="small" soft>
          {dash.custom?.reached ? t('Goal reached. Pick the next one: steps, flowers and the time to do them in.') : t('Level {level} is the top, so the goal is your own: steps, flowers and the time to do them in.', { level: dash.current.level })}
        </T>
        <CustomGoalForm dash={dash} />
      </Card>
    );
  }
  if (dash.phase !== 'goalReached' && dash.phase !== 'datePassed') return null;
  return (
    <Card style={{ gap: 14 }}>
      <Heading text={t('What Do You Want Your New Goal to Be?')} />
      <LevelGoalForm dash={dash} />
    </Card>
  );
}

function Heading({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <IconChip name="flag-checkered" size="lg" />
      <T v="h3" accessibilityRole="header" style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

/** A level and a date, checked like at setup: an unreasonable pace offers the earliest date that works. */
function LevelGoalForm({ dash }: { dash: Dashboard }) {
  const { t } = useT();
  const maxLevel = useApp((s) => s.table.maxLevel);
  const seasonRates = useApp((s) => s.seasonRates);
  const updateProfile = useApp((s) => s.updateProfile);
  const updateSettings = useApp((s) => s.updateSettings);
  const dismissed = useApp((s) => s.settings.dismissed);
  const [level, setLevel] = useState(Math.min(maxLevel, dash.current.level + 1));
  const [date, setDate] = useState<DayKey>(addDaysKey(dash.today, 30));
  const base = {
    start: dash.plan.start,
    startKey: dash.plan.startKey,
    seasonRates: seasonRates.map((r) => r.rideable),
    req: dash.req,
    bikeFlowersPerHour: dash.rates.bikeFlowersPerHour,
    bikes: dash.rates.bikes,
    walkFlowersPerHour: dash.rates.walkFlowersPerHour,
  };
  const check = checkGoal({ ...base, goalLevel: level, goalKey: date });
  const earliest = useEarliestDate(check.ok ? null : { ...base, goalLevel: level });
  // EXTREME past what's realistic; a too-easy one offers a bigger challenge first.
  const difficulty = checkDifficulty(check, dash.rates);
  const easy = check.ok && difficulty?.level === 'easy';
  const more = useMoreChallenge(easy ? { ...base, goalLevel: level, goalKey: date } : null, dash.rates, maxLevel);
  const save = (extreme: boolean) => {
    if (extreme) void updateSettings({ dismissed: { ...dismissed, [keptExtremeKey(level, date)]: true } });
    void updateProfile({ goalLevel: level, goalDate: date });
  };
  return (
    <>
      <Stepper label={t('Target level')} value={level} min={Math.min(maxLevel, dash.current.level + 1)} max={maxLevel} onChange={setLevel} size={56} />
      <DateField label={t('Target date')} value={date} onChange={setDate} minimumDate={fromKey(addDaysKey(dash.today, 1))} />
      {difficulty ? <DifficultyPill d={difficulty} wide /> : null}
      {check.ok ? null : <GoalVerdict check={check} earliest={earliest} onUseDate={setDate} onKeep={() => save(true)} difficulty={difficulty} />}
      {easy && difficulty ? <EasyVerdict difficulty={difficulty} more={more} onUseDate={setDate} onUseLevel={setLevel} onKeep={() => save(false)} /> : null}
      <PillButton label={t('Set this goal')} icon="flag-checkered" disabled={!check.ok || easy} onPress={() => save(false)} />
    </>
  );
}

/** At the top level: so many steps and flowers by a date, all the user's choice. */
export function CustomGoalForm({ dash, onSaved }: { dash: Dashboard; onSaved?: () => void }) {
  const { t } = useT();
  const updateProfile = useApp((s) => s.updateProfile);
  const current = useApp((s) => s.profile?.customGoal ?? null);
  const active = !!dash.custom && !dash.custom.reached && !dash.custom.passed;
  const [steps, setSteps] = useState<number | null>(active && current ? current.steps : null);
  const [flowers, setFlowers] = useState<number | null>(active && current ? current.flowers : null);
  const [date, setDate] = useState<DayKey>(active && current ? current.endDate : addDaysKey(dash.today, 60));
  const days = Math.max(1, Math.round((fromKey(date).getTime() - fromKey(dash.today).getTime()) / 86_400_000) + 1);
  const ready = steps != null && flowers != null && steps + flowers > 0;
  return (
    <>
      <NumberField label={t('Steps')} value={steps} onChange={setSteps} size="lg" />
      <NumberField label={t('Flowers')} value={flowers} onChange={setFlowers} size="lg" />
      <DateField label={t('Target date')} value={date} onChange={setDate} minimumDate={fromKey(addDaysKey(dash.today, 1))} />
      {ready ? (
        <T v="small" soft center>
          {t('About {steps} steps and {flowers} flowers a day.', { steps: fmt(roundNice(steps / days)), flowers: fmt(roundNice(flowers / days)) })}
        </T>
      ) : null}
      <PillButton
        label={t('Set this goal')}
        icon="flag-checkered"
        disabled={!ready}
        onPress={() => {
          if (!ready) return;
          // A changed goal keeps its start; a new one starts today.
          void updateProfile({ customGoal: { steps, flowers, startDate: active && current ? current.startDate : dash.today, endDate: date } });
          onSaved?.();
        }}
      />
    </>
  );
}

/** Progress toward the custom goal: two rings and whether the pace holds. */
export function CustomGoalCard({ dash }: { dash: Dashboard }) {
  const { c } = useTheme();
  const { t, tn } = useT();
  const goal = useApp((s) => s.profile?.customGoal ?? null);
  const cg = dash.custom;
  if (!cg || !goal || cg.reached || cg.passed) return null;
  const verdict = cg.aheadDays > 0 ? tn(cg.aheadDays, "You're {n} day ahead. Blooming lovely.", "You're {n} days ahead. Blooming lovely.") : cg.aheadDays < 0 ? tn(-cg.aheadDays, "You're {n} day behind.", "You're {n} days behind.") : t('Right on track.');
  const one = (d: typeof cg.steps, colors: [string, string], label: string, icon: 'shoe-print' | 'flower') => (
    <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <Ring fraction={d.fraction} size={132} thickness={15} colors={colors} accessibilityLabel={t('{what}: {pct} percent, {n} to go', { what: label, pct: Math.floor(d.fraction * 100), n: fmt(d.remaining) })}>
        <T v="h2" color={c.leafDeep}>
          {Math.floor(d.fraction * 100)}%
        </T>
      </Ring>
      <T v="smallBold" center>
        {d.remaining === 0 ? (icon === 'shoe-print' ? t('Steps done!') : t('Flowers done!')) : t('{n} to go', { n: fmt(d.remaining) })}
      </T>
    </View>
  );
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <T v="h3">{t('Your Goal')}</T>
        <T v="small" soft>
          {t('{steps} steps and {flowers} flowers by {date}', { steps: fmt(goal.steps), flowers: fmt(goal.flowers), date: fmtDate(goal.endDate) })}
        </T>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {one(cg.steps, [c.leaf, c.teal], t('Steps'), 'shoe-print')}
        {one(cg.flowers, [c.petalRed, c.petalYellow], t('Flowers'), 'flower')}
      </View>
      <T v="bodyBold" center>
        {verdict}
      </T>
    </Card>
  );
}
