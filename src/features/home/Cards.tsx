import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { daysBetween, fromKey } from '@/engine/dates';
import { isEasyDay } from '@/engine/rhythm';
import { fmt, fmtDate, fmtHours, fmtShort, fmtWeekday, roundNice } from '@/engine/format';
import type { Dashboard } from '@/engine/summary';
import { cToF } from '@/engine/units';
import { useApp, useTempF } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { DifficultyFlower, DifficultyPill } from '@/features/shared/Difficulty';
import { QUEST_ICON } from '@/features/shared/quest';
import { PETALS } from '@/theme/tokens';
import { Card } from '@/ui/Card';
import { Icon, type IconName } from '@/ui/Icon';
import { IconChip } from '@/ui/IconChip';
import { FlowerRow } from '@/ui/skia/FlowerRow';
import { GameNumber } from '@/ui/skia/GameNumber';
import { LevelBadge } from '@/ui/skia/LevelBadge';
import { Ring } from '@/ui/skia/Ring';
import { T } from '@/ui/T';
import { useT } from '@/i18n';
import { taskText } from '@/i18n/level-text';

/** Header: current level in the gold badge, the goal beneath. Tap for the level table. */
export function HomeHeader({ dash }: { dash: Dashboard }) {
  const { c } = useTheme();
  const { t, tn } = useT();
  const goal = dash.phase === 'maxed' ? t('Level {level}. The very top.', { level: dash.current.level }) : t('→ {level} by {date}', { level: dash.goal.level, date: fmtDate(dash.goal.date) });
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', justifyContent: 'space-between' }}>
        <Pill icon="calendar-blank" text={`${fmtWeekday(dash.today)}, ${fmtShort(dash.today)}`} />
        <Pill icon="fire" text={dash.streak > 0 ? tn(dash.streak, '{n}-day streak', '{n}-day streak') : t('Start a streak')} tint={c.nectar} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Level {level}. Open the level table.', { level: dash.current.level })} onPress={() => router.push('/levels')} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <LevelBadge level={dash.current.level} size={118} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: 999, paddingLeft: dash.difficulty ? 8 : 18, paddingRight: 18, paddingVertical: 8, boxShadow: `0px 4px 14px 0px ${c.shadow}` }}>
        {/* The plan's flower: white when it's easy, then yellow, red, and blue for the hardest. */}
        {dash.difficulty ? <DifficultyFlower difficulty={dash.difficulty.level} size={30} backdrop={c.leafPale} /> : null}
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
  const { t } = useT();
  const { steps, flowers } = dash.rings;
  const hitSteps = !!dash.todayEntry && dash.todayGoal.steps > 0 && dash.todayEntry.steps >= dash.todayGoal.steps;
  const hitFlowers = !!dash.todayEntry && dash.todayGoal.flowersIfRiding > 0 && dash.todayEntry.flowers >= dash.todayGoal.flowersIfRiding;
  const next = dash.current.level + 1;
  const one = (kind: 'steps' | 'flowers', d: typeof steps, colors: [string, string], hit: boolean, icon: IconName) => {
    const label = kind === 'steps' ? t('Steps') : t('Flowers');
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
          accessibilityLabel={d.need === 0 ? (kind === 'steps' ? t('No steps needed for level {level}', { level: next }) : t('No flowers needed for level {level}', { level: next })) : t('{what}: {pct} percent, {n} to go', { what: label, pct, n: fmt(d.remaining) })}
        >
          <Icon name={icon} size={18} color={colors[0]} />
          <GameNumber value={pct} size={34} format={(n) => `${n}%`} outline={false} fill={c.leafDeep} />
        </Ring>
        <T v="smallBold" center>
          {d.need === 0 ? (kind === 'steps' ? t('No steps needed') : t('No flowers needed')) : done ? (kind === 'steps' ? t('Steps done!') : t('Flowers done!')) : t('{n} to go', { n: fmt(d.remaining) })}
        </T>
        <T v="caption" soft center>
          {d.need === 0 ? ' ' : kind === 'steps' ? t('of {n} steps', { n: fmt(d.need) }) : t('of {n} flowers', { n: fmt(d.need) })}
        </T>
      </View>
    );
  };
  return (
    <Card>
      <T v="h3" style={{ marginBottom: 12 }}>
        {t('Toward Level {level}', { level: next })}
      </T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {one('steps', steps, [c.leaf, c.teal], hitSteps, 'shoe-print')}
        {one('flowers', flowers, [c.petalRed, c.petalYellow], hitFlowers, 'flower')}
      </View>
      {dash.quest ? <QuestRow quest={dash.quest} /> : null}
    </Card>
  );
}

