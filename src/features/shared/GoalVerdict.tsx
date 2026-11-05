import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { DayKey } from '@/engine/dates';
import { fmt, fmtDate, roundNice } from '@/engine/format';
import { earliestReasonableDate, MAX_RIDE_HOURS, MAX_STEPS_PER_DAY, type GoalCheck, type GoalCheckInput } from '@/engine/goalCheck';
import { useTheme } from '@/theme/theme';
import { Card } from '@/ui/Card';
import { IconChip } from '@/ui/IconChip';
import { PillButton } from '@/ui/PillButton';
import { T } from '@/ui/T';
import { t } from '@/i18n';

/**
 * The earliest reasonable goal date, worked out a moment after the inputs stop changing
 * (sliding the level ruler shouldn't run the search on every tick). undefined while working.
 */
export function useEarliestDate(input: Omit<GoalCheckInput, 'goalKey'> | null): DayKey | null | undefined {
  const key = input ? `${input.start.level}|${input.start.steps}|${input.start.flowers}|${input.startKey}|${input.goalLevel}|${input.seasonRates.join(',')}|${input.bikeFlowersPerHour}|${input.bikes !== false}|${input.walkFlowersPerHour ?? ''}` : '';
  const [result, setResult] = useState<{ key: string; date: DayKey | null } | null>(null);
  useEffect(() => {
    if (!input) return;
    const t = setTimeout(() => setResult({ key, date: earliestReasonableDate(input) }), 280);
    return () => clearTimeout(t);
    // The key captures everything the search depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result && result.key === key ? result.date : undefined;
}

function explain(check: GoalCheck): string {
  switch (check.problem) {
    case 'levelTooLow':
      return t('The goal has to be above your current level.');
    case 'past':
      return t('Pick a date in the future.');
    case 'noRideDays':
      return t("There are no riding days before this date, so the flowers can't be planted in time.");
    case 'tooManySteps':
      return t("This needs about {steps} steps a day at its busiest. Anything over {max} a day isn't realistic.", { steps: fmt(roundNice(check.stepsPerDay)), max: fmt(MAX_STEPS_PER_DAY) });
    case 'tooManyFlowers':
      return check.bikes
        ? t('This needs about {flowers} flowers on each riding day, more than {hours} hours on the bike.', { flowers: fmt(roundNice(check.flowersPerRideDay)), hours: MAX_RIDE_HOURS })
        : t('This needs about {flowers} flowers a day, more than {hours} hours of walking.', { flowers: fmt(roundNice(check.flowersPerRideDay)), hours: MAX_RIDE_HOURS });
    default:
      return '';
  }
}

interface Props {
  check: GoalCheck;
  /** undefined while it's being worked out. */
  earliest: DayKey | null | undefined;
  onUseDate: (k: DayKey) => void;
}

/** Shown in place of the plan summary when a goal can't reasonably be done by its date. */
export function GoalVerdict({ check, earliest, onUseDate }: Props) {
  const { c } = useTheme();
  const datey = check.problem === 'tooManySteps' || check.problem === 'tooManyFlowers' || check.problem === 'noRideDays';
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Card style={{ gap: 10, backgroundColor: c.alertPale }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <IconChip name="alert-circle" bg={c.card} fg={c.alert} />
          <T v="h3" style={{ flex: 1 }}>
            {check.problem === 'levelTooLow' || check.problem === 'past' ? t('Not quite') : t("That's not doable by then")}
          </T>
        </View>
        <T v="small">{explain(check)}</T>
        {datey ? (
          earliest === undefined ? (
            <T v="small" soft>
              {t('Finding the earliest date that works…')}
            </T>
          ) : earliest ? (
            <>
              <T v="small">{t('The earliest reasonable date is {date}.', { date: fmtDate(earliest) })}</T>
              <PillButton label={t('Use {date}', { date: fmtDate(earliest) })} icon="calendar-check" size="md" onPress={() => onUseDate(earliest)} />
            </>
          ) : (
            <T v="small">{t("Even ten years isn't enough at a reasonable pace. Try a lower level.")}</T>
          )
        ) : null}
      </Card>
    </Animated.View>
  );
}
