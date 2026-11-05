import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { addDaysKey, fromKey, type DayKey } from '@/engine/dates';
import { fmt, fmtLongDay, roundNice } from '@/engine/format';
import { doneFromToGo, looksLikeLevelUp, missedDay, rebalanceNext, stateBefore } from '@/engine/leftLog';
import { questOf } from '@/engine/quest';
import type { Dashboard } from '@/engine/summary';
import type { DayEntry, OutMode } from '@/engine/types';
import { QUEST_ICON, questToGoLabel } from '@/features/shared/quest';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { Card } from '@/ui/Card';
import { DateField } from '@/ui/DateField';
import { Icon, type IconName } from '@/ui/Icon';
import { NumberField } from '@/ui/NumberField';
import { PillButton } from '@/ui/PillButton';
import { Segmented } from '@/ui/Segmented';
import { PetalBurst } from '@/ui/skia/PetalBurst';
import { Stepper } from '@/ui/Stepper';
import { T } from '@/ui/T';
import { Toggle } from '@/ui/Toggle';
import { useT } from '@/i18n';
import { taskText } from '@/i18n/level-text';

interface Props {
  dash: Dashboard;
  /** Open the editor with "I levelled up" switched on (from the "did you level up?" prompt). */
  levelUpRequest: number;
}

/** The primary interaction: log today (or fill in a missed day). */
export function TodayCard({ dash, levelUpRequest }: Props) {
  const [day, setDay] = useState<DayKey | null>(null);
  const date = day ?? dash.today;
  // A fresh editor for each day, filled from that day's entry.
  return <DayCard key={date} dash={dash} date={date} levelUpRequest={day ? 0 : levelUpRequest} onPickDay={(k) => setDay(k === dash.today ? null : k)} />;
}

