import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_MANUAL_RATES, type ClimateCache } from '@/engine/climate';
import { addDaysKey, daysBetween, fromKey, todayKey, type DayKey } from '@/engine/dates';
import { fmt, fmtDate, roundNice } from '@/engine/format';
import { makeReq } from '@/engine/levels';
import { progressFromInput } from '@/engine/onboarding';
import { buildPlan } from '@/engine/plan';
import { DEFAULT_RATES, type RateKey } from '@/engine/rates';
import type { PlayLocation, Profile, SeasonRate } from '@/engine/types';
import { MonthBars } from '@/features/shared/MonthBars';
import { PlaceFinder, type ClimateResult } from '@/features/shared/PlaceFinder';
import { SeasonSliders } from '@/features/shared/SeasonSliders';
import { BUNDLED_TABLE, useApp } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { Card } from '@/ui/Card';
import { DateField } from '@/ui/DateField';
import { Icon, type IconName } from '@/ui/Icon';
import { NumberField } from '@/ui/NumberField';
import { PillButton } from '@/ui/PillButton';
import { BloomFlower } from '@/ui/skia/BloomFlower';
import { PetalBurst } from '@/ui/skia/PetalBurst';
import { Ring } from '@/ui/skia/Ring';
import { Seedling } from '@/ui/skia/Seedling';
import { Stepper } from '@/ui/Stepper';
import { T } from '@/ui/T';
import { Toggle } from '@/ui/Toggle';

const STEPS = 8;
const REQ = makeReq(BUNDLED_TABLE, {});

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

const RATE_QUESTIONS: Array<{ key: RateKey; label: string; why: string; suffix: string }> = [
  { key: 'walkStepsPerHour', label: 'Steps per hour walking', why: 'Sets how long your step target takes.', suffix: 'steps/h' },
  { key: 'bikeFlowersPerHour', label: 'Flowers per hour biking', why: 'Biking plants far faster than walking.', suffix: 'flowers/h' },
  { key: 'bikeStepsPerHour', label: 'Steps per hour biking', why: 'Biking may credit fewer steps. Check your own.', suffix: 'steps/h' },
  { key: 'walkFlowersPerHour', label: 'Flowers per hour walking', why: "For days you don't take the bike.", suffix: 'flowers/h' },
];

