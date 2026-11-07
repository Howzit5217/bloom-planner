import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight, FadeInUp, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_MANUAL_RATES, type ClimateCache, type TempLimits } from '@/engine/climate';
import { DEFAULT_RHYTHM, type RhythmPrefs } from '@/engine/rhythm';
import type { TempUnit } from '@/engine/units';
import { DEFAULT_LIMITS } from '@/engine/weatherPlan';
import { addDaysKey, fromKey, todayKey, type DayKey } from '@/engine/dates';
import { fmt, fmtDate } from '@/engine/format';
import { makeReq } from '@/engine/levels';
import { progressFromInput } from '@/engine/onboarding';
import { canKeepAnyway, checkDifficulty, type PlanDifficulty } from '@/engine/difficulty';
import { checkGoal } from '@/engine/goalCheck';
import { DEFAULT_RATES, type RateKey } from '@/engine/rates';
import type { PlayLocation, Profile, SeasonRate } from '@/engine/types';
import { DifficultyPill, difficultyColor, keptExtremeKey } from '@/features/shared/Difficulty';
import { EasyDays } from '@/features/shared/EasyDays';
import { EasyVerdict, GoalVerdict, useEarliestDate, useMoreChallenge } from '@/features/shared/GoalVerdict';
import { MonthBars } from '@/features/shared/MonthBars';
import { PlaceFinder, type ClimateResult } from '@/features/shared/PlaceFinder';
import { SeasonSliders } from '@/features/shared/SeasonSliders';
import { WeatherLimits } from '@/features/shared/WeatherLimits';
import { useApp, type LogMode } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { ScreenshotButton } from '@/features/shared/ScreenshotButton';
import { TextField } from '@/ui/TextField';
import { Card } from '@/ui/Card';
import { DateField } from '@/ui/DateField';
import { EdgeFade } from '@/ui/EdgeFade';
import { ScrollRail, useScrollRail } from '@/ui/ScrollRail';
import { Icon, type IconName } from '@/ui/Icon';
import { IconChip } from '@/ui/IconChip';
import { NumberField } from '@/ui/NumberField';
import { PillButton } from '@/ui/PillButton';
import { Reveal } from '@/ui/Reveal';
import { BloomFlower } from '@/ui/skia/BloomFlower';
import { PetalBurst } from '@/ui/skia/PetalBurst';
import { Ring } from '@/ui/skia/Ring';
import { FlowerSprigs } from '@/ui/skia/FlowerSprigs';
import { FlowerSteps } from '@/ui/skia/FlowerSteps';
import { Segmented } from '@/ui/Segmented';
import { Stepper } from '@/ui/Stepper';
import { Toggle } from '@/ui/Toggle';
import { T } from '@/ui/T';
import { tk, useT } from '@/i18n';
import { taskText } from '@/i18n/level-text';
import { useAppWidth } from '@/ui/layout';

const STEPS = 9;
// Flowers on every page: a row of sprigs on the first and last, and on the rest a few leaning in
// from both sides of the screen low down, a different mix every visit.
const sidePage = (step: number) => step >= 1 && step <= 7;
/** Space above each page's content, inside the scroller. */
const BODY_TOP = 12;
/** The page's own space under its content, and the welcome's under its words. */
const BODY_BOTTOM = 28;
const WELCOME_PAD = 24;