/** The level's quest (mushrooms, expeditions, ...): how far along, once the log has a count. */
function QuestRow({ quest }: { quest: NonNullable<Dashboard['quest']> }) {
  const { c } = useTheme();
  const { t } = useT();
  const fraction = quest.toGo == null ? null : Math.max(0, Math.min(1, (quest.count - quest.toGo) / Math.max(1, quest.count)));
  return (
    <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.canvasDeep, borderRadius: 18, padding: 12 }}>
      <IconChip name={QUEST_ICON[quest.kind]} />
      <View style={{ flex: 1, gap: 6 }}>
        <T v="smallBold">{taskText(quest.task)}</T>
        {fraction != null ? (
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.card, overflow: 'hidden' }}>
            <View style={{ width: `${fraction * 100}%`, height: '100%', borderRadius: 4, backgroundColor: c.leaf }} />
          </View>
        ) : null}
      </View>
      {quest.toGo === 0 ? (
        <Icon name="check-circle" size={26} color={c.leaf} />
      ) : quest.toGo != null ? (
        <T v="smallBold" color={c.leafDeep}>
          {t('{n} to go', { n: fmt(quest.toGo) })}
        </T>
      ) : null}
    </View>
  );
}

/** The verdict. */
export function PaceCard({ dash }: { dash: Dashboard }) {
  const { c, reduceMotion } = useTheme();
  const { t, tn } = useT();
  const st = dash.standing;
  const behind = dash.phase === 'active' && st.verdict === 'behind';
  // A continuous 0-1 clock while behind; the card breathes on a sine of it, so the loop is seamless.
  const breathe = useSharedValue(0);
  useEffect(() => {
    if (behind && !reduceMotion) breathe.value = withRepeat(withTiming(1, { duration: 4400, easing: Easing.linear }), -1, false);
    else {
      cancelAnimation(breathe);
      breathe.value = withTiming(0, { duration: 300 });
    }
  }, [behind, reduceMotion, breathe]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.01 * (1 - Math.cos(breathe.value * Math.PI * 2)) }] }));

  let icon: IconName = 'check-circle';
  let tone = c.leaf;
  let headline = t('Right on track.');
  let sub: string | null = null;
  const s = roundNice(dash.pace.stepsPerDay);
  const f = roundNice(dash.pace.flowersPerRideDay);
  if (dash.phase === 'goalReached') {
    icon = 'trophy';
    tone = c.nectar;
    const early = Math.max(0, daysBetween(dash.today, dash.goal.date));
    headline = t('You reached Level {level}!', { level: dash.current.level });
    sub = early > 0 ? tn(early, '{n} day before your goal date.', '{n} days before your goal date.') : null;
  } else if (dash.phase === 'maxed') {
    icon = 'crown';
    tone = c.nectar;
    headline = t('Level {level}. You finished the game.', { level: dash.current.level });
    sub = tn(dash.replay.days.length, '{n} day logged. Every step counted.', '{n} days logged. Every step counted.', { n: fmt(dash.replay.days.length) });
  } else if (dash.phase === 'datePassed') {
    icon = 'calendar-alert';
    tone = c.alert;
    headline = t('Your goal date has passed.');
    sub = t("You're at Level {level}.", { level: dash.current.level });
  } else if (dash.plan.status === 'noRideDays') {
    icon = 'weather-cloudy-alert';
    tone = c.alert;
    headline = t('No riding days left before the goal.');
    sub = t('Every month is set to 0% rideable. Adjust your months in Settings.');
  } else if (st.verdict === 'ahead') {
    icon = 'sprout';
    headline = tn(st.displayDays, "You're {n} day ahead. Blooming lovely.", "You're {n} days ahead. Blooming lovely.");
  } else if (st.verdict === 'behind') {
    icon = 'weather-partly-cloudy';
    tone = c.alert;
    headline = tn(st.displayDays, "You're {n} day behind.", "You're {n} days behind.");
    sub = t('{n} steps a day would catch you up.', { n: fmt(s) });
  } else if (dash.replay.days.length === 0) {
    icon = 'seed';
    headline = t('All planted and ready.');
    sub = t("Log your first day tonight to see how you're doing.");
  }
  const active = dash.phase === 'active' && dash.plan.status === 'ok';
  const note = [
    dash.pace.scale > 1.02
      ? dash.current.level >= 100
        ? t('Includes about {pct}% extra, because unused steps and flowers reset at each level-up.', { pct: Math.round((dash.pace.scale - 1) * 100) })
        : t('Includes about {pct}% extra, because unused flowers reset at each level-up.', { pct: Math.round((dash.pace.scale - 1) * 100) })
      : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Animated.View style={anim}>
      <Card variant="panel">
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <IconChip name={icon} size="lg" bg={tone} fg="#FFFFFF" />
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
            <Big value={s} label={t('steps a day')} />
            <Big value={f} label={dash.rates.bikes ? t('flowers per riding day') : t('flowers a day')} />
          </View>
        ) : null}
        {active && dash.difficulty ? (
          <View style={{ marginTop: 12 }}>
            <DifficultyPill d={dash.difficulty} onPanel />
          </View>
        ) : null}
        {active && note ? (
          <T v="caption" color={c.onPanelSoft} style={{ marginTop: 10 }}>
            {note}
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
/** Whether each Home card has anything to show: Home leaves out the rest, so the gaps stay even. */
export const showsWeekCard = (dash: Dashboard) => dash.week.length > 0;
export const showsTimeCard = (dash: Dashboard) => dash.phase === 'active' && dash.plan.status === 'ok';
export const showsMilestoneCard = (dash: Dashboard) => dash.phase === 'active' && (dash.replay.readyToLevel || (!!dash.nextMilestone && dash.plan.status === 'ok'));

export function TimeCard({ dash }: { dash: Dashboard }) {
  const { c } = useTheme();
  const { t } = useT();
  if (dash.phase !== 'active' || dash.plan.status !== 'ok') return null;
  const tc = dash.time;
  const today = dash.target.isToday;
  const walk = tc.walkHours > 0.01 ? (tc.walkWhere === 'indoor' ? t('{time} walking indoors', { time: fmtHours(tc.walkHours) }) : t('{time} walking outside', { time: fmtHours(tc.walkHours) })) : null;
  // A ride plants flowers but earns no steps, so the walking is the same either way.
  const ride =
    tc.bikeHours > 0.01
      ? walk
        ? t('About {bike} biking for the flowers, plus {walk} for the steps.', { bike: fmtHours(tc.bikeHours), walk })
        : t('About {bike} biking for the flowers.', { bike: fmtHours(tc.bikeHours) })
      : walk
        ? t('About {walk}.', { walk })
        : t('Nothing left to do.');
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <IconChip name="clock" />
        <T v="h3">{today ? t('Time It Takes Today') : t('Time It Takes Tomorrow')}</T>
      </View>
      {dash.rates.bikes ? (
        <>
          <Row icon="bike" title={today ? t('If You Ride Today') : t('If You Ride Tomorrow')} text={ride} />
          <Row icon={tc.walkWhere === 'indoor' ? 'walk' : 'pine-tree'} title={t("If You Don't")} text={walk ? t('About {walk}.', { walk }) : t('Nothing left to do.')} />
        </>
      ) : (
        // Walking only: the same walk earns the steps and plants the flowers.
        <Row icon={tc.walkWhere === 'indoor' ? 'walk' : 'pine-tree'} title={t('On Foot')} text={walk ? t('About {walk}, for the steps and the flowers together.', { walk }) : t('Nothing left to do.')} />
      )}
      {tc.implausible ? (
        <View style={{ marginTop: 8, backgroundColor: c.alertPale, borderRadius: 14, padding: 12 }}>
          <T v="small">{t("That's more than 6 hours of movement. A later goal date would make this a lot kinder.")}</T>
        </View>
      ) : null}
    </Card>
  );
}

function Row({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 6 }}>
      <IconChip name={icon} size="sm" />
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
  const { t, tn } = useT();
  const colors = PETALS(c);
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <T v="h3">{t('Streak')}</T>
        <T v="smallBold" color={c.leafDeep}>
          {tn(dash.streak, '{n} day', '{n} days')}
        </T>
      </View>
      <FlowerRow
        accessibilityLabel={t('Logged {n} of the last {total} days', { n: dash.recent.filter((d) => d.logged).length, total: dash.recent.length })}
        items={dash.recent.map((d, i) => (d.logged ? (colors[i % colors.length] === c.petalWhite ? c.petalPurple : colors[i % colors.length]) : null))}
      />
    </Card>
  );
}

