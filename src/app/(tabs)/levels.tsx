import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmt } from '@/engine/format';
import { makeReq } from '@/engine/levels';
import type { LevelRow, Requirement } from '@/engine/types';
import { useApp, useDashboard } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { Banner } from '@/ui/Banner';
import { Card } from '@/ui/Card';
import { Icon, type IconName } from '@/ui/Icon';
import { NumberField } from '@/ui/NumberField';
import { PillButton } from '@/ui/PillButton';
import { FocusFade } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Meadow } from '@/ui/skia/Meadow';
import { T } from '@/ui/T';
import { TAB_BAR_SPACE } from '@/ui/TabBar';

const ROW_H = 92;

function estimatedRanges(rows: LevelRow[]): string {
  const est = rows.filter((r) => r.source === 'estimated').map((r) => r.level);
  const parts: string[] = [];
  for (let i = 0; i < est.length; i++) {
    let j = i;
    while (j + 1 < est.length && est[j + 1] === est[j] + 1) j++;
    parts.push(j > i ? `${est[i]}–${est[j]}` : `${est[i]}`);
    i = j;
  }
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export default function Levels() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const table = useApp((s) => s.table);
  const overrides = useApp((s) => s.overrides);
  const dismissed = useApp((s) => s.settings.dismissed);
  const updateSettings = useApp((s) => s.updateSettings);
  const dash = useDashboard();
  const [editing, setEditing] = useState<number | null>(null);
  const list = useRef<FlatList<LevelRow>>(null);
  const rows = useMemo(() => Array.from({ length: table.maxLevel }, (_, i) => table.byLevel[i + 1]), [table]);
  const req = useMemo(() => makeReq(table, overrides), [table, overrides]);
  const current = dash?.current.level ?? 1;
  const estimated = estimatedRanges(rows);

  const header = (
    <View style={{ gap: 14, marginBottom: 14 }}>
      <T v="h1" accessibilityRole="header">
        Levels
      </T>
      {!dismissed['levels-banner'] ? (
        <Banner
          icon="information-outline"
          text={`Levels ${estimated} aren't published anywhere. Those are estimates. Tap any level to correct it with what your game actually shows.`}
          onDismiss={() => updateSettings({ dismissed: { ...dismissed, 'levels-banner': true } })}
        />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <Legend icon="leaf" label="Pikmin wiki" color={c.leafDeep} />
        <Legend icon="check-decagram" label="Checked in game" color={c.teal} />
        <Legend icon="circle-outline" label="Estimate" color={c.inkSoft} dashed />
        <Legend icon="pencil-circle" label="Your correction" color={c.nectar} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <Meadow height={insets.top + 92} density={1.4} seed={31} />
        <View style={{ height: 26, marginTop: -26, backgroundColor: c.canvas, borderTopLeftRadius: 26, borderTopRightRadius: 26 }} />
      </View>
      <FocusFade>
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(r) => String(r.level)}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingTop: insets.top + 70, paddingHorizontal: 16, paddingBottom: TAB_BAR_SPACE + insets.bottom + 24 }}
          initialNumToRender={20}
          getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
          onLayout={() => {
            // Scroll to the current level on mount.
            setTimeout(() => list.current?.scrollToIndex({ index: Math.max(0, current - 2), animated: true, viewOffset: 0 }), 350);
          }}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item }) => <LevelRowView row={item} r={req(item.level)!} current={current} onPress={() => setEditing(item.level)} />}
        />
      </FocusFade>
      <OverrideSheet level={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

function Legend({ icon, label, color, dashed }: { icon: IconName; label: string; color: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {dashed ? <DashedBadge color={color} /> : <Icon name={icon} size={16} color={color} />}
      <T v="caption" soft>
        {label}
      </T>
    </View>
  );
}

function DashedBadge({ color, size = 16 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color }} />;
}

function SourceBadge({ r, row }: { r: Requirement; row: LevelRow }) {
  const { c } = useTheme();
  if (r.overridden) return <Icon name="pencil-circle" size={20} color={c.nectar} />;
  if (row.source === 'game') return <Icon name="check-decagram" size={20} color={c.teal} />;
  if (row.source === 'estimated') return <DashedBadge color={c.inkSoft} size={18} />;
  return <Icon name="leaf" size={18} color={c.leafDeep} />;
}