function DayCard({ dash, date, levelUpRequest, onPickDay }: Props & { date: DayKey; onPickDay: (k: DayKey) => void }) {
  const { c } = useTheme();
  const { t } = useT();
  const save = useApp((s) => s.saveEntry);
  const profile = useApp((s) => s.profile);
  const entries = useApp((s) => s.entries);
  // The top level the game has right now (130 today; more as they're released).
  const maxLevel = useApp((s) => s.table.maxLevel);
  // What's Left: the numbers come from the game's level-up screen, not a step counter.
  const left = useApp((s) => s.settings.logMode) === 'left';
  const isToday = date === dash.today;
  const existing = isToday ? dash.todayEntry : (entries.find((e) => e.date === date) ?? null);
  // Where the log stood before this day, so editing a level-up day keeps the right baseline.
  const { state: before, taskToGo: taskBefore } = profile ? stateBefore(dash.replay, profile, date) : { state: dash.current, taskToGo: null };
  const baseLevel = before.level;

  const [editing, setEditing] = useState(!existing);
  const [steps, setSteps] = useState<number | null>(existing?.steps ?? null);
  const [flowers, setFlowers] = useState<number | null>(existing?.flowers ?? null);
  const [leveled, setLeveled] = useState(existing?.leveledUp ?? false);
  const [newLevel, setNewLevel] = useState(existing?.newLevel ?? baseLevel + 1);
  const [more, setMore] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(existing?.minutesOut ?? null);
  const [mode, setMode] = useState<OutMode>(existing?.outMode ?? 'bike');
  const [syncSteps, setSyncSteps] = useState<number | null>(existing?.gameStepsToGo ?? null);
  const [syncFlowers, setSyncFlowers] = useState<number | null>(existing?.gameFlowersToGo ?? null);
  const [questLeft, setQuestLeft] = useState<number | null>(existing?.gameTaskToGo ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [askLevelUp, setAskLevelUp] = useState(false);
  const [burst, setBurst] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0, bx: 0, by: 0 });

  // 'Yes, levelled up' from the Home prompt: open the editor with the toggle on.
  const [seenRequest, setSeenRequest] = useState(levelUpRequest);
  if (levelUpRequest !== seenRequest) {
    setSeenRequest(levelUpRequest);
    if (levelUpRequest > 0) {
      setEditing(true);
      setLeveled(true);
      setNewLevel(baseLevel + 1);
    }
  }

  // The level the numbers to go are for: the next one, or the one after a level-up that day.
  const forLevel = (leveled ? newLevel : baseLevel) + 1;
  const forReq = dash.req(forLevel);
  const quest = questOf(forReq?.task);
  const leftMode = left && !!forReq;
  // This level's steps already cleared: the game shows nothing to go, so ask for the day's steps
  // instead (up to level 100 they pile up toward the next level). A level-up brings steps to go back.
  const stepsToday = leftMode && !leveled && !!forReq && forReq.steps > 0 && before.steps >= forReq.steps;
  // Every box filled (0 is fine); a seedling is a yes/no, so it is never empty.
  const questFilled = !quest || quest.kind === 'seedling' || questLeft != null;
  const canLog = (leftMode ? ((forReq?.steps ?? 0) <= 0 || (stepsToday ? steps != null : syncSteps != null)) && ((forReq?.flowers ?? 0) <= 0 || syncFlowers != null) : steps != null && flowers != null) && questFilled;
  // Numbers to go fit within this level or the next (the game may already be on the next one).
  const maxToGo = (kind: 'steps' | 'flowers') => Math.max(forReq?.[kind] ?? 0, dash.req(forLevel + 1)?.[kind] ?? 0);
  const missed = profile && isToday ? missedDay(entries, profile.startDate, dash.today, addDaysKey) : null;

  const submit = async (o: { check?: boolean } = {}) => {
    const up = leveled;
    if (!up && o.check !== false && looksLikeLevelUp(before, taskBefore, dash.req, { steps: stepsToday ? null : syncSteps, flowers: syncFlowers, task: quest ? questLeft : null })) {
      setAskLevelUp(true);
      return;
    }
    const toLevel = up ? newLevel : baseLevel;
    // The setup day's log counts from the start of the day, like a step counter.
    const setupDay = date === profile?.startDate;
    const done = (kind: 'steps' | 'flowers', toGo: number | null, fallback: number) => (toGo == null ? fallback : doneFromToGo(before, toLevel, kind, toGo, dash.req) + (setupDay ? (kind === 'steps' ? profile.setupTodaySteps : profile.setupTodayFlowers) : 0));
    const entry: DayEntry = {
      date,
      steps: leftMode && !stepsToday ? done('steps', syncSteps, existing?.steps ?? 0) : (steps ?? 0),
      flowers: leftMode ? done('flowers', syncFlowers, existing?.flowers ?? 0) : (flowers ?? 0),
      leveledUp: up,
      newLevel: up ? newLevel : null,
      note: note.trim() ? note.trim() : null,
      minutesOut: minutes,
      outMode: minutes ? mode : null,
      // Numbers to go belong to a next level; at the top level there is none.
      gameStepsToGo: forReq && !stepsToday ? syncSteps : null,
      gameFlowersToGo: forReq ? syncFlowers : null,
      gameTaskToGo: questOf(dash.req(toLevel + 1)?.task) ? (questLeft ?? (quest?.kind === 'seedling' ? 1 : null)) : null,
    };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBurst((b) => b + 1);
    await save(entry);
    // A filled-in day takes its share out of the next logged day's worked-out steps and flowers.
    const next = leftMode && !isToday ? rebalanceNext(entries, entry, existing) : null;
    if (next) await save(next);
    setAskLevelUp(false);
    setEditing(false);
    setMore(false);
  };

  const tg = dash.target;
  const cg = dash.custom;
  const targetLine =
    isToday && cg && !cg.reached && !cg.passed && !dash.loggedToday
      ? t("Today's target: {steps} steps · {flowers} flowers", { steps: fmt(roundNice(cg.stepsPerDay)), flowers: fmt(roundNice(cg.flowersPerDay)) })
      : isToday && tg.isToday && dash.phase === 'active' && dash.plan.status === 'ok'
        ? tg.flowersIfRiding > 0
          ? dash.rates.bikes
            ? t("Today's target: {steps} steps · {flowers} flowers if you ride", { steps: fmt(roundNice(tg.steps)), flowers: fmt(roundNice(tg.flowersIfRiding)) })
            : t("Today's target: {steps} steps · {flowers} flowers", { steps: fmt(roundNice(tg.steps)), flowers: fmt(roundNice(tg.flowersIfRiding)) })
          : t("Today's target: {steps} steps", { steps: fmt(roundNice(tg.steps)) })
        : null;
  // The forecast cut today down: say why, so a smaller target makes sense.
  const wt = dash.weather?.today;
  const rideBad = dash.rates.bikes && wt && wt.ride !== 'good';
  const weatherLine: { icon: IconName; text: string } | null = !wt
    ? null
    : wt.walk === 'hot'
      ? { icon: 'thermometer-high', text: t('Too hot for a long walk today, so the plan asks for less.') }
      : wt.walk !== 'good'
        ? { icon: 'weather-pouring', text: t('Rough weather today, so the plan asks for less walking.') }
        : rideBad
          ? { icon: wt.ride === 'hot' ? 'thermometer-high' : 'weather-rainy', text: t('Not a riding day: the flowers move to better days.') }
          : null;
  const shownQuest = questOf(dash.req((existing?.leveledUp ? (existing.newLevel ?? baseLevel + 1) : baseLevel) + 1)?.task);
  const questBox = existing?.gameTaskToGo != null && shownQuest && shownQuest.kind !== 'seedling' ? <Logged icon={QUEST_ICON[shownQuest.kind]} value={existing.gameTaskToGo} label={questToGoLabel(shownQuest.kind)} color={c.leafDeep} /> : null;

  return (
    <Card style={{ overflow: 'visible' }}>
      <View onLayout={(e) => setSize((s) => ({ ...s, w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }))}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <T v="h2" accessibilityRole="header" style={{ flexShrink: 1 }}>
            {isToday ? t('Today') : fmtLongDay(date)}
          </T>
          {isToday ? (
            <T v="smallBold" soft>
              {fmtLongDay(date)}
            </T>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => onPickDay(dash.today)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
              <Icon name="arrow-left" size={18} color={c.leafDeep} />
              <T v="smallBold" color={c.leafDeep}>
                {t('Back to Today')}
              </T>
            </Pressable>
          )}
        </View>
        {!editing && existing ? (
          <View style={{ gap: 12 }}>
            {left && (existing.gameStepsToGo != null || existing.gameFlowersToGo != null || existing.gameTaskToGo != null) ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {existing.gameStepsToGo != null ? <Logged icon="shoe-print" value={existing.gameStepsToGo} label={t('Steps to go')} color={c.teal} /> : <Logged icon="shoe-print" value={existing.steps} label={t('steps')} color={c.teal} />}
                {existing.gameFlowersToGo != null ? <Logged icon="flower" value={existing.gameFlowersToGo} label={t('Flowers to go')} color={c.petalRed} /> : null}
                {questBox}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Logged icon="shoe-print" value={existing.steps} label={t('steps')} color={c.teal} />
                <Logged icon="flower" value={existing.flowers} label={t('flowers')} color={c.petalRed} />
                {questBox}
              </View>
            )}
            {existing.leveledUp ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="party-popper" size={20} color={c.nectar} />
                <T v="bodyBold">{t('Levelled up to {level}', { level: existing.newLevel ?? '' })}</T>
              </View>
            ) : null}
            <PillButton label={isToday ? t('Edit today') : t('Edit this day')} variant="secondary" icon="pencil" size="md" onPress={() => setEditing(true)} />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {!isToday && profile ? <DateField label={t('Day')} value={date} onChange={onPickDay} minimumDate={fromKey(profile.startDate)} maximumDate={fromKey(dash.today)} /> : null}
            {targetLine ? (
              <T v="small" soft>
                {targetLine}
              </T>
            ) : null}
            {isToday && weatherLine ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name={weatherLine.icon} size={18} color={c.leafDeep} />
                <T v="small" soft style={{ flex: 1 }}>
                  {weatherLine.text}
                </T>
              </View>
            ) : null}
            {leftMode && forReq ? (
              <>
                <T v="smallBold" soft>
                  {t('Toward Level {level}', { level: forLevel })}
                </T>
                {forReq.steps > 0 ? (
                  stepsToday ? (
                    <NumberField label={isToday ? t('Steps today') : t('Steps that day')} value={steps} onChange={setSteps} size="xl" />
                  ) : (
                    <NumberField label={t('Steps to go')} value={syncSteps} onChange={setSyncSteps} size="xl" max={maxToGo('steps')} />
                  )
                ) : null}
                {forReq.flowers > 0 ? <NumberField label={t('Flowers to go')} value={syncFlowers} onChange={setSyncFlowers} size="xl" max={maxToGo('flowers')} /> : null}
              </>
            ) : (
              <>
                <NumberField label={isToday ? t('Steps today') : t('Steps that day')} value={steps} onChange={setSteps} size="xl" />
                <NumberField label={isToday ? t('Flowers today') : t('Flowers that day')} value={flowers} onChange={setFlowers} size="xl" />
              </>
            )}
            {/* The level's quest (mushrooms, expeditions, ...): the count the game shows still to go. */}
            {forReq && quest?.kind === 'seedling' ? (
              <Toggle label={questToGoLabel('seedling')} hint={taskText(forReq.task)} value={questLeft === 0} onChange={(b) => setQuestLeft(b ? 0 : 1)} />
            ) : forReq && quest ? (
              <NumberField label={questToGoLabel(quest.kind)} hint={taskText(forReq.task)} value={questLeft} onChange={setQuestLeft} size="lg" max={quest.count} />
            ) : null}
            <Toggle label={t('Levelled Up!')} value={leveled} onChange={setLeveled} hint={leveled ? t('The level the game shows now.') : undefined} />
            {leveled ? (
              <View style={{ gap: 8 }}>
                <Stepper label={t('New level')} value={newLevel} min={Math.min(maxLevel, baseLevel + 1)} max={maxLevel} onChange={setNewLevel} size={56} />
                <T v="caption" soft center>
                  {newLevel > 100 ? t('Flowers start again from zero for the new level, and so do steps.') : t('Flowers start again from zero for the new level.')}
                </T>
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setMore((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
              <Icon name={more ? 'chevron-down' : 'chevron-right'} size={22} color={c.leafDeep} />
              <T v="smallBold" color={c.leafDeep}>
                {t('More (optional)')}
              </T>
            </Pressable>
            {more ? (
              <View style={{ gap: 14 }}>
                <NumberField label={t('Minutes out planting')} value={minutes} onChange={setMinutes} size="md" hint={t('Helps work out your real planting rate.')} max={1440} />
                {minutes ? (
                  <Segmented
                    label={t('Mostly')}
                    value={mode}
                    onChange={setMode}
                    options={[
                      { key: 'bike', label: t('Mostly biking') },
                      { key: 'walk', label: t('Mostly walking') },
                    ]}
                  />
                ) : null}
                {/* Matching the game is the whole of the What's Left log; this is for the daily one. */}
                {leftMode ? null : (
                  <Card variant="deep" style={{ gap: 10 }}>
                    <T v="smallBold">{t('Match the game')}</T>
                    <T v="caption" soft>
                      {leveled ? t('If your profile shows different numbers to go for Level {level}, enter them here to replace the estimate.', { level: newLevel + 1 }) : t('If your profile shows different numbers to go, enter them here to replace the estimate.')}
                    </T>
                    <NumberField label={t('Steps to go')} value={syncSteps} onChange={setSyncSteps} size="md" />
                    <NumberField label={t('Flowers to go')} value={syncFlowers} onChange={setSyncFlowers} size="md" />
                  </Card>
                )}
                <View>
                  <T v="label" soft style={{ marginBottom: 6 }}>
                    {t('Note')}
                  </T>
                  <TextInput
                    accessibilityLabel={t('Note')}
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('Big Flower day, rainy walk…')}
                    placeholderTextColor={c.inkSoft + '99'}
                    multiline
                    maxLength={280}
                    style={{ minHeight: 52, borderRadius: radius.field, backgroundColor: c.canvasDeep, padding: 14, fontFamily: font.body, fontSize: 16, color: c.ink }}
                  />
                </View>
              </View>
            ) : null}
            {askLevelUp && !leveled ? (
              // The numbers to go went up: usually the game has moved on to the next level.
              <Card variant="deep" style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="party-popper" size={22} color={c.nectar} />
                  <T v="bodyBold" style={{ flex: 1 }}>
                    {t('More to go than before. Did you level up?')}
                  </T>
                </View>
                <PillButton
                  label={t('Yes, levelled up')}
                  icon="party-popper"
                  size="md"
                  onPress={() => {
                    setLeveled(true);
                    setNewLevel(baseLevel + 1);
                    setAskLevelUp(false);
                  }}
                />
                <PillButton label={t('No, save as is')} variant="ghost" size="md" onPress={() => void submit({ check: false })} />
              </Card>
            ) : (
              <View onLayout={(e) => setSize((s) => ({ ...s, bx: e.nativeEvent.layout.x + e.nativeEvent.layout.width / 2, by: e.nativeEvent.layout.y + 20 }))}>
                <PillButton label={existing ? t('Save changes') : isToday ? t('Log today') : t('Log this day')} icon="sprout" onPress={() => void submit()} disabled={!canLog} haptic={false} />
              </View>
            )}
            {existing ? <PillButton label={t('Cancel')} variant="ghost" size="sm" onPress={() => setEditing(false)} /> : null}
          </View>
        )}
        {missed ? (
          <Pressable accessibilityRole="button" onPress={() => onPickDay(missed)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: 6 }}>
            <Icon name="calendar-plus" size={20} color={c.leafDeep} />
            <T v="smallBold" color={c.leafDeep}>
              {entries.some((e) => e.date === missed) ? t('Edit an Earlier Day') : t('Fill In a Missed Day')}
            </T>
          </Pressable>
        ) : null}
      </View>
      <PetalBurst trigger={burst} width={size.w + 36} height={size.h + 36} originX={size.bx + 18} originY={size.by + 18} />
    </Card>
  );
}

function Logged({ icon, value, label, color }: { icon: IconName; value: number; label: string; color: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.canvasDeep, borderRadius: 18, padding: 14, gap: 2 }}>
      <Icon name={icon} size={20} color={color} />
      <T v="h2" color={c.leafDeep}>
        {fmt(value)}
      </T>
      <T v="caption" soft>
        {label}
      </T>
    </View>
  );
}