export function Wizard() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const complete = useApp((s) => s.completeOnboarding);
  const preset = useApp((s) => s.settings.preset);
  const req = REQ;
  const today = todayKey();

  const [step, setStep] = useState(0);
  const [level, setLevel] = useState(1);
  const [remainingMode, setRemainingMode] = useState(true);
  const [stepsVal, setStepsVal] = useState<number | null>(null);
  const [flowersVal, setFlowersVal] = useState<number | null>(null);
  const [lifetime, setLifetime] = useState<number | null>(null);
  const [todaySteps, setTodaySteps] = useState<number | null>(null);
  const [todayFlowers, setTodayFlowers] = useState<number | null>(null);
  const [showToday, setShowToday] = useState(false);
  const [goalLevel, setGoalLevel] = useState(2);
  const [goalDate, setGoalDate] = useState<DayKey | null>(null);
  const [rates, setRates] = useState<Record<RateKey, RateDraft>>(() => ({
    walkStepsPerHour: { value: DEFAULT_RATES.walkStepsPerHour, unknown: false },
    bikeFlowersPerHour: { value: DEFAULT_RATES.bikeFlowersPerHour, unknown: false },
    bikeStepsPerHour: { value: DEFAULT_RATES.bikeStepsPerHour, unknown: false },
    walkFlowersPerHour: { value: DEFAULT_RATES.walkFlowersPerHour, unknown: false },
  }));
  const [treadmill, setTreadmill] = useState<boolean | null>(null);
  const [placeMode, setPlaceMode] = useState<'find' | 'manual'>('find');
  const [manualRates, setManualRates] = useState<number[]>([...DEFAULT_MANUAL_RATES]);
  const [climatePick, setClimatePick] = useState<ClimateResult | null>(null);
  const [seasons, setSeasons] = useState<{ rates: SeasonRate[]; location: PlayLocation | null; climate: ClimateCache | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const next = req(level + 1)!;
  // A blank field means nothing entered yet: show the ring empty, not full.
  const progress = progressFromInput({ level, remainingMode, steps: stepsVal ?? (remainingMode ? next.steps : 0), flowers: flowersVal ?? (remainingMode ? next.flowers : 0), lifetimeSteps: lifetime }, req);
  const needFlowers = next.flowers > 0;
  // A lifetime-step level can legitimately be "over" in so-far mode (a banked head start).
  const stepsOverOk = next.stepsMode === 'lifetime' && !remainingMode;
  const stepsErr = stepsVal != null && stepsVal > next.steps && !stepsOverOk ? `That's more than this level needs (${fmt(next.steps)}).` : null;
  const flowersErr = flowersVal != null && flowersVal > next.flowers ? `That's more than this level needs (${fmt(next.flowers)}).` : null;

  const goalDays = goalDate ? daysBetween(today, goalDate) : 0;
  const goalErr = goalLevel <= level ? 'The goal has to be above your current level.' : goalDate && goalDays <= 0 ? 'Pick a date in the future.' : null;
  const preview =
    !goalDate || goalLevel <= level || goalDays <= 0
      ? null
      : buildPlan({ start: { level, steps: progress.stepsIntoLevel, flowers: progress.flowersIntoLevel }, startKey: addDaysKey(today, 1), goalKey: goalDate, goalLevel, seasonRates: new Array(12).fill(1), req });

  const go = (n: number) => setStep(Math.max(0, Math.min(STEPS - 1, n)));

  const canNext = (() => {
    switch (step) {
      case 2:
        return stepsVal != null && (!needFlowers || flowersVal != null) && !stepsErr && !flowersErr;
      case 3:
        return !!goalDate && !goalErr;
      case 4:
        return RATE_QUESTIONS.every((q) => rates[q.key].unknown || (rates[q.key].value ?? 0) > 0);
      case 5:
        return treadmill != null;
      default:
        return true;
    }
  })();

  const finish = async () => {
    if (!goalDate || saving) return;
    setSaving(true);
    const profile: Profile = {
      currentLevel: level,
      stepsIntoLevel: progress.stepsIntoLevel,
      flowersIntoLevel: progress.flowersIntoLevel,
      setupTodaySteps: todaySteps ?? 0,
      setupTodayFlowers: todayFlowers ?? 0,
      lifetimeSteps: lifetime,
      lifetimeFlowers: null,
      goalLevel,
      goalDate,
      rates: {
        walkStepsPerHour: rates.walkStepsPerHour.unknown ? null : rates.walkStepsPerHour.value,
        bikeFlowersPerHour: rates.bikeFlowersPerHour.unknown ? null : rates.bikeFlowersPerHour.value,
        bikeStepsPerHour: rates.bikeStepsPerHour.unknown ? null : rates.bikeStepsPerHour.value,
        walkFlowersPerHour: rates.walkFlowersPerHour.unknown ? null : rates.walkFlowersPerHour.value,
        treadmillAvailable: !!treadmill,
      },
      createdAt: new Date().toISOString(),
      startDate: today,
    };
    const s = seasons ?? { rates: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, rideable: 1, source: 'default' as const })), location: null, climate: null };
    await complete({ profile, seasonRates: s.rates, location: s.location, climate: s.climate });
  };

  const body = (() => {
    switch (step) {
      case 0:
        return (
          <View style={{ alignItems: 'center', paddingTop: 24, gap: 14 }}>
            <BloomFlower size={Math.min(240, width * 0.6)} />
            <T v="display" center color={c.leafDeep}>
              Bloom Planner
            </T>
            <T v="body" center style={{ maxWidth: 340 }}>
              Tell me your level and your goal. Every day I'll tell you whether you're on pace, and exactly what it'll take.
            </T>
          </View>
        );
      case 1:
        return (
          <View>
            <Title sub="The level on your profile right now.">Where are you now?</Title>
            <Stepper label="Current level" value={level} min={1} max={BUNDLED_TABLE.maxLevel - 1} onChange={(v) => {
              setLevel(v);
              if (goalLevel <= v) setGoalLevel(v + 1);
            }} />
            <Card style={{ marginTop: 22 }}>
              <T v="bodyBold">
                {next.steps === 0 && next.flowers === 0
                  ? `Level ${level + 1} comes with the tutorial.`
                  : `Level ${level} needs ${fmt(next.steps)} steps${next.flowers > 0 ? ` and ${fmt(next.flowers)} flowers` : ''} to reach ${level + 1}.`}
              </T>
              {next.task && next.task !== 'Tutorial' ? (
                <T v="small" soft style={{ marginTop: 4 }}>
                  Also: {next.task}.
                </T>
              ) : null}
              <T v="caption" soft style={{ marginTop: 8 }}>
                {next.source === 'game' ? 'Checked in the game. ' : next.source === 'estimated' ? "Nobody has published this level yet, so it's an estimate. " : 'From the Pikmin wiki. '}
                {next.stepsMode === 'perLevel' ? 'From level 101 on, extra steps do not carry over to the next level.' : 'Up to level 100 the game counts lifetime steps, so extra steps carry over.'}
              </T>
            </Card>
          </View>
        );
      case 2:
        return (
          <View style={{ gap: 16 }}>
            <Title sub={`Toward level ${level + 1}.`}>How far into this level?</Title>
            <Toggle label="I'd rather enter what's remaining" hint="Your profile shows this under 'Next steps to level up'." value={remainingMode} onChange={(v) => {
              setRemainingMode(v);
              setStepsVal(null);
              setFlowersVal(null);
            }} />
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <NumberField style={{ flex: 1 }} label={remainingMode ? 'Steps to go' : 'Steps so far this level'} value={stepsVal} onChange={setStepsVal} error={stepsErr} />
              <Ring size={84} thickness={10} fraction={next.steps > 0 ? progress.stepsIntoLevel / next.steps : 1} colors={[c.leaf, c.teal]} accessibilityLabel={`Steps ${Math.round((progress.stepsIntoLevel / Math.max(1, next.steps)) * 100)} percent done`}>
                <T v="smallBold">{Math.round(Math.min(1, progress.stepsIntoLevel / Math.max(1, next.steps)) * 100)}%</T>
              </Ring>
            </View>
            {needFlowers ? (
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <NumberField style={{ flex: 1 }} label={remainingMode ? 'Flowers to go' : 'Flowers planted this level'} value={flowersVal} onChange={setFlowersVal} error={flowersErr} />
                <Ring size={84} thickness={10} fraction={progress.flowersIntoLevel / next.flowers} colors={[c.petalRed, c.petalYellow]} accessibilityLabel={`Flowers ${Math.round((progress.flowersIntoLevel / next.flowers) * 100)} percent done`}>
                  <T v="smallBold">{Math.round((progress.flowersIntoLevel / next.flowers) * 100)}%</T>
                </Ring>
              </View>
            ) : (
              <T v="small" soft>
                No flowers needed for this level.
              </T>
            )}
            {next.stepsMode === 'lifetime' ? (
              <NumberField
                label="Total recorded steps (optional)"
                value={lifetime}
                onChange={setLifetime}
                hint="Below 100 the game counts lifetime steps. If it shows 0 steps to go, this tells me your head start."
                size="md"
              />
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setShowToday((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
              <Icon name={showToday ? 'chevron-down' : 'chevron-right'} size={22} color={c.leafDeep} />
              <T v="bodyBold" color={c.leafDeep}>
                Already been out today?
              </T>
            </Pressable>
            {showToday ? (
              <Card variant="deep" style={{ gap: 12 }}>
                <T v="small">The numbers above already include today. Tell me today's totals so far, so tonight's log doesn't count them twice.</T>
                <NumberField label="Steps so far today" value={todaySteps} onChange={setTodaySteps} size="md" />
                <NumberField label="Flowers so far today" value={todayFlowers} onChange={setTodayFlowers} size="md" />
              </Card>
            ) : null}
          </View>
        );
      case 3:
        return (
          <View style={{ gap: 18 }}>
            <Title>What's the goal?</Title>
            <View>
              <T v="label" soft center style={{ marginBottom: 8 }}>
                Target level
              </T>
              <Stepper label="Target level" value={goalLevel} min={level + 1} max={BUNDLED_TABLE.maxLevel} onChange={setGoalLevel} />
            </View>
            <DateField label="Target date" value={goalDate} onChange={setGoalDate} minimumDate={fromKey(addDaysKey(today, 1))} error={goalErr && goalDate ? goalErr : null} />
            {goalDate && !goalErr ? (
              <Card variant="panel">
                <T v="h3" color={c.onPanel}>
                  That's {goalLevel - level} level{goalLevel - level === 1 ? '' : 's'} in {goalDays} day{goalDays === 1 ? '' : 's'}.
                </T>
                {preview && preview.status === 'ok' ? (
                  <T v="small" color={c.onPanelSoft} style={{ marginTop: 4 }}>
                    Roughly {fmt(roundNice(preview.avgStepsPerDay))} steps a day{preview.remaining.flowers > 0 ? ` and ${fmt(roundNice(preview.avgFlowersPerRideDay))} flowers per riding day` : ''}, before weather. I'll refine it once I know your seasons.
                  </T>
                ) : null}
              </Card>
            ) : null}
          </View>
        );
      case 4:
        return (
          <View style={{ gap: 18 }}>
            <Title sub="This is where the time maths comes from. Rough guesses are fine.">How fast do you move?</Title>
            {RATE_QUESTIONS.map((q) => {
              const r = rates[q.key];
              return (
                <View key={q.key} style={{ gap: 8 }}>
                  {r.unknown ? (
                    <View>
                      <T v="label" soft style={{ marginBottom: 6 }}>
                        {q.label}
                      </T>
                      <Card variant="deep" style={{ paddingVertical: 14 }}>
                        <T v="small">I'll use {fmt(DEFAULT_RATES[q.key])} for now and learn your real rate from your logs.</T>
                      </Card>
                    </View>
                  ) : (
                    <NumberField label={q.label} value={r.value} onChange={(v) => setRates((s) => ({ ...s, [q.key]: { ...s[q.key], value: v } }))} suffix={q.suffix} hint={q.why} size="md" />
                  )}
                  <Chip
                    label="I don't know yet"
                    icon={r.unknown ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    on={r.unknown}
                    onPress={() => setRates((s) => ({ ...s, [q.key]: { value: s[q.key].value ?? DEFAULT_RATES[q.key], unknown: !s[q.key].unknown } }))}
                  />
                </View>
              );
            })}
          </View>
        );
      case 5:
        return (
          <View style={{ gap: 14 }}>
            <Title sub="Can you get steps indoors, like a treadmill or walking at work?">Do you have indoor options?</Title>
            <Choice icon="walk" title="Yes, I can" text="I'll split each day's steps into the ones you get outside while planting, and the rest you can walk indoors." on={treadmill === true} onPress={() => setTreadmill(true)} />
            <Choice icon="pine-tree" title="No, steps come from outside" text="All your steps happen out of doors, so I'll count that time as outdoor time and tell you plainly if a day gets too long." on={treadmill === false} onPress={() => setTreadmill(false)} />
          </View>
        );
      case 6:
        return (
          <View style={{ gap: 14 }}>
            <Title sub="Planting needs you outside. Where do you usually walk and ride?">Where do you play?</Title>
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
                <T v="bodyBold">Days you'd realistically ride, by month</T>
                <MonthBars rates={manualRates} width={width - 48} height={90} />
                <SeasonSliders values={manualRates} onChange={setManualRates} />
                <PillButton
                  label="Use these"
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
                  label="Skip: treat every day as rideable"
                  variant="ghost"
                  onPress={() => {
                    setSeasons(null);
                    go(7);
                  }}
                />
                <PillButton label="Look up a place instead" variant="ghost" onPress={() => setPlaceMode('find')} />
              </View>
            ) : null}
            <T v="small" soft>
              This stops the app promising you a January you can't ride.
            </T>
          </View>
        );
      default:
        return <Done level={level} goalLevel={goalLevel} goalDate={goalDate} />;
    }
  })();

  const primary =
    step === 0
      ? { label: "Let's get set up", onPress: () => go(1) }
      : step === 6
        ? null
        : step === 7
          ? { label: saving ? 'Planting…' : 'Take me home', onPress: finish }
          : { label: 'Next', onPress: () => go(step + 1) };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 }}>
        {step > 0 && step < 7 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (step === 6 && placeMode === 'manual' && !seasons ? setPlaceMode('find') : go(step - 1))} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, minWidth: 44 }}>
            <Icon name="chevron-left" size={26} color={c.leafDeep} />
            <T v="bodyBold" color={c.leafDeep}>
              Back
            </T>
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
        {step > 0 && step < 7 ? <Seedling stage={step} size={64} /> : <View style={{ width: 64, height: 64 }} />}
        <View style={{ width: 70 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, flexGrow: 1 }}>
        <Animated.View key={step} entering={FadeIn.duration(260)} style={{ flex: 1 }}>
          {body}
        </Animated.View>
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 14, paddingTop: 8, gap: 14 }}>
        {primary ? <PillButton label={primary.label} onPress={primary.onPress} disabled={!canNext || saving} /> : null}
        <Dots step={step} />
        {step === 0 ? (
          <T v="caption" soft center>
            Unofficial fan-made planner. Not affiliated with Scopely, Nintendo or Pikmin Bloom.
          </T>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function Dots({ step }: { step: number }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel={`Step ${step + 1} of ${STEPS}`} style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
      {Array.from({ length: STEPS }, (_, i) => (
        <View key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i <= step ? c.leaf : c.leafPale }} />
      ))}
    </View>
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

function Choice({ icon, title, text, on, onPress }: { icon: IconName; title: string; text: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={title}
      accessibilityHint={text}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 14,
        padding: 18,
        borderRadius: radius.card,
        backgroundColor: on ? c.leafPale : c.card,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        boxShadow: on ? `0px 0px 0px 3px ${c.leaf}, 0px 6px 20px 0px ${c.shadow}` : `0px 6px 20px 0px ${c.shadow}`,
      })}
    >
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: on ? c.leaf : c.canvasDeep, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={28} color={on ? '#FFFFFF' : c.leafDeep} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T v="h3">{title}</T>
        <T v="small" soft>
          {text}
        </T>
      </View>
    </Pressable>
  );
}

function Done({ level, goalLevel, goalDate }: { level: number; goalLevel: number; goalDate: DayKey | null }) {
  const { width } = useWindowDimensions();
  return (
    <View style={{ alignItems: 'center', gap: 14, paddingTop: 24 }}>
      <View>
        <BloomFlower size={200} delay={50} />
        <PetalBurst trigger={1} width={200} height={200} originX={100} originY={110} />
      </View>
      <T v="h1" center>
        You're all set
      </T>
      <T v="h3" center soft>
        Level {level} → {goalLevel}
        {goalDate ? ` by ${fmtDate(goalDate)}` : ''}
      </T>
      <T v="body" center style={{ maxWidth: Math.min(360, width - 48) }}>
        Log your steps and flowers each evening. I'll keep the maths honest, flowers and all.
      </T>
    </View>
  );
}