function LevelRowView({ row, r, current, onPress }: { row: LevelRow; r: Requirement; current: number; onPress: () => void }) {
  const { c } = useTheme();
  const isCurrent = row.level === current;
  const isNext = row.level === current + 1;
  const done = row.level <= current;
  const label = `Level ${row.level}. ${row.level <= 2 ? 'Tutorial' : `${fmt(r.steps)} steps${r.flowers ? `, ${fmt(r.flowers)} flowers` : ''}`}${row.task && row.level > 2 ? `, ${row.task}` : ''}. ${r.overridden ? 'Your correction' : row.source === 'game' ? 'Checked in game' : row.source === 'estimated' ? 'Estimate' : 'From the wiki'}.`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Correct this level"
      onPress={onPress}
      disabled={row.level <= 2}
      style={({ pressed }) => ({
        height: ROW_H - 8,
        marginBottom: 8,
        borderRadius: radius.card,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: isCurrent ? c.panel : isNext ? c.leafPale : c.card,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        boxShadow: `0px 3px 12px 0px ${c.shadow}`,
      })}
    >
      <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isCurrent ? c.gold : done ? c.leafPale : c.canvasDeep }}>
        <T v="h2" color={isCurrent ? '#FFFFFF' : done ? c.leafDeep : c.ink}>
          {row.level}
        </T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {row.level <= 2 ? (
          <T v="bodyBold" color={isCurrent ? c.onPanel : undefined}>
            Tutorial
          </T>
        ) : (
          <>
            <T v="bodyBold" color={isCurrent ? c.onPanel : undefined} numberOfLines={1}>
              {fmt(r.steps)} steps{r.flowers ? ` · ${fmt(r.flowers)} flowers` : ''}
            </T>
            <T v="caption" color={isCurrent ? c.onPanelSoft : undefined} soft={!isCurrent} numberOfLines={1}>
              {isCurrent ? "You're here" : isNext ? 'Working on it now' : row.task || (r.stepsMode === 'perLevel' ? 'Steps reset each level' : `Lifetime ${fmt(row.cumulativeSteps ?? 0)} steps`)}
            </T>
          </>
        )}
      </View>
      {row.level > 2 ? <SourceBadge r={r} row={row} /> : null}
    </Pressable>
  );
}

function OverrideSheet({ level, onClose }: { level: number | null; onClose: () => void }) {
  const table = useApp((s) => s.table);
  const overrides = useApp((s) => s.overrides);
  const save = useApp((s) => s.saveOverride);
  const remove = useApp((s) => s.removeOverride);
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
    <Sheet visible={!!row} onClose={onClose} title={row ? `Level ${row.level}` : ''}>
      {row ? (
        <>
          <T v="body">
            What it takes to reach {row.level}, while you're at {row.level - 1}. Your profile shows it under "Next steps to level up".
          </T>
          {row.note ? (
            <Card variant="deep">
              <T v="small">{row.note}</T>
            </Card>
          ) : null}
          <T v="caption" soft>
            {row.stepsMode === 'perLevel'
              ? 'From level 101 the game asks you to "Walk X steps" at this level, so extra steps from the level before do not count.'
              : `Up to level 100 the game asks for a lifetime total (${fmt(row.cumulativeSteps ?? 0)} steps), so extra steps carry over.`}
          </T>
          <NumberField label="Steps" value={steps} onChange={setSteps} />
          <NumberField label="Flowers" value={flowers} onChange={setFlowers} />
          <PillButton
            label="Use what the game shows"
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
              label="Back to the bundled numbers"
              variant="ghost"
              onPress={async () => {
                await remove(row.level);
                onClose();
              }}
            />
          ) : null}
          <T v="caption" soft>
            The bundled level file is never changed. Your corrections are kept separately and listed in Settings. Bundled: {fmt(row.steps)} steps, {fmt(row.flowers)} flowers ({row.source === 'game' ? 'checked in game' : row.source === 'estimated' ? 'estimate' : 'wiki'}).
          </T>
        </>
      ) : null}
    </Sheet>
  );
}
