import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { daysBetween } from '@/engine/dates';
import { fmt, fmtDate, fmtHours, fmtShort, fmtWeekday, roundNice } from '@/engine/format';
import type { Dashboard } from '@/engine/summary';
import { useTheme } from '@/theme/theme';
import { PETALS, SPRING } from '@/theme/tokens';
import { Card } from '@/ui/Card';
import { Icon, type IconName } from '@/ui/Icon';
import { GameNumber } from '@/ui/skia/GameNumber';
import { LevelBadge } from '@/ui/skia/LevelBadge';
import { Ring } from '@/ui/skia/Ring';
import { T } from '@/ui/T';

/** Header: current level in the gold badge, the goal beneath. Tap for the level table. */
export function HomeHeader({ dash }: { dash: Dashboard }) {
  const { c } = useTheme();
  const goal = dash.phase === 'maxed' ? 'Level 130. The very top.' : `→ ${dash.goal.level} by ${fmtDate(dash.goal.date)}`;
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', justifyContent: 'space-between' }}>
        <Pill icon="calendar-blank" text={`${fmtWeekday(dash.today)}, ${fmtShort(dash.today)}`} />
        <Pill icon="fire" text={dash.streak > 0 ? `${dash.streak}-day streak` : 'Start a streak'} tint={c.nectar} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Level ${dash.current.level}. Open the level table.`} onPress={() => router.push('/levels')} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <LevelBadge level={dash.current.level} size={118} />
      </Pressable>
      <View style={{ backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8, boxShadow: `0px 4px 14px 0px ${c.shadow}` }}>
        <T v="h3" color={c.leafDeep}>
          {goal}
        </T>
      </View>
    </View>
  );
}

function Pill({ icon, text, tint }: { icon: IconName; text: string; tint?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, boxShadow: `0px 4px 12px 0px ${c.shadow}` }}>
      <Icon name={icon} size={18} color={tint ?? c.leafDeep} />
      <T v="smallBold">{text}</T>
    </View>
  );
}

/** Steps and flowers into the current level. */
export function RingsCard({ dash }: { dash: Dashboard }) {
  const { c } = useTheme();
  const { steps, flowers } = dash.rings;
  const hitSteps = !!dash.todayEntry && dash.todayGoal.steps > 0 && dash.todayEntry.steps >= dash.todayGoal.steps;
  const hitFlowers = !!dash.todayEntry && dash.todayGoal.flowersIfRiding > 0 && dash.todayEntry.flowers >= dash.todayGoal.flowersIfRiding;
  const next = dash.current.level + 1;
  const one = (label: string, d: typeof steps, colors: [string, string], hit: boolean, icon: IconName) => {
    const pct = Math.floor(d.fraction * 100);
    const done = d.need === 0 || d.remaining === 0;
    return (
      <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
        <Ring
          fraction={d.fraction}
          size={142}
          thickness={16}
          colors={colors}
          celebrate={hit}
          accessibilityLabel={d.need === 0 ? `No ${label} needed for level ${next}` : `${label}: ${pct} percent, ${fmt(d.remaining)} to go`}
        >
          <Icon name={icon} size={18} color={colors[0]} />
          <GameNumber value={pct} size={34} format={(n) => `${n}%`} outline={false} fill={c.leafDeep} />
        </Ring>
        <T v="smallBold" center>
          {d.need === 0 ? `No ${label} needed` : done ? `${label[0].toUpperCase()}${label.slice(1)} done!` : `${fmt(d.remaining)} to go`}
        </T>
        <T v="caption" soft center>
          {d.need === 0 ? ' ' : `of ${fmt(d.need)} ${label}`}
        </T>
      </View>
    );
  };
  return (
    <Card>
      <T v="h3" style={{ marginBottom: 12 }}>
        Toward Level {next}
      </T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {one('steps', steps, [c.leaf, c.teal], hitSteps, 'shoe-print')}
        {one('flowers', flowers, [c.petalRed, c.petalYellow], hitFlowers, 'flower')}
      </View>
    </Card>
  );
}

/** The verdict. */
export function PaceCard({ dash }: { dash: Dashboard }) {
  const { c, reduceMotion } = useTheme();
  const st = dash.standing;
  const behind = dash.phase === 'active' && st.verdict === 'behind';
  const breathe = useSharedValue(1);
  useEffect(() => {
    if (behind && !reduceMotion) breathe.value = withRepeat(withTiming(1.02, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
    else {
      cancelAnimation(breathe);
      breathe.value = withSpring(1, SPRING);
    }
  }, [behind, reduceMotion, breathe]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));

  let icon: IconName = 'check-circle';
  let tone = c.leaf;
  let headline = 'Right on track.';
  let sub: string | null = null;
  const s = roundNice(dash.pace.stepsPerDay);
  const f = roundNice(dash.pace.flowersPerRideDay);
  if (dash.phase === 'goalReached') {
    icon = 'trophy';
    tone = c.nectar;
    const early = Math.max(0, daysBetween(dash.today, dash.goal.date));
    headline = `You reached Level ${dash.current.level}!`;
    sub = early > 0 ? `${early} day${early === 1 ? '' : 's'} before your goal date. Set a new goal in Settings whenever you like.` : 'Set a new goal in Settings whenever you like.';
  } else if (dash.phase === 'maxed') {
    icon = 'crown';
    tone = c.nectar;
    headline = 'Level 130. You finished the game.';
    sub = `${fmt(dash.replay.days.length)} days logged. Every step counted.`;
  } else if (dash.phase === 'datePassed') {
    icon = 'calendar-alert';
    tone = c.alert;
    headline = 'Your goal date has passed.';
    sub = `You're at Level ${dash.current.level}. Pick a new date in Settings and I'll replan.`;
  } else if (dash.plan.status === 'noRideDays') {
    icon = 'weather-cloudy-alert';
    tone = c.alert;
    headline = 'No riding days left before the goal.';
    sub = 'Every month is set to 0% rideable. Adjust your months in Settings.';
  } else if (st.verdict === 'ahead') {
    icon = 'sprout';
    headline = `You're ${st.displayDays} day${st.displayDays === 1 ? '' : 's'} ahead. Nice.`;
  } else if (st.verdict === 'behind') {
    icon = 'weather-partly-cloudy';
    tone = c.alert;
    headline = `You're ${st.displayDays} day${st.displayDays === 1 ? '' : 's'} behind.`;
    sub = `Need ${fmt(s)} steps a day to recover.`;
  } else if (dash.replay.days.length === 0) {
    icon = 'seed';
    headline = 'Ready when you are.';
    sub = "Log your first day tonight and I'll tell you how you're doing.";
  }
  const active = dash.phase === 'active' && dash.plan.status === 'ok';
  const bindingText =
    dash.pace.binding === 'flowers' ? 'Flowers set the pace on this level.' : dash.pace.binding === 'steps' ? 'Steps set the pace on this level.' : null;
  return (
    <Animated.View style={anim}>
      <Card variant="panel">
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={26} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <T v="h2" color={c.onPanel} accessibilityRole="header">
              {headline}
            </T>
            {sub ? (
              <T v="small" color={c.onPanelSoft}>
                {sub}
              </T>
            ) : null}
          </View>
        </View>
        {active ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Big value={s} label="steps a day" />
            <Big value={f} label="flowers per riding day" />
          </View>
        ) : null}
        {active ? (
          <T v="caption" color={c.onPanelSoft} style={{ marginTop: 10 }}>
            {[bindingText, dash.pace.scale > 1.02 ? `Includes about ${Math.round((dash.pace.scale - 1) * 100)}% extra, because unused ${dash.current.level >= 100 ? 'steps and flowers' : 'flowers'} reset at each level-up.` : null].filter(Boolean).join(' ')}
          </T>
        ) : null}
      </Card>
    </Animated.View>
  );
}

