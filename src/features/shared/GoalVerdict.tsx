import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { DayKey } from '@/engine/dates';
import { canKeepAnyway, moreChallenge, pastPossible, type MoreChallenge, type PlanDifficulty } from '@/engine/difficulty';
import { fmt, fmtDate, fmtHours, roundNice } from '@/engine/format';
import { earliestReasonableDate, MAX_RIDE_HOURS, MAX_STEPS_PER_DAY, type GoalCheck, type GoalCheckInput } from '@/engine/goalCheck';
import type { ResolvedRates } from '@/engine/types';
import { useTheme } from '@/theme/theme';
import { Card } from '@/ui/Card';
import { IconChip } from '@/ui/IconChip';
import { PillButton } from '@/ui/PillButton';
import { Sheet } from '@/ui/Sheet';
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

type ChallengeRates = Pick<ResolvedRates, 'walkStepsPerHour' | 'bikeFlowersPerHour' | 'walkFlowersPerHour' | 'treadmillAvailable' | 'bikes'>;

/**
 * For a goal that's too easy, a bigger challenge (see moreChallenge), worked out a moment after the
 * inputs stop changing. undefined while working.
 */
export function useMoreChallenge(input: GoalCheckInput | null, rates: ChallengeRates | null | undefined, maxLevel: number): MoreChallenge | undefined {
  const key =
    input && rates
      ? `${input.start.level}|${input.start.steps}|${input.start.flowers}|${input.startKey}|${input.goalKey}|${input.goalLevel}|${input.seasonRates.join(',')}|${rates.bikeFlowersPerHour}|${rates.bikes}|${rates.walkFlowersPerHour}|${rates.walkStepsPerHour}|${rates.treadmillAvailable}|${maxLevel}`
      : '';
  const [result, setResult] = useState<{ key: string; more: MoreChallenge } | null>(null);
  useEffect(() => {
    if (!input || !rates) return;
    const t = setTimeout(() => setResult({ key, more: moreChallenge(input, rates, maxLevel) }), 280);
    return () => clearTimeout(t);
    // The key captures everything the search depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result && result.key === key ? result.more : undefined;
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
  /**
   * Keep a goal past what's realistic anyway, once "Are you sure?" says yes. Offered only where the
   * plan can still be laid out (too many steps or flowers a day).
   */
  onKeep?: () => void;
  /** How hard it would be (EXTREME), for the "Are you sure?". */
  difficulty?: PlanDifficulty | null;
}

/** Shown in place of the plan summary when a goal can't reasonably be done by its date. */
export function GoalVerdict({ check, earliest, onUseDate, onKeep, difficulty }: Props) {
  const { c } = useTheme();
  const [asking, setAsking] = useState(false);
  const datey = check.problem === 'tooManySteps' || check.problem === 'tooManyFlowers' || check.problem === 'noRideDays';
  const keepable = !!onKeep && canKeepAnyway(check);
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Card style={{ gap: 10, backgroundColor: c.alertPale }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <IconChip name="alert-circle" bg={c.card} fg={c.alert} />
          <T v="h3" style={{ flex: 1 }}>
            {check.problem === 'levelTooLow' || check.problem === 'past' ? t('Not Quite') : t("That's Not Doable by Then")}
          </T>
        </View>
        <T v="small">{explain(check)}</T>
        {/* A day like that can happen; every day can't, so there's no keeping this one. */}
        {pastPossible(check) ? <T v="small">{t("That's about {steps} steps every day. One day like that is possible, but not day after day, so this goal can't be kept.", { steps: fmt(roundNice(check.plan!.avgStepsPerDay)) })}</T> : null}
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
        {keepable ? <PillButton label={t('Keep this goal anyway')} icon="fire" variant="ghost" size="md" onPress={() => setAsking(true)} /> : null}
      </Card>
      {keepable ? (
        <Sheet visible={asking} onClose={() => setAsking(false)} title={t('Are You Sure?')}>
          <View style={{ gap: 12 }}>
            <T>{difficulty ? t('This is an EXTREME plan: about {time} on the move a day, well past what is realistic.', { time: fmtHours(difficulty.hours) }) : t('This is an EXTREME plan, well past what is realistic.')}</T>
            <T v="small" soft>
              {t('The plan still lays out every day. The goal can be changed any time in Settings.')}
            </T>
            <View style={{ gap: 10, marginTop: 4 }}>
              <PillButton
                label={t('Yes, keep it')}
                icon="fire"
                variant="danger"
                onPress={() => {
                  setAsking(false);
                  onKeep?.();
                }}
              />
              <PillButton label={t('Cancel')} variant="ghost" onPress={() => setAsking(false)} />
            </View>
          </View>
        </Sheet>
      ) : null}
    </Animated.View>
  );
}

/**
 * Shown when a goal is too easy (a white-flower plan): a shorter challenge or a higher level by
 * the same date, each a steady plan, or keep it as it is.
 */
export function EasyVerdict({ difficulty, more, onUseDate, onUseLevel, onKeep }: { difficulty: PlanDifficulty; more: MoreChallenge | undefined; onUseDate: (k: DayKey) => void; onUseLevel: (level: number) => void; onKeep: () => void }) {
  const { c } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Card style={{ gap: 10, backgroundColor: c.leafPale }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <IconChip name="sprout" bg={c.card} fg={c.leafDeep} />
          <T v="h3" style={{ flex: 1 }}>
            {t("That's Really Easy")}
          </T>
        </View>
        <T v="small">{t('This plan only needs about {time} on the move a day. For a real challenge, finish sooner or aim higher by then.', { time: fmtHours(difficulty.hours) })}</T>
        {more === undefined ? (
          <T v="small" soft>
            {t('Finding a bigger challenge…')}
          </T>
        ) : (
          <>
            {more.date ? <PillButton label={t('Finish by {date}', { date: fmtDate(more.date) })} icon="calendar-check" size="md" onPress={() => onUseDate(more.date!)} /> : null}
            {more.level ? <PillButton label={t('Aim for level {level}', { level: more.level })} icon="flag-checkered" size="md" onPress={() => onUseLevel(more.level!)} /> : null}
          </>
        )}
        <PillButton label={t('Keep this goal')} icon="check" variant="ghost" size="md" onPress={onKeep} />
      </Card>
    </Animated.View>
  );
}