/** The forecast's look for a day: what matters most for the plan first. */
function dayIcon(d: Dashboard['week'][number], bikes: boolean): IconName {
  const v = d.walk === 'good' && bikes && d.ride && d.ride !== 'good' ? d.ride : d.walk;
  if (v === 'hot') return 'thermometer-high';
  if (v === 'storm') return 'weather-lightning-rainy';
  if (v === 'snow') return 'weather-snowy';
  if (v === 'wet') return 'weather-pouring';
  if (v === 'wind') return 'weather-windy';
  if (v === 'cold') return 'snowflake';
  if ((d.code ?? 0) >= 51) return 'weather-rainy';
  if ((d.code ?? 0) >= 45) return 'weather-fog';
  if ((d.code ?? 0) >= 2) return 'weather-partly-cloudy';
  return 'weather-sunny';
}

const kNum = (n: number) => (n >= 9500 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n / 10) * 10));

/** The week ahead: each day's weather and what the plan asks of it, so a lighter or heavier day makes sense. */
export function WeekCard({ dash }: { dash: Dashboard }) {
  const { c } = useTheme();
  const { t } = useT();
  const bikes = dash.rates.bikes;
  const hasWeather = dash.week.some((d) => d.walk != null);
  const f = useTempF();
  const rhythm = useApp((s) => s.settings.plan);
  return (
    <Card style={{ gap: 12 }}>
      <T v="h3">{t('The Week Ahead')}</T>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {dash.week.map((d, i) => {
          const poor = d.walk != null && d.walk !== 'good';
          return (
            <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: 14, backgroundColor: i === 0 ? c.leafPale : 'transparent' }}>
              <T v="caption" soft={i !== 0} style={i === 0 ? { color: c.leafDeep, fontWeight: '800' } : undefined}>
                {fmtWeekday(d.date)}
              </T>
              {/* An easy day: a leaf, and less asked of it. */}
              <View style={{ height: 12, justifyContent: 'center' }} accessible={isEasyDay(rhythm, fromKey(d.date))} accessibilityLabel={t('Easy day')}>
                {isEasyDay(rhythm, fromKey(d.date)) ? <Icon name="leaf" size={12} color={c.leaf} /> : null}
              </View>
              {hasWeather ? <Icon name={d.walk != null ? dayIcon(d, bikes) : 'minus'} size={22} color={poor ? c.alert : c.leafDeep} /> : null}
              {hasWeather ? (
                <T v="caption" soft>
                  {d.feels != null ? `${Math.round(f ? cToF(d.feels) : d.feels)}°` : ' '}
                </T>
              ) : null}
              {d.logged ? <Icon name="check-circle" size={18} color={c.leaf} /> : null}
              <T v="smallBold" color={c.teal}>
                {kNum(d.steps)}
              </T>
              {d.flowers >= 1 || (bikes && d.ride != null) ? (
                <T v="caption" color={c.petalRed}>
                  {d.flowers >= 1 ? kNum(d.flowers) : '–'}
                </T>
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="shoe-print" size={14} color={c.teal} />
          <T v="caption" soft>
            {t('steps')}
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="flower" size={14} color={c.petalRed} />
          <T v="caption" soft>
            {t('flowers')}
          </T>
        </View>
      </View>
      {hasWeather ? null : (
        <Pressable accessibilityRole="button" onPress={() => router.push('/location')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40 }}>
          <Icon name="weather-partly-cloudy" size={18} color={c.leafDeep} />
          <T v="smallBold" color={c.leafDeep}>
            {t('Add where you play to see its weather here')}
          </T>
        </Pressable>
      )}
    </Card>
  );
}

/** "Level 111 in about 12 days." */
export function MilestoneCard({ dash }: { dash: Dashboard }) {
  const { t, tn } = useT();
  if (dash.phase !== 'active') return null;
  const next = dash.current.level + 1;
  let text: string;
  let sub: string | null = null;
  if (dash.replay.readyToLevel) {
    text = t('Level {level} is ready: everything is cleared.', { level: next });
    sub = t("Claim it in the game, then mark it in today's log.");
  } else if (dash.nextMilestone && dash.plan.status === 'ok') {
    const days = Math.max(0, daysBetween(dash.today, dash.nextMilestone.date));
    text = days === 0 ? t('Level {level} could land today.', { level: next }) : tn(days, 'Level {level} in about {n} day.', 'Level {level} in about {n} days.', { level: next });
    sub = t('Around {date}, at the planned pace.', { date: fmtDate(dash.nextMilestone.date) });
  } else return null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconChip name="flag-variant" size="lg" />
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
