import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import Animated, { useAnimatedRef, useAnimatedScrollHandler } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmt } from '@/engine/format';
import { makeReq } from '@/engine/levels';
import { questOf } from '@/engine/quest';
import type { LevelRow, Requirement } from '@/engine/types';
import { QUEST_ICON } from '@/features/shared/quest';
import { useApp, useDashboard } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { Card } from '@/ui/Card';
import { Icon, type IconName } from '@/ui/Icon';
import { NumberField } from '@/ui/NumberField';
import { PillButton } from '@/ui/PillButton';
import { FocusFade, PaperSheet } from '@/ui/Screen';
import { ScrollRail, useScrollRail } from '@/ui/ScrollRail';
import { Sheet } from '@/ui/Sheet';
import { FlowerAccent } from '@/ui/skia/FlowerAccent';
import { LevelBadge } from '@/ui/skia/LevelBadge';
import { T } from '@/ui/T';
import { TAB_BAR_SPACE } from '@/ui/TabBar';
import { useT } from '@/i18n';
import { noteText, taskText } from '@/i18n/level-text';

/** A tile: padding above and below, an objective per line, the note under them, and the gap to the next. */
const PAD = 14;
const LINE = 23;
const NOTE = 19;
const GAP = 8;
const BADGE = 52;

/** How many lines a level's objectives take (steps, flowers, its quest), and whether a note sits under them. */
function tileLines(row: LevelRow, r: Requirement, current: number) {
  if (row.level <= 2) return { lines: 1, note: row.level === current || row.level === current + 1 };
  return { lines: 1 + (r.flowers > 0 ? 1 : 0) + (row.task ? 1 : 0), note: true };
}
const tileHeight = (t: { lines: number; note: boolean }) => PAD * 2 + Math.max(BADGE, t.lines * LINE + (t.note ? NOTE : 0));

export default function Levels() {
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const table = useApp((s) => s.table);
  const overrides = useApp((s) => s.overrides);
  const dash = useDashboard();
  const [editing, setEditing] = useState<number | null>(null);
  const rail = useScrollRail();
  const scrollRef = useAnimatedRef<FlatList<LevelRow>>();
  const onScroll = useAnimatedScrollHandler((e) => rail.track(e));
  const rows = useMemo(() => Array.from({ length: table.maxLevel }, (_, i) => table.byLevel[i + 1]), [table]);
  const req = useMemo(() => makeReq(table, overrides), [table, overrides]);
  const current = dash?.current.level ?? 1;
  // Each tile is as tall as its objectives; the list still knows where every one sits.
  const layout = useMemo(() => {
    let at = 0;
    return rows.map((row) => {
      const length = tileHeight(tileLines(row, req(row.level)!, current)) + GAP;
      const item = { length, offset: at };
      at += length;
      return item;
    });
  }, [rows, req, current]);

  const header = (
    <View style={{ gap: 14, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="h1" accessibilityRole="header">
          {t('Levels')}
        </T>
        <FlowerAccent arrangement="pair" width={132} height={50} />
      </View>
    </View>
  );

  return (
    <PaperSheet>
      <FocusFade>
        <Animated.FlatList
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          data={rows}
          keyExtractor={(r) => String(r.level)}
          ListHeaderComponent={header}
          extraData={lang}
          contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: TAB_BAR_SPACE + insets.bottom + 24 }}
          initialNumToRender={20}
          windowSize={9}
          getItemLayout={(_, index) => ({ ...layout[index], index })}
          onLayout={() => {
            // Scroll to the current level on mount.
            setTimeout(() => scrollRef.current?.scrollToIndex({ index: Math.max(0, current - 2), animated: true, viewOffset: 0 }), 350);
          }}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item }: { item: LevelRow }) => <LevelRowView row={item} r={req(item.level)!} current={current} onPress={() => setEditing(item.level)} />}
        />
        <ScrollRail rail={rail} scrollRef={scrollRef} top={18} bottom={TAB_BAR_SPACE + insets.bottom + 8} />
      </FocusFade>
      <OverrideSheet level={editing} onClose={() => setEditing(null)} />
    </PaperSheet>
  );
}