function Title({ children, sub }: { children: string; sub?: string }) {
  return (
    <View style={{ gap: 6, marginBottom: 18 }}>
      <T v="h1" accessibilityRole="header">
        {children}
      </T>
      {sub ? (
        <T v="body" soft>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

interface RateDraft {
  value: number | null;
  unknown: boolean;
}

type RateQuestion = { key: RateKey; label: string; suffix: string };

// Walking first (it earns every step and plants flowers too), then the bike (flowers only).
const WALK_RATES: RateQuestion[] = [
  { key: 'walkStepsPerHour', label: tk('Steps per hour walking'), suffix: tk('steps/h') },
  { key: 'walkFlowersPerHour', label: tk('Flowers per hour walking'), suffix: tk('flowers/h') },
];
const BIKE_RATES: RateQuestion[] = [{ key: 'bikeFlowersPerHour', label: tk('Flowers per hour biking'), suffix: tk('flowers/h') }];

export function Wizard() {
  const { c, reduceMotion } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const width = useAppWidth();
  const complete = useApp((s) => s.completeOnboarding);
  const preset = useApp((s) => s.settings.preset);
  // The newest level table the app has (it grows when the game adds levels).
  const table = useApp((s) => s.table);
  const req = useMemo(() => makeReq(table, {}), [table]);
  const today = todayKey();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [level, setLevel] = useState(1);
  const [remainingMode, setRemainingMode] = useState(true);
  const [stepsVal, setStepsVal] = useState<number | null>(null);
  const [flowersVal, setFlowersVal] = useState<number | null>(null);
  const [lifetime, setLifetime] = useState<number | null>(null);
  const [todaySteps, setTodaySteps] = useState<number | null>(null);
  const [todayFlowers, setTodayFlowers] = useState<number | null>(null);
  const [showToday, setShowToday] = useState(false);
  // Where the welcome's words end, down the page's area, so its flowers only take the room they leave.
  const [welcomeEnd, setWelcomeEnd] = useState(0);
  const [goalLevel, setGoalLevel] = useState(2);
  const [goalDate, setGoalDate] = useState<DayKey | null>(null);
  // The goal (level and date) kept as it is after a verdict: past what's realistic, or too easy.
  const [kept, setKept] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<RateKey, RateDraft>>(() => ({
    walkStepsPerHour: { value: DEFAULT_RATES.walkStepsPerHour, unknown: false },
    bikeFlowersPerHour: { value: DEFAULT_RATES.bikeFlowersPerHour, unknown: false },
    walkFlowersPerHour: { value: DEFAULT_RATES.walkFlowersPerHour, unknown: false },
  }));
  const [treadmill, setTreadmill] = useState<boolean | null>(null);
  // Biking is on unless you say you only walk; then flowers come from walking, on any day.
  const [bikes, setBikes] = useState(true);
  const [placeMode, setPlaceMode] = useState<'find' | 'manual'>('find');
  const [manualRates, setManualRates] = useState<number[]>([...DEFAULT_MANUAL_RATES]);
  const [climatePick, setClimatePick] = useState<ClimateResult | null>(null);
  const [seasons, setSeasons] = useState<{ rates: SeasonRate[]; location: PlayLocation | null; climate: ClimateCache | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [playerName, setPlayerName] = useState('');
  // How each day gets logged: follows how the progress was entered here, until chosen.
  const [logMode, setLogMode] = useState<LogMode | null>(null);
  // The weather the plan works around, and the week's easy days.
  const [tempUnit, setTempUnit] = useState<TempUnit>('auto');
  const [limits, setLimits] = useState<TempLimits>(DEFAULT_LIMITS);
  const [rhythm, setRhythm] = useState<RhythmPrefs>(DEFAULT_RHYTHM);

  const next = req(level + 1)!;
  // A blank field means nothing entered yet: show the ring empty, not full.
  const progress = progressFromInput({ level, remainingMode, steps: stepsVal ?? (remainingMode ? next.steps : 0), flowers: flowersVal ?? (remainingMode ? next.flowers : 0), lifetimeSteps: lifetime }, req);
  const needFlowers = next.flowers > 0;
  // The first levels come with the game's tutorial: nothing to walk or plant, so nothing to enter.
  const tutorial = next.steps === 0 && next.flowers === 0;
  // A tutorial level has nothing to go, so a step count; otherwise as the progress was entered.
  const logShown: LogMode = logMode ?? (!tutorial && remainingMode ? 'left' : 'daily');
  // Only up to level 100, and only once this level's steps are complete, is the lifetime total useful.
  const lifetimeRelevant = next.stepsMode === 'lifetime' && stepsVal != null && (remainingMode ? stepsVal === 0 : stepsVal >= next.steps);
  // A lifetime-step level can legitimately be "over" in so-far mode (a banked head start).
  const stepsOverOk = next.stepsMode === 'lifetime' && !remainingMode;
  const stepsErr = stepsVal != null && stepsVal > next.steps && !stepsOverOk ? t("That's more than this level needs ({n}).", { n: fmt(next.steps) }) : null;
  const flowersErr = flowersVal != null && flowersVal > next.flowers ? t("That's more than this level needs ({n}).", { n: fmt(next.flowers) }) : null;

  // Is the goal reasonable? Before the weather is known, every day counts as a riding day; the
  // last page checks again with the real months and biking rate.
  const goalBase = {
    start: { level, steps: progress.stepsIntoLevel, flowers: progress.flowersIntoLevel },
    startKey: addDaysKey(today, 1),
    goalLevel,
    seasonRates: seasons ? seasons.rates.map((r) => r.rideable) : new Array(12).fill(1),
    req,
    bikeFlowersPerHour: rates.bikeFlowersPerHour.unknown ? DEFAULT_RATES.bikeFlowersPerHour : (rates.bikeFlowersPerHour.value ?? DEFAULT_RATES.bikeFlowersPerHour),
    bikes,
    walkFlowersPerHour: rates.walkFlowersPerHour.unknown ? DEFAULT_RATES.walkFlowersPerHour : (rates.walkFlowersPerHour.value ?? DEFAULT_RATES.walkFlowersPerHour),
  };
  const check = goalDate ? checkGoal({ ...goalBase, goalKey: goalDate }) : null;
  // How hard the plan is, at your walking and biking rates (typical ones until you've said).
  const walkRate = rates.walkStepsPerHour.unknown ? DEFAULT_RATES.walkStepsPerHour : (rates.walkStepsPerHour.value ?? DEFAULT_RATES.walkStepsPerHour);
  const diffRates = { walkStepsPerHour: walkRate, bikeFlowersPerHour: goalBase.bikeFlowersPerHour, walkFlowersPerHour: goalBase.walkFlowersPerHour, treadmillAvailable: false, bikes };
  const goalId = goalDate ? `${goalLevel}|${goalDate}` : null;
  const keptNow = kept != null && kept === goalId;
  // Past what's realistic but kept anyway, after "Are you sure?": an EXTREME plan.
  const extremeKept = keptNow && canKeepAnyway(check);
  const accepted = !!check?.ok || extremeKept;
  const difficulty: PlanDifficulty | null = accepted ? checkDifficulty(check, diffRates) : null;
  // A white-flower plan: the last page suggests a bigger challenge, unless it's kept as it is.
  const tooEasy = !!check?.ok && difficulty?.level === 'easy' && !keptNow;
  const more = useMoreChallenge(step === STEPS - 1 && tooEasy && goalDate ? { ...goalBase, goalKey: goalDate } : null, diffRates, table.maxLevel);
  const earliest = useEarliestDate(check && !check.ok ? goalBase : null);

  const go = (n: number) => {
    const to = Math.max(0, Math.min(STEPS - 1, n));
    setDir(to >= step ? 1 : -1);
    setStep(to);
  };
  const pickLevel = (v: number) => {
    if (v === level) return;
    setLevel(v);
    if (goalLevel <= v) setGoalLevel(v + 1);
    // Progress numbers belong to one level: start them fresh when it changes.
    setStepsVal(null);
    setFlowersVal(null);
    setLifetime(null);
  };

  const rateOk = (q: RateQuestion) => rates[q.key].unknown || (rates[q.key].value ?? 0) > 0;
  const rateFields = (qs: RateQuestion[]) =>
    qs.map((q) => {
      const r = rates[q.key];
      return (
        <View key={q.key} style={{ gap: 8 }}>
          {r.unknown ? (
            <View>
              <T v="label" soft style={{ marginBottom: 6 }}>
                {t(q.label)}
              </T>
              <Card variant="deep" style={{ paddingVertical: 14 }}>
                <T v="small">{t('A typical {n} for now. Your logs will show your real rate.', { n: fmt(DEFAULT_RATES[q.key]) })}</T>
              </Card>
            </View>
          ) : (
            <NumberField label={t(q.label)} value={r.value} onChange={(v) => setRates((s) => ({ ...s, [q.key]: { ...s[q.key], value: v } }))} suffix={t(q.suffix)} size="md" />
          )}
          <Chip
            label={t('Not sure yet')}
            icon={r.unknown ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
            on={r.unknown}
            onPress={() => setRates((s) => ({ ...s, [q.key]: { value: s[q.key].value ?? DEFAULT_RATES[q.key], unknown: !s[q.key].unknown } }))}
          />
        </View>
      );
    });

  const canNext = (() => {
    switch (step) {
      case 2:
        return tutorial || (stepsVal != null && (!needFlowers || flowersVal != null) && !stepsErr && !flowersErr);
      case 3:
        return accepted;
      case 4:
        return WALK_RATES.every(rateOk) && treadmill != null;
      case 5:
        return !bikes || BIKE_RATES.every(rateOk);
      default:
        return true;
    }
  })();

  const finish = async () => {
    if (!goalDate || saving || !accepted || tooEasy) return;
    setSaving(true);
    const profile: Profile = {
      currentLevel: level,
      stepsIntoLevel: progress.stepsIntoLevel,
      flowersIntoLevel: progress.flowersIntoLevel,
      // Only a step count uses today's totals so far (typed, then switched to the amount remaining: dropped).
      setupTodaySteps: logShown === 'daily' ? (todaySteps ?? 0) : 0,
      setupTodayFlowers: logShown === 'daily' ? (todayFlowers ?? 0) : 0,
      lifetimeSteps: lifetime,
      lifetimeFlowers: null,
      goalLevel,
      goalDate,
      rates: {
        walkStepsPerHour: rates.walkStepsPerHour.unknown ? null : rates.walkStepsPerHour.value,
        bikeFlowersPerHour: rates.bikeFlowersPerHour.unknown ? null : rates.bikeFlowersPerHour.value,
        walkFlowersPerHour: rates.walkFlowersPerHour.unknown ? null : rates.walkFlowersPerHour.value,
        treadmillAvailable: !!treadmill,
        bikes,
      },
      createdAt: new Date().toISOString(),
      startDate: today,
      playerName: playerName.trim() || null,
    };
    const s = seasons ?? { rates: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, rideable: 1, source: 'default' as const })), location: null, climate: null };
    // The choices from setup, in place before the first plan is made from them.
    // An EXTREME goal kept on purpose: Home doesn't warn about it again.
    const dismissed = extremeKept ? { dismissed: { ...useApp.getState().settings.dismissed, [keptExtremeKey(goalLevel, goalDate)]: true } } : {};
    await useApp.getState().updateSettings({ logMode: logShown, temp: tempUnit, plan: rhythm, limits, ...dismissed });
    await complete({ profile, seasonRates: s.rates, location: s.location, climate: s.climate });
    // The place's months were worked out with the usual limits: again with these.
    if (limits.hot !== DEFAULT_LIMITS.hot || limits.cold !== DEFAULT_LIMITS.cold) await useApp.getState().setLimits(limits);
  };

  const body = (() => {
    switch (step) {
      case 0:
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: WELCOME_PAD }}>
            <View style={{ alignItems: 'center', gap: 14 }} onLayout={(e) => setWelcomeEnd(BODY_TOP + e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
              <BloomFlower size={Math.min(260, width * 0.64)} />
              <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(900).duration(480)}>
                <T v="display" center color={c.leafDeep}>
                  {t('Bloom Planner')}
                </T>
              </Animated.View>
              <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(1080).duration(480)}>
                <T v="body" center style={{ maxWidth: 340 }}>
                  {t("Enter your level and goal. Each day shows whether you're on pace and exactly what it takes.")}
                </T>
              </Animated.View>
            </View>
          </View>
        );
      case 1:
        return (
          <View>
            <Title sub={t('The level on your profile right now.')}>{t('Where Are You Now?')}</Title>
            <View style={{ gap: 12, marginBottom: 16 }}>
              <TextField label={t('Your name in Pikmin Bloom')} value={playerName} onChange={setPlayerName} placeholder={t('As on your profile')} />
              {/* A screenshot of the profile fills in the level, and what's left on the next page. */}
              <ScreenshotButton
                name={playerName.trim() || null}
                onName={setPlayerName}
                req={req}
                maxLevel={table.maxLevel}
                onRead={(shot) => {
                  if (shot.level != null && shot.level < table.maxLevel) pickLevel(shot.level);
                  setRemainingMode(true);
                  if (shot.stepsToGo != null) setStepsVal(shot.stepsToGo);
                  if (shot.flowersToGo != null) setFlowersVal(shot.flowersToGo);
                  // Up to level 100 the profile's total carries a head start into the next level.
                  if (shot.totalSteps != null && shot.level != null && req(shot.level + 1)?.stepsMode === 'lifetime') setLifetime(shot.totalSteps);
                }}
              />
            </View>
            <Stepper label={t('Current level')} value={level} min={1} max={table.maxLevel - 1} onChange={pickLevel} />
            <Card style={{ marginTop: 18 }}>
              <T v="bodyBold">
                {next.steps === 0 && next.flowers === 0
                  ? t('Level {level} comes with the tutorial.', { level: level + 1 })
                  : next.flowers > 0
                    ? t('Level {level} needs {steps} steps and {flowers} flowers to reach {next}.', { level, steps: fmt(next.steps), flowers: fmt(next.flowers), next: level + 1 })
                    : t('Level {level} needs {steps} steps to reach {next}.', { level, steps: fmt(next.steps), next: level + 1 })}
              </T>
              {next.task && next.task !== 'Tutorial' ? (
                <T v="small" soft style={{ marginTop: 4 }}>
                  {t('Also: {task}.', { task: taskText(next.task) })}
                </T>
              ) : null}
              <T v="caption" soft style={{ marginTop: 8 }}>
                {next.stepsMode === 'perLevel' ? t('From level 101 on, extra steps do not carry over to the next level.') : t('Up to level 100 the game counts lifetime steps, so extra steps carry over.')}
              </T>
            </Card>
          </View>
        );
      case 2:
        return (
          <View style={{ gap: 16 }}>
            <Title sub={t('Toward level {level}.', { level: level + 1 })}>{t('How Far Into This Level?')}</Title>
            {tutorial ? (
              <Card variant="panel" style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <IconChip name="school" bg="rgba(255,255,255,0.18)" fg={c.onPanel} />
                <T v="bodyBold" color={c.onPanel} style={{ flex: 1 }}>
                  {t("Level {level} comes with the tutorial, so there's nothing to enter here.", { level: level + 1 })}
                </T>
              </Card>
            ) : null}
            {tutorial ? null : (
              <>
                <View style={{ gap: 6 }}>
                  <Segmented<'left' | 'done'>
                    label={t('How to enter it')}
                    value={remainingMode ? 'left' : 'done'}
                    onChange={(k) => {
                      if ((k === 'left') === remainingMode) return;
                      setRemainingMode(k === 'left');
                      setStepsVal(null);
                      setFlowersVal(null);
                      setLifetime(null);
                    }}
                    options={[
                      { key: 'left', label: t("What's left") },
                      { key: 'done', label: t('Done so far') },
                    ]}
                  />
                  <T v="caption" soft center>
                    {remainingMode ? t("Your profile's level-up screen shows what's still to go.") : t('What you have already walked and planted toward this level.')}
                  </T>
                </View>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                  <NumberField style={{ flex: 1 }} label={remainingMode ? t('Steps to go') : t('Steps so far this level')} value={stepsVal} onChange={setStepsVal} error={stepsErr} />
                  <Ring size={84} thickness={10} fraction={next.steps > 0 ? progress.stepsIntoLevel / next.steps : 1} colors={[c.leaf, c.teal]} accessibilityLabel={t('Steps {pct} percent done', { pct: Math.round((progress.stepsIntoLevel / Math.max(1, next.steps)) * 100) })}>
                    <T v="smallBold">{Math.round(Math.min(1, progress.stepsIntoLevel / Math.max(1, next.steps)) * 100)}%</T>
                  </Ring>
                </View>
                {needFlowers ? (
                  <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                    <NumberField style={{ flex: 1 }} label={remainingMode ? t('Flowers to go') : t('Flowers planted this level')} value={flowersVal} onChange={setFlowersVal} error={flowersErr} />
                    <Ring size={84} thickness={10} fraction={progress.flowersIntoLevel / next.flowers} colors={[c.petalRed, c.petalYellow]} accessibilityLabel={t('Flowers {pct} percent done', { pct: Math.round((progress.flowersIntoLevel / next.flowers) * 100) })}>
                      <T v="smallBold">{Math.round((progress.flowersIntoLevel / next.flowers) * 100)}%</T>
                    </Ring>
                  </View>
                ) : (
                  <T v="small" soft>
                    {t('No flowers needed for this level.')}
                  </T>
                )}
                {lifetimeRelevant ? (
                  <NumberField
                    label={t('Total recorded steps (optional)')}
                    value={lifetime}
                    onChange={setLifetime}
                    hint={t("This level's steps are done. Up to level 100 the game counts lifetime steps, so your total shows how far ahead you are.")}
                    size="md"
                  />
                ) : null}
              </>
            )}
            {/* How each evening's log goes from here on (Settings can change it). */}
            <View style={{ gap: 6 }}>
              <T v="smallBold">{t('Log each day by')}</T>
              <Segmented<LogMode>
                label={t('Log each day by')}
                value={logShown}
                onChange={setLogMode}
                options={[
                  { key: 'daily', label: t('Step count') },
                  { key: 'left', label: t('Amount remaining') },
                ]}
              />
              <T v="caption" soft>
                {logShown === 'left' ? t("What the game's level-up screen shows still to go: steps, flowers and the level's quest, like mushrooms or expeditions.") : t("The day's steps and flowers.")}
              </T>
            </View>
            {/* Only a step count needs today's totals so far, so tonight's log doesn't count them
                twice; the amount remaining comes straight from the game. */}
            {logShown === 'daily' ? (
              <>
                <Pressable accessibilityRole="button" onPress={() => setShowToday((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                  <Icon name={showToday ? 'chevron-down' : 'chevron-right'} size={22} color={c.leafDeep} />
                  <T v="bodyBold" color={c.leafDeep}>
                    {t('Already been out today?')}
                  </T>
                </Pressable>
                {showToday ? (
                  <Card variant="deep" style={{ gap: 12 }}>
                    <T v="small">{t("The numbers above already include today. Enter today's totals so far, so tonight's log doesn't count them twice.")}</T>
                    <NumberField label={t('Steps so far today')} value={todaySteps} onChange={setTodaySteps} size="md" />
                    <NumberField label={t('Flowers so far today')} value={todayFlowers} onChange={setTodayFlowers} size="md" />
                  </Card>
                ) : null}
              </>
            ) : null}
          </View>
        );
      case 3:
        return (
          <View style={{ gap: 18 }}>
            <Title>{t("What's the Goal?")}</Title>
            <View>
              <T v="label" soft center style={{ marginBottom: 8 }}>
                {t('Target level')}
              </T>
              <Stepper label={t('Target level')} value={goalLevel} min={level + 1} max={table.maxLevel} onChange={setGoalLevel} />
            </View>
            <DateField label={t('Target date')} value={goalDate} onChange={setGoalDate} minimumDate={fromKey(addDaysKey(today, 1))} />
            {/* Only a goal that can't be done says so here; how hard the plan is shows on the last page,
                once your own pace is in. */}
            {check && !check.ok && !extremeKept ? <GoalVerdict check={check} earliest={earliest} onUseDate={setGoalDate} onKeep={() => setKept(goalId)} difficulty={checkDifficulty(check, diffRates)} /> : null}
            {extremeKept && difficulty ? <DifficultyPill d={difficulty} wide /> : null}
          </View>
        );
      case 4:
        return (
          <View style={{ gap: 18 }}>
            <Title sub={t('Rough guesses are fine.')}>{t('How Do You Walk?')}</Title>
            {rateFields(WALK_RATES)}
            <View style={{ gap: 12, marginTop: 4 }}>
              <T v="h3">{t('Can You Get Steps Indoors?')}</T>
              <T v="small" soft style={{ marginTop: -8 }}>
                {t('Like a treadmill, or walking at work.')}
              </T>
              <Choice icon="walk" title={t('Yes, Indoors Too')} on={treadmill === true} onPress={() => setTreadmill(true)} />
              <Choice icon="pine-tree" title={t('No, Only Outside')} on={treadmill === false} onPress={() => setTreadmill(false)} />
            </View>
          </View>
        );
      case 5:
        return (
          <View style={{ gap: 18 }}>
            <Title sub={t('A ride plants flowers far faster than walking, but earns no steps.')}>{t('And on the Bike?')}</Title>
            <Toggle label={t('Biking for Flowers')} hint={t('Turn off to plan flowers from walking only.')} value={bikes} onChange={setBikes} />
            <Reveal open={bikes} gap={18}>
              <View style={{ gap: 18 }}>{rateFields(BIKE_RATES)}</View>
            </Reveal>
          </View>
        );
      case 6:
        return (
          <View style={{ gap: 14 }}>
            <Title sub={t('Planting needs you outside. Where do you usually walk and ride?')}>{t('Where Do You Play?')}</Title>
            {placeMode === 'find' && !seasons ? (
              <PlaceFinder
                preset={preset}
                onAccept={(r) => {
                  setSeasons({ rates: r.rates, location: r.location, climate: r.climate });
                  go(7);
                }}
                onManual={(prefill) => {
                  setClimatePick(prefill);
                  if (prefill) setManualRates(prefill.rates.map((x) => x.rideable));
                  setPlaceMode('manual');
                }}
              />
            ) : placeMode === 'manual' ? (
              <View style={{ gap: 14 }}>
                <T v="bodyBold">{t("Days you'd realistically ride, by month")}</T>
                <MonthBars rates={manualRates} width={width - 48} height={90} />
                <SeasonSliders values={manualRates} onChange={setManualRates} />
                <PillButton
                  label={t('Use these')}
                  icon="check"
                  onPress={() => {
                    setSeasons({
                      rates: manualRates.map((r, i) => ({ month: i + 1, rideable: r, source: 'manual' as const })),
                      location: climatePick?.location ?? null,
                      climate: climatePick?.climate ?? null,
                    });
                    go(7);
                  }}
                />
                <PillButton
                  label={t('Skip: treat every day as rideable')}
                  variant="ghost"
                  onPress={() => {
                    setSeasons(null);
                    go(7);
                  }}
                />
                <PillButton label={t('Look up a place instead')} variant="ghost" onPress={() => setPlaceMode('find')} />
              </View>
            ) : null}
          </View>
        );
      case 7:
        return (
          <View style={{ gap: 16 }}>
            <Title sub={t('What the plan works around, for walking and riding. Settings can change any of it later.')}>{t('Weather and Easy Days')}</Title>
            <WeatherLimits unit={tempUnit} onUnit={setTempUnit} limits={limits} onLimits={setLimits} />
            <T v="caption" soft>
              {t('Feels-like temperatures, so humidity and wind count too. Hotter or colder days, and rain, snow or storms, get less in the plan; good days get more.')}
            </T>
            <EasyDays value={rhythm} onChange={setRhythm} />
          </View>
        );
      default:
        return (
          <View style={{ gap: 18 }}>
            <Done level={level} goalLevel={goalLevel} goalDate={goalDate} blocked={(!!check && !accepted) || tooEasy} difficulty={difficulty} />
            {check && !check.ok && !extremeKept ? <GoalVerdict check={check} earliest={earliest} onUseDate={setGoalDate} onKeep={() => setKept(goalId)} difficulty={checkDifficulty(check, diffRates)} /> : null}
            {tooEasy && difficulty ? <EasyVerdict difficulty={difficulty} more={more} onUseDate={setGoalDate} onUseLevel={setGoalLevel} onKeep={() => setKept(goalId)} /> : null}
          </View>
        );
    }
  })();

  // The keyboard: while it's up the page above shrinks to fit, but the flowers stay just where they
  // were on the screen, and the keyboard covers them (no jumping above it, no fading away).
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [keyboardH, setKeyboardH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeyboardUp(true);
      setKeyboardH(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardUp(false);
      setKeyboardH(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // The page's area and the whole screen as they are with the keyboard down: while typing, a sudden
  // shrink of more than a keyboard's worth is the keyboard (on some phones the window shrinks before it
  // says so). Otherwise it's the window itself changing size (resized, or the display size changed),
  // and the page follows it: held at the old size, the flowers stood over the buttons.
  const [restBox, setRestBox] = useState({ y: 0, h: 0 });
  const [rootH, setRootH] = useState(0);
  const typing = () => {
    if (keyboardUp) return true;
    // The app and the web name the focused-box lookup differently.
    const state = TextInput.State as { currentlyFocusedInput?: () => unknown; currentlyFocusedField?: () => unknown };
    return (state.currentlyFocusedInput?.() ?? state.currentlyFocusedField?.() ?? null) != null;
  };
  const atRest = (prev: number, h: number) => prev === 0 || h > prev - 120 || !typing();
  // The room a page leaves below its content (the welcome fills the screen, so it has its own).
  const [bodyH, setBodyH] = useState({ step: -1, h: 0 });
  const room = step !== 0 && bodyH.step === step && restBox.h > 0 ? restBox.h - BODY_TOP - bodyH.h - 10 : -1;
  // Each page's flowers take the room it leaves them, and fade aside whenever the page grows into
  // it, so they never sit over a card or a field.
  const sprigMax = step === 8 ? 130 : 300;
  const sprigMin = step === 8 ? 100 : 140;
  const [sprigRoom, setSprigRoom] = useState({ step: -1, h: 0 });
  const roomFor = Math.min(sprigMax, Math.floor(room));
  // The first room a page offers sets its flowers' height at once.
  if (!keyboardUp && roomFor >= sprigMin && sprigRoom.step !== step) setSprigRoom({ step, h: roomFor });
  useEffect(() => {
    // After that, follow the page only once it settles (not through every frame of the keyboard),
    // and only when they no longer fit or there's much more room. Too little room just hides them.
    if (keyboardUp || roomFor < sprigMin || sprigRoom.step !== step || (roomFor >= sprigRoom.h - 6 && roomFor <= sprigRoom.h + 40)) return;
    const id = setTimeout(() => setSprigRoom({ step, h: roomFor }), 450);
    return () => clearTimeout(id);
  }, [keyboardUp, roomFor, sprigMin, sprigRoom, step]);
  // The welcome's flowers: up to 130 tall, in the space its words leave below them, or none when that's
  // too little, so they never stand over the words.
  const welcomeBelow = restBox.h > 0 && welcomeEnd > 0 ? restBox.h - welcomeEnd - 8 : -1;
  const welcomeSprig = welcomeBelow >= 90 ? Math.min(130, Math.floor(welcomeBelow)) : 0;
  const sprigH = step === 0 ? welcomeSprig : sprigRoom.step === step ? sprigRoom.h : 0;
  const sprigsFit = step === 0 ? welcomeSprig > 0 : sprigH >= sprigMin && room >= sprigH - 6;
  const sprigFade = useAnimatedStyle(() => ({ opacity: withTiming(sprigsFit ? 1 : 0, { duration: 220 }) }));
  // Where the flowers stand on the screen: along the bottom of the page's area at rest. With the
  // keyboard up, whatever would show above its top edge is clipped, so they never peek out over
  // the buttons the keyboard has pushed up; the rest is under the keyboard.
  const bandBottom = restBox.y + restBox.h;
  const bandTop = bandBottom - sprigH;
  const keyboardTop = keyboardUp && keyboardH > 0 && rootH > 0 ? rootH - keyboardH : -Infinity;
  const clipTop = Math.min(bandBottom, Math.max(bandTop, keyboardTop));

  // Without a bike there's no place page (its months are riding days); the weather page comes next.
  const rail = useScrollRail();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const onScroll = useAnimatedScrollHandler((e) => rail.track(e));
  const back = () => (step === 6 && placeMode === 'manual' && !seasons ? setPlaceMode('find') : go(step === 7 && !bikes ? 5 : step - 1));

  const primary =
    step === 0
      ? { label: t('Time to get growing'), onPress: () => go(1) }
      : step === 6
        ? null
        : step === 8
          ? { label: saving ? t('Planting…') : t('Start blooming'), onPress: finish }
          : { label: t('Next'), onPress: () => go(step === 5 && !bikes ? 7 : step + 1) };

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }} onLayout={(e) => {
      const h = e.nativeEvent.layout.height;
      setRootH((prev) => (atRest(prev, h) ? h : prev));
    }}>
      {(step === 0 ? welcomeSprig > 0 : sprigH >= sprigMin) && restBox.h > 0 ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: clipTop, height: Math.max(0, bandBottom - clipTop), overflow: 'hidden' }, sprigFade]}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: bandTop - clipTop, height: sprigH }}>
            <FlowerSprigs key={`${step}-${sprigH}`} height={sprigH} sides={sidePage(step)} />
          </View>
        </Animated.View>
      ) : null}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ height: insets.top + 18 }} />
        <View style={{ flex: 1 }} onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          setRestBox((prev) => (atRest(prev.h, height) ? { y, h: height } : prev));
        }}>
          <Animated.ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: BODY_TOP, paddingBottom: BODY_BOTTOM, flexGrow: 1 }}>
            <Animated.View key={step} entering={reduceMotion ? FadeIn.duration(160) : (dir > 0 ? FadeInRight : FadeInLeft).duration(300)} style={{ flex: 1 }}>
              {step === 0 ? body : <View onLayout={(e) => setBodyH({ step, h: e.nativeEvent.layout.height })}>{body}</View>}
            </Animated.View>
          </Animated.ScrollView>
          <EdgeFade edge="top" color={c.canvas} />
          <EdgeFade edge="bottom" color={c.canvas} />
          <ScrollRail rail={rail} scrollRef={scrollRef} />
        </View>
        <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 14, paddingTop: 8, gap: 14 }}>
          {step > 0 || primary ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {step > 0 ? <BackTile label={t('Back')} onPress={back} /> : null}
              {primary ? <PillButton style={{ flex: 1 }} label={primary.label} onPress={primary.onPress} disabled={!canNext || saving || (step === 8 && (!accepted || tooEasy))} /> : null}
            </View>
          ) : null}
          <FlowerSteps step={step} count={STEPS} />
          {step === 0 ? (
            <T v="caption" soft center>
              {t('Unofficial fan-made planner. Not affiliated with Scopely, Nintendo or Pikmin Bloom.')}
            </T>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Back, as a quiet grey tile beside the main button. */
function BackTile({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({ width: 58, height: 58, borderRadius: 20, backgroundColor: pressed ? c.tilePressed : c.tile, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}
    >
      <Icon name="chevron-left" size={32} color={c.inkSoft} />
    </Pressable>
  );
}

function Chip({ label, icon, on, onPress }: { label: string; icon: IconName; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? c.leafPale : 'transparent' }}
    >
      <Icon name={icon} size={20} color={on ? c.leafDeep : c.inkSoft} />
      <T v="smallBold" color={on ? c.leafDeep : c.inkSoft}>
        {label}
      </T>
    </Pressable>
  );
}

function Choice({ icon, title, text, on, onPress }: { icon: IconName; title: string; text?: string; on: boolean; onPress: () => void }) {
  const { c, reduceMotion } = useTheme();
  const pop = useSharedValue(1);
  useEffect(() => {
    if (on && !reduceMotion) pop.value = withSequence(withTiming(0.8, { duration: 70 }), withSpring(1, { damping: 7, stiffness: 220 }));
  }, [on, reduceMotion, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={title}
      accessibilityHint={text}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 18,
        borderRadius: radius.card,
        backgroundColor: on ? c.leafPale : c.card,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        boxShadow: on ? `0px 0px 0px 3px ${c.leaf}, 0px 6px 20px 0px ${c.shadow}` : `0px 6px 20px 0px ${c.shadow}`,
      })}
    >
      <Animated.View style={[{ width: 52, height: 52, borderRadius: 26, backgroundColor: on ? c.leaf : c.canvasDeep, alignItems: 'center', justifyContent: 'center' }, popStyle]}>
        <Icon name={icon} size={28} color={on ? '#FFFFFF' : c.leafDeep} />
      </Animated.View>
      {/* Centered beside the icon; a title on its own has no empty line under it. */}
      <View style={{ flex: 1, gap: 4, justifyContent: 'center' }}>
        <T v="h3">{title}</T>
        {text ? (
          <T v="small" soft>
            {text}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

function Done({ level, goalLevel, goalDate, blocked, difficulty }: { level: number; goalLevel: number; goalDate: DayKey | null; blocked: boolean; difficulty: PlanDifficulty | null }) {
  const { c } = useTheme();
  const { t } = useT();
  return (
    <View style={{ alignItems: 'center', gap: 14, paddingTop: 24 }}>
      <View>
        {/* Your plan's flower: white when it's easy, then yellow, red, and blue for the hardest. */}
        <BloomFlower key={difficulty?.level ?? 'none'} size={200} delay={50} color={difficulty ? difficultyColor(c, difficulty.level) : undefined} />
        <PetalBurst trigger={1} width={200} height={200} originX={100} originY={110} />
      </View>
      <Animated.View entering={FadeInUp.delay(700).duration(420)} style={{ gap: 6 }}>
        <T v="h1" center>
          {blocked ? t('One Last Thing') : t("You're All Set")}
        </T>
        <T v="h3" center soft>
          {goalDate ? t('Level {from} → {to} by {date}', { from: level, to: goalLevel, date: fmtDate(goalDate) }) : t('Level {from} → {to}', { from: level, to: goalLevel })}
        </T>
      </Animated.View>
      {difficulty && !blocked ? (
        <Animated.View entering={FadeInUp.delay(780).duration(420)}>
          <DifficultyPill d={difficulty} />
        </Animated.View>
      ) : null}
    </View>
  );
}
