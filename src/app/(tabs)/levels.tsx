import { useEffect, useMemo, useRef } from 'react';
import { FlatList, View } from 'react-native';
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
import { Icon, type IconName } from '@/ui/Icon';
import { useAppWidth } from '@/ui/layout';
import { FocusFade, PaperSheet } from '@/ui/Screen';
import { ScrollRail, useScrollRail } from '@/ui/ScrollRail';
import { ScrollText } from '@/ui/ScrollText';
import { FlowerAccent } from '@/ui/skia/FlowerAccent';
import { LevelBadge } from '@/ui/skia/LevelBadge';
import { T } from '@/ui/T';
import { TAB_BAR_SPACE } from '@/ui/TabBar';
import { useT } from '@/i18n';
import { taskText } from '@/i18n/level-text';

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
  const dash = useDashboard();
  const rail = useScrollRail();
  const scrollRef = useAnimatedRef<FlatList<LevelRow>>();
  const onScroll = useAnimatedScrollHandler((e) => rail.track(e));
  const rows = useMemo(() => Array.from({ length: table.maxLevel }, (_, i) => table.byLevel[i + 1]), [table]);
  // Every level as the game has it.
  const req = useMemo(() => makeReq(table, {}), [table]);
  const current = dash?.current.level ?? 1;
  const start = Math.min(rows.length - 1, Math.max(0, current - 2));
  // After a level-up the list moves to the new level at once, the same way.
  const shownFor = useRef(current);
  useEffect(() => {
    if (shownFor.current === current) return;
    shownFor.current = current;
    scrollRef.current?.scrollToIndex({ index: start, animated: false });
  }, [current, start, scrollRef]);
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
          // Opens already at your level (the one before it just above), not at the top scrolling down.
          initialScrollIndex={start}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item }: { item: LevelRow }) => <LevelRowView row={item} r={req(item.level)!} current={current} />}
        />
        <ScrollRail rail={rail} scrollRef={scrollRef} top={18} bottom={TAB_BAR_SPACE + insets.bottom + 8} />
      </FocusFade>
    </PaperSheet>
  );
}

function LevelRowView({ row, r, current }: { row: LevelRow; r: Requirement; current: number }) {
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
  const tile = isCurrent ? c.panel : isNext ? c.leafPale : c.card;
  // A small phone: a smaller badge leaves the objectives more room.
  const narrow = useAppWidth() < 360;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        height: tileHeight(shape),
        marginBottom: GAP,
        borderRadius: radius.card,
        paddingHorizontal: 14,
        paddingVertical: PAD,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: tile,
        boxShadow: `0px 3px 12px 0px ${c.shadow}`,
      }}
    >
      {/* Every level wears its rank badge, in its metal: the ones reached and the ones still to come. */}
      <View style={{ width: narrow ? BADGE - 6 : BADGE, height: BADGE, alignItems: 'center', justifyContent: 'center' }}>
        <LevelBadge level={row.level} size={narrow ? 50 : 58} />
      </View>
      <View style={{ flex: 1 }}>
        {goals.map((g) => (
          <View key={g.icon + g.text} style={{ height: LINE, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Icon name={g.icon} size={16} color={isCurrent ? c.onPanel : g.tint} />
            {/* Too long for the tile (a quest on a small phone): it slides to show the rest, never cut off. */}
            <ScrollText v="bodyBold" color={ink} behind={tile} style={{ flex: 1 }}>
              {g.text}
            </ScrollText>
          </View>
        ))}
        {note ? <ScrollText v="caption" color={isCurrent ? c.onPanelSoft : undefined} soft={!isCurrent} behind={tile} style={{ height: NOTE, paddingTop: 2 }}>{note}</ScrollText> : null}
      </View>
      {done ? (
        // Finished: steps, flowers and the level's task, all done.
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.leaf, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check-bold" size={16} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}