function LevelRowView({ row, r, current, onPress }: { row: LevelRow; r: Requirement; current: number; onPress: () => void }) {
  const { c } = useTheme();
  const { t } = useT();
  const isCurrent = row.level === current;
  const isNext = row.level === current + 1;
  const done = row.level < current;
  const quest = row.level > 2 ? questOf(row.task) : null;
  // The level's objectives, one per line: steps, flowers, and its quest.
  const goals: Array<{ icon: IconName; text: string; tint: string }> =
    row.level <= 2
      ? [{ icon: 'school-outline', text: t('Tutorial'), tint: c.leaf }]
      : [
          { icon: 'shoe-print', text: t('{steps} steps', { steps: fmt(r.steps) }), tint: c.teal },
          ...(r.flowers > 0 ? [{ icon: 'flower' as IconName, text: t('{flowers} flowers', { flowers: fmt(r.flowers) }), tint: c.petalRed }] : []),
          ...(row.task ? [{ icon: (quest ? QUEST_ICON[quest.kind] : 'flag-outline') as IconName, text: taskText(row.task), tint: c.leafDeep }] : []),
        ];
  const shape = tileLines(row, r, current);
  const note = !shape.note ? null : isCurrent ? t("You're here") : isNext ? t('Working on it now') : r.stepsMode === 'perLevel' ? t('Steps reset each level') : t('Lifetime {n} steps', { n: fmt(row.cumulativeSteps ?? 0) });
  const what = row.level <= 2 ? t('Tutorial') : r.flowers ? t('{steps} steps, {flowers} flowers', { steps: fmt(r.steps), flowers: fmt(r.flowers) }) : t('{steps} steps', { steps: fmt(r.steps) });
  const task = row.task && row.level > 2 ? `, ${taskText(row.task)}` : '';
  const label = `${t('Level {level}', { level: row.level })}. ${what}${task}.${done ? ` ${t('Done')}.` : ''}`;
  const ink = isCurrent ? c.onPanel : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('Correct this level')}
      onPress={onPress}
      disabled={row.level <= 2}
      style={({ pressed }) => ({
        height: tileHeight(shape),
        marginBottom: GAP,
        borderRadius: radius.card,
        paddingHorizontal: 14,
        paddingVertical: PAD,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: isCurrent ? c.panel : isNext ? c.leafPale : c.card,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        boxShadow: `0px 3px 12px 0px ${c.shadow}`,
      })}
    >
      {/* Every level wears its rank badge, in its metal: the ones reached and the ones still to come. */}
      <View style={{ width: BADGE, height: BADGE, alignItems: 'center', justifyContent: 'center' }}>
        <LevelBadge level={row.level} size={58} />
      </View>
      <View style={{ flex: 1 }}>
        {goals.map((g) => (
          <View key={g.icon + g.text} style={{ height: LINE, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Icon name={g.icon} size={16} color={isCurrent ? c.onPanel : g.tint} />
            <T v="bodyBold" color={ink} numberOfLines={1} style={{ flex: 1 }}>
              {g.text}
            </T>
          </View>
        ))}
        {note ? (
          <T v="caption" color={isCurrent ? c.onPanelSoft : undefined} soft={!isCurrent} numberOfLines={1} style={{ height: NOTE, paddingTop: 2 }}>
            {note}
          </T>
        ) : null}
      </View>
      {done ? (
        // Finished: steps, flowers and the level's task, all done.
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.leaf, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check-bold" size={16} color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
}

function OverrideSheet({ level, onClose }: { level: number | null; onClose: () => void }) {
  const table = useApp((s) => s.table);
  const overrides = useApp((s) => s.overrides);
  const save = useApp((s) => s.saveOverride);
  const remove = useApp((s) => s.removeOverride);
  const { t } = useT();
  const [steps, setSteps] = useState<number | null>(null);
  const [flowers, setFlowers] = useState<number | null>(null);
  const [lastLevel, setLastLevel] = useState<number | null>(null);
  const row = level ? table.byLevel[level] : null;
  const o = level ? overrides[level] : undefined;
  if (level !== lastLevel) {
    setLastLevel(level);
    if (row) {
      setSteps(o?.steps ?? row.steps);
      setFlowers(o?.flowers ?? row.flowers);
    }
  }
  return (
    <Sheet visible={!!row} onClose={onClose} title={row ? t('Level {level}', { level: row.level }) : ''}>
      {row ? (
        <>
          <T v="body">
            {t('What it takes to reach {level}, while you\'re at {prev}. Your profile shows it under "Next steps to level up".', { level: row.level, prev: row.level - 1 })}
          </T>
          {noteText(row.note, row.source) ? (
            <Card variant="deep">
              <T v="small">{noteText(row.note, row.source)}</T>
            </Card>
          ) : null}
          <T v="caption" soft>
            {row.stepsMode === 'perLevel'
              ? t('From level 101 the game asks you to "Walk X steps" at this level, so extra steps from the level before do not count.')
              : t('Up to level 100 the game asks for a lifetime total ({n} steps), so extra steps carry over.', { n: fmt(row.cumulativeSteps ?? 0) })}
          </T>
          <NumberField label={t('Steps')} value={steps} onChange={setSteps} />
          <NumberField label={t('Flowers')} value={flowers} onChange={setFlowers} />
          <PillButton
            label={t('Use what the game shows')}
            icon="check"
            disabled={steps == null}
            onPress={async () => {
              await save({
                level: row.level,
                steps: steps != null && steps !== row.steps ? steps : null,
                flowers: flowers != null && flowers !== row.flowers ? flowers : null,
                recordedAt: new Date().toISOString(),
              });
              if ((steps == null || steps === row.steps) && (flowers == null || flowers === row.flowers)) await remove(row.level);
              onClose();
            }}
          />
          {o ? (
            <PillButton
              label={t('Back to the bundled numbers')}
              variant="ghost"
              onPress={async () => {
                await remove(row.level);
                onClose();
              }}
            />
          ) : null}
          <T v="caption" soft>
            {t('The bundled level file is never changed. Your corrections are kept separately and listed in Settings.')}{' '}
            {t('Bundled: {steps} steps, {flowers} flowers ({source}).', { steps: fmt(row.steps), flowers: fmt(row.flowers), source: row.source === 'game' ? t('checked in game') : row.source === 'estimated' ? t('estimate') : t('wiki') })}
          </T>
        </>
      ) : null}
    </Sheet>
  );
}