function Big({ value, label }: { value: number; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.panelTrack, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12 }}>
      <GameNumber value={value} size={value >= 100000 ? 32 : 40} />
      <T v="smallBold" color={c.onPanelSoft}>
        {label}
      </T>
    </View>
  );
}

/** How much movement today's targets imply. */
export function TimeCard({ dash }: { dash: Dashboard }) {
  const { c } = useTheme();
  if (dash.phase !== 'active' || dash.plan.status !== 'ok') return null;
  const t = dash.time;
  const where = t.walkWhere === 'indoor' ? 'walking indoors' : 'walking outside';
  const day = dash.target.isToday ? 'today' : 'tomorrow';
  const ride =
    t.bikeHours > 0
      ? `About ${fmtHours(t.bikeHours)} biking${t.walkHoursRideDay > 0.01 ? ` + ${fmtHours(t.walkHoursRideDay)} ${where}` : ''}.`
      : `About ${fmtHours(t.walkHoursRideDay)} ${where}.`;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon name="clock-outline" size={20} color={c.leafDeep} />
        <T v="h3">Time it takes {day}</T>
      </View>
      <Row icon="bike" title={`If you ride ${day}`} text={ride} />
      <Row icon={t.walkWhere === 'indoor' ? 'walk' : 'pine-tree'} title="If you don't" text={`About ${fmtHours(t.walkHoursRestDay)} ${where}.`} />
      {t.implausible ? (
        <View style={{ marginTop: 8, backgroundColor: c.alertPale, borderRadius: 14, padding: 12 }}>
          <T v="small">That's more than 6 hours of movement. A later goal date would make this a lot kinder.</T>
        </View>
      ) : null}
      {dash.rates.estimated.length > 0 ? (
        <T v="caption" soft style={{ marginTop: 8 }}>
          Using typical rates for now. Log a few days and I'll work out your real ones.
        </T>
      ) : null}
    </Card>
  );
}

