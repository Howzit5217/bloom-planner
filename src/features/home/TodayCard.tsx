import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { fmt, fmtLongDay, roundNice } from '@/engine/format';
import type { Dashboard } from '@/engine/summary';
import type { DayEntry, OutMode } from '@/engine/types';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { NumberField } from '@/ui/NumberField';
import { PillButton } from '@/ui/PillButton';
import { Segmented } from '@/ui/Segmented';
import { PetalBurst } from '@/ui/skia/PetalBurst';
import { Stepper } from '@/ui/Stepper';
import { T } from '@/ui/T';
import { Toggle } from '@/ui/Toggle';
import { useT } from '@/i18n';

interface Props {
  dash: Dashboard;
  /** Open the editor with "I levelled up" switched on (from the "did you level up?" prompt). */
  levelUpRequest: number;
}

/** The primary interaction: steps today, flowers today, and did I level up. */
export function TodayCard({ dash, levelUpRequest }: Props) {
  const { c } = useTheme();
  const { t } = useT();
  const save = useApp((s) => s.saveEntry);
  const existing = dash.todayEntry;
  const [editing, setEditing] = useState(!existing);
  const [steps, setSteps] = useState<number | null>(existing?.steps ?? null);
  const [flowers, setFlowers] = useState<number | null>(existing?.flowers ?? null);
  const [leveled, setLeveled] = useState(existing?.leveledUp ?? false);
  // The level before today's entry, so editing a level-up day keeps the right baseline.
  const baseLevel = existing?.leveledUp ? (dash.replay.days.find((d) => d.date === dash.today)?.before.level ?? dash.current.level) : dash.current.level;
  const [newLevel, setNewLevel] = useState(existing?.newLevel ?? baseLevel + 1);
  const [more, setMore] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(existing?.minutesOut ?? null);
  const [mode, setMode] = useState<OutMode>(existing?.outMode ?? 'bike');
  const [syncSteps, setSyncSteps] = useState<number | null>(existing?.gameStepsToGo ?? null);
  const [syncFlowers, setSyncFlowers] = useState<number | null>(existing?.gameFlowersToGo ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
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

  // The top level the game has right now (130 today; more as they're released).
  const maxLevel = useApp((s) => s.table.maxLevel);
  const canLog = steps != null || flowers != null;

  const submit = async () => {
    const entry: DayEntry = {
      date: dash.today,
      steps: steps ?? 0,
      flowers: flowers ?? 0,
      leveledUp: leveled,
      newLevel: leveled ? newLevel : null,
      note: note.trim() ? note.trim() : null,
      minutesOut: minutes,
      outMode: minutes ? mode : null,
      gameStepsToGo: syncSteps,
      gameFlowersToGo: syncFlowers,
    };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBurst((b) => b + 1);
    await save(entry);
    setEditing(false);
    setMore(false);
  };

  const tg = dash.target;
  const targetLine =
    tg.isToday && dash.phase === 'active' && dash.plan.status === 'ok'
      ? tg.flowersIfRiding > 0
        ? dash.rates.bikes
          ? t("Today's target: {steps} steps · {flowers} flowers if you ride", { steps: fmt(roundNice(tg.steps)), flowers: fmt(roundNice(tg.flowersIfRiding)) })
          : t("Today's target: {steps} steps · {flowers} flowers", { steps: fmt(roundNice(tg.steps)), flowers: fmt(roundNice(tg.flowersIfRiding)) })
        : t("Today's target: {steps} steps", { steps: fmt(roundNice(tg.steps)) })
      : null;

  return (
    <Card style={{ overflow: 'visible' }}>
      <View onLayout={(e) => setSize((s) => ({ ...s, w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }))}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <T v="h2" accessibilityRole="header">
            {t('Today')}
          </T>
          <T v="smallBold" soft>
            {fmtLongDay(dash.today)}
          </T>
        </View>
        {!editing && existing ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Logged icon="shoe-print" value={existing.steps} label={t('steps')} color={c.teal} />
              <Logged icon="flower" value={existing.flowers} label={t('flowers')} color={c.petalRed} />
            </View>
            {existing.leveledUp ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="party-popper" size={20} color={c.nectar} />
                <T v="bodyBold">{t('Levelled up to {level}', { level: existing.newLevel ?? '' })}</T>
              </View>
            ) : null}
            <PillButton label={t('Edit today')} variant="secondary" icon="pencil" size="md" onPress={() => setEditing(true)} />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {targetLine ? (
              <T v="small" soft>
                {targetLine}
              </T>
            ) : null}
            <NumberField label={t('Steps today')} value={steps} onChange={setSteps} size="xl" />
            <NumberField label={t('Flowers today')} value={flowers} onChange={setFlowers} size="xl" />
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
                <Card variant="deep" style={{ gap: 10 }}>
                  <T v="smallBold">{t('Match the game')}</T>
                  <T v="caption" soft>
                    {leveled
                      ? t('If your profile shows different numbers to go for Level {level}, enter them here to replace the estimate.', { level: newLevel + 1 })
                      : t('If your profile shows different numbers to go, enter them here to replace the estimate.')}
                  </T>
                  <NumberField label={t('Steps to go')} value={syncSteps} onChange={setSyncSteps} size="md" />
                  <NumberField label={t('Flowers to go')} value={syncFlowers} onChange={setSyncFlowers} size="md" />
                </Card>
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
            <View onLayout={(e) => setSize((s) => ({ ...s, bx: e.nativeEvent.layout.x + e.nativeEvent.layout.width / 2, by: e.nativeEvent.layout.y + 20 }))}>
              <PillButton label={existing ? t('Save changes') : t('Log today')} icon="sprout" onPress={submit} disabled={!canLog} haptic={false} />
            </View>
            {existing ? <PillButton label={t('Cancel')} variant="ghost" size="sm" onPress={() => setEditing(false)} /> : null}
          </View>
        )}
      </View>
      <PetalBurst trigger={burst} width={size.w + 36} height={size.h + 36} originX={size.bx + 18} originY={size.by + 18} />
    </Card>
  );
}

function Logged({ icon, value, label, color }: { icon: 'shoe-print' | 'flower'; value: number; label: string; color: string }) {
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