function Row({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 6 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.leafPale, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={c.leafDeep} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="smallBold">{title}</T>
        <T v="small" soft>
          {text}
        </T>
      </View>
    </View>
  );
}

/** Consecutive days logged: a row of small flowers. */
export function StreakCard({ dash }: { dash: Dashboard }) {
  const { c } = useTheme();
  const colors = PETALS(c);
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <T v="h3">Streak</T>
        <T v="smallBold" color={c.leafDeep}>
          {dash.streak} day{dash.streak === 1 ? '' : 's'}
        </T>
      </View>
      <View accessible accessibilityLabel={`Logged ${dash.recent.filter((d) => d.logged).length} of the last ${dash.recent.length} days`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {dash.recent.map((d, i) => (
          <View key={d.date} style={{ alignItems: 'center', gap: 2 }}>
            <Icon name={d.logged ? 'flower' : 'flower-outline'} size={20} color={d.logged ? colors[i % colors.length] === c.petalWhite ? c.petalPurple : colors[i % colors.length] : c.inkSoft + '66'} />
          </View>
        ))}
      </View>
    </Card>
  );
}

/** "Level 111 in about 12 days." */
export function MilestoneCard({ dash }: { dash: Dashboard }) {
  const { c } = useTheme();
  if (dash.phase !== 'active') return null;
  const next = dash.current.level + 1;
  let text: string;
  let sub: string | null = null;
  if (dash.replay.readyToLevel) {
    text = `Level ${next} is ready: both targets met.`;
    sub = 'Claim it in the game, then tell me today.';
  } else if (dash.nextMilestone && dash.plan.status === 'ok') {
    const days = Math.max(0, daysBetween(dash.today, dash.nextMilestone.date));
    text = days === 0 ? `Level ${next} could land today.` : `Level ${next} in about ${days} day${days === 1 ? '' : 's'}.`;
    sub = `Around ${fmtDate(dash.nextMilestone.date)}, at the planned pace.`;
  } else return null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.leafPale, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="flag-variant" size={24} color={c.leafDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="h3">{text}</T>
          {sub ? (
            <T v="small" soft>
              {sub}
            </T>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
