import { Canvas, Circle, DashPathEffect, Group, Line, LinearGradient, Path, RoundedRect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import type { BurnDown, BurnPoint, DailyBar, SeasonBar, TimelineItem } from '@/engine/charts';
import { fmt, fmtDate, fmtShort, fmtWeekday, listJoin, monthShort, roundNice } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import { PETALS } from '@/theme/tokens';
import { flowerPath } from '@/ui/skia/shapes';
import { T } from '@/ui/T';
import { t } from '@/i18n';

const useMountProgress = (delay = 100, duration = 900) => {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [delay, duration, p]);
  return p;
};

// ─── 1. Burn-down ───
function linePath(points: Array<{ x: number; y: number }>): SkPath {
  const b = Skia.PathBuilder.Make();
  points.forEach((p, i) => (i === 0 ? b.moveTo(p.x, p.y) : b.lineTo(p.x, p.y)));
  return b.build();
}

function interpolateAt(points: BurnPoint[], x: number, key: 'steps' | 'flowers'): number {
  if (x <= points[0].x) return points[0][key];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i].x) {
      const a = points[i - 1];
      const b = points[i];
      const w = (x - a.x) / Math.max(1e-9, b.x - a.x);
      return a[key] + (b[key] - a[key]) * w;
    }
  }
  return points[points.length - 1][key];
}

function BurnPanel({ data, which, width, label, color }: { data: BurnDown; which: 'steps' | 'flowers'; width: number; label: string; color: string }) {
  const { c } = useTheme();
  const H = 140;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 10;
  const max = which === 'steps' ? data.maxSteps : data.maxFlowers;
  const x0 = -1;
  const x1 = Math.max(1, data.totalDays - 1);
  const sx = (x: number) => padL + ((x - x0) / (x1 - x0)) * (width - padL - padR);
  const sy = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const p = useMountProgress();
  const { plan, actual, gap, ahead, todayX } = useMemo(() => {
    const planPts = data.plan.map((q) => ({ x: sx(q.x), y: sy(q[which]) }));
    const actPts = data.actual.map((q) => ({ x: sx(q.x), y: sy(q[which]) }));
    const last = data.actual[data.actual.length - 1];
    const planAtLast = interpolateAt(data.plan, last.x, which);
    const g = Skia.PathBuilder.Make();
    if (data.actual.length > 1) {
      data.actual.forEach((q, i) => (i === 0 ? g.moveTo(sx(q.x), sy(q[which])) : g.lineTo(sx(q.x), sy(q[which]))));
      for (let i = data.actual.length - 1; i >= 0; i--) {
        const q = data.actual[i];
        g.lineTo(sx(q.x), sy(interpolateAt(data.plan, q.x, which)));
      }
      g.close();
    }
    return { plan: linePath(planPts), actual: linePath(actPts), gap: g.build(), ahead: last[which] <= planAtLast, todayX: sx(Math.min(x1, Math.max(x0, data.todayX))) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, which, width]);
  const end = useDerivedValue(() => p.value);
  const lastPoint = data.actual[data.actual.length - 1];
  const remainingNow = lastPoint[which];
  const planNow = interpolateAt(data.plan, lastPoint.x, which);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t('{what} left to goal: {n}. The plan expected {plan} by now.', { what: label, n: fmt(remainingNow), plan: fmt(planNow) })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <T v="smallBold">{label} left</T>
        <T v="smallBold" color={ahead ? c.leafDeep : c.alert}>
          {fmt(remainingNow)}
        </T>
      </View>
      <Canvas style={{ width, height: H }}>
        <Line p1={vec(padL, H - padB)} p2={vec(width - padR, H - padB)} color={c.divider} strokeWidth={2} />
        <Path path={gap} color={ahead ? c.leaf : c.alert} opacity={0.22} />
        <Line p1={vec(todayX, padT)} p2={vec(todayX, H - padB)} color={c.inkSoft} strokeWidth={1} opacity={0.5}>
          <DashPathEffect intervals={[3, 4]} />
        </Line>
        <Path path={plan} style="stroke" strokeWidth={2.5} color={c.inkSoft} start={0} end={end} strokeCap="round">
          <DashPathEffect intervals={[7, 6]} />
        </Path>
        <Path path={actual} style="stroke" strokeWidth={3.5} color={color} start={0} end={end} strokeCap="round" strokeJoin="round" />
        <Circle cx={sx(lastPoint.x)} cy={sy(remainingNow)} r={5} color={color} />
      </Canvas>
    </View>
  );
}

export function BurnDownChart({ data, width, startLabel, endLabel }: { data: BurnDown; width: number; startLabel: string; endLabel: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <BurnPanel data={data} which="steps" width={width} label={t('Steps')} color={c.teal} />
      {data.maxFlowers > 1 ? <BurnPanel data={data} which="flowers" width={width} label={t('Flowers')} color={c.petalRed} /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="caption" soft>
          {startLabel}
        </T>
        <T v="caption" soft>
          {endLabel}
        </T>
      </View>
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
        <Key color={c.ink} label={t('You (solid)')} />
        <Key color={c.inkSoft} label={t('Required pace (dashed)')} dashed />
      </View>
    </View>
  );
}

function Key({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 18, height: 0, borderTopWidth: 3, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <T v="caption" soft>
        {label}
      </T>
    </View>
  );
}

// ─── 2. Daily bars ───
function DailyBarPair({ i, b, bw, gap, H, grow, sTarget, fTarget, colors }: { i: number; b: DailyBar; bw: number; gap: number; H: number; grow: SharedValue<number>; sTarget: number; fTarget: number; colors: [string, string, string] }) {
  const cap = 1.6;
  const top = 8;
  const scale = (H - top) / cap;
  const sh = b.logged ? Math.min(cap, sTarget > 0 ? b.steps / sTarget : 0) * scale : 3;
  const fh = b.logged ? Math.min(cap, fTarget > 0 ? b.flowers / fTarget : 0) * scale : 3;
  const x = i * (bw * 2 + gap);
  const shV = useDerivedValue(() => Math.max(2, sh * grow.value));
  const fhV = useDerivedValue(() => Math.max(2, fh * grow.value));
  const sy = useDerivedValue(() => H - shV.value);
  const fy = useDerivedValue(() => H - fhV.value);
  return (
    <Group opacity={b.logged ? 1 : 0.35}>
      <RoundedRect x={x} y={sy} width={bw} height={shV} r={Math.min(4, bw / 2)} color={b.logged ? colors[0] : colors[2]} />
      <RoundedRect x={x + bw} y={fy} width={bw} height={fhV} r={Math.min(4, bw / 2)} color={b.logged ? colors[1] : colors[2]} />
    </Group>
  );
}

export function DailyBarsChart({ bars, width, stepsTarget, flowersTarget, bikes = true }: { bars: DailyBar[]; width: number; stepsTarget: number; flowersTarget: number; bikes?: boolean }) {
  const { c } = useTheme();
  const H = 150;
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(120, withSpring(1, { damping: 14, stiffness: 90 }));
  }, [grow]);
  const [sel, setSel] = useState<number | null>(null);
  const gap = 3;
  const bw = (width - gap * (bars.length - 1)) / (bars.length * 2);
  const targetY = H - ((H - 8) / 1.6) * 1;
  const s = sel != null ? bars[sel] : null;
  return (
    <View>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={t("Last 30 days, steps and flowers against the daily target. Tap a bar for the day's detail.")}
        onPress={(e) => setSel(Math.max(0, Math.min(bars.length - 1, Math.floor(e.nativeEvent.locationX / (bw * 2 + gap)))))}
      >
        <Canvas style={{ width, height: H }}>
          {bars.map((b, i) => (
            <DailyBarPair key={b.date} i={i} b={b} bw={bw} gap={gap} H={H} grow={grow} sTarget={stepsTarget} fTarget={flowersTarget} colors={[c.teal, c.petalRed, c.inkSoft]} />
          ))}
          {sel != null ? <RoundedRect x={sel * (bw * 2 + gap) - 1.5} y={0} width={bw * 2 + 3} height={H} r={4} color={c.leafDeep} opacity={0.1} /> : null}
          <Line p1={vec(0, targetY)} p2={vec(width, targetY)} color={c.leafDeep} strokeWidth={2}>
            <DashPathEffect intervals={[6, 5]} />
          </Line>
        </Canvas>
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <T v="caption" soft>
          {fmtShort(bars[0].date)}
        </T>
        <T v="caption" soft>
          {t('Dashed line = daily target')}
        </T>
        <T v="caption" soft>
          {t('Today')}
        </T>
      </View>
      <View style={{ minHeight: 44, justifyContent: 'center', marginTop: 6 }}>
        {s ? (
          <T v="small">
            {fmtWeekday(s.date)} {fmtShort(s.date)}:{' '}
            {s.logged
              ? flowersTarget > 0
                ? bikes
                  ? t('{steps} steps (target {sTarget}) · {flowers} flowers (target {fTarget} on a ride day)', { steps: fmt(s.steps), sTarget: fmt(roundNice(stepsTarget)), flowers: fmt(s.flowers), fTarget: fmt(roundNice(flowersTarget)) })
                  : t('{steps} steps (target {sTarget}) · {flowers} flowers (target {fTarget})', { steps: fmt(s.steps), sTarget: fmt(roundNice(stepsTarget)), flowers: fmt(s.flowers), fTarget: fmt(roundNice(flowersTarget)) })
                : t('{steps} steps (target {sTarget}) · {flowers} flowers', { steps: fmt(s.steps), sTarget: fmt(roundNice(stepsTarget)), flowers: fmt(s.flowers) })
              : t('not logged')}
          </T>
        ) : (
          <T v="caption" soft>
            {t('Tap a day for the detail.')}
          </T>
        )}
      </View>
    </View>
  );
}

// ─── 3. Level timeline ───
export function LevelTimeline({ items }: { items: TimelineItem[] }) {
  const { c } = useTheme();
  const colors = PETALS(c).filter((x) => x !== c.petalWhite);
  const step = 70;
  const H = 120;
  const cy = 52;
  const W = Math.max(step, items.length * step);
  const p = useMountProgress(80, 1100);
  const flowers = useMemo(
    () =>
      items.map((it, i) => {
        const cx = i * step + step / 2;
        const open = it.status === 'done' ? 1 : it.status === 'current' ? 0.5 : 0;
        return { it, cx, path: flowerPath(cx, cy, it.status === 'future' ? 13 : 18, open), color: it.status === 'future' ? c.leaf : colors[it.level % colors.length] };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, c],
  );
  const reveal = useDerivedValue(() => p.value * W);
  const clip = useDerivedValue(() => Skia.XYWHRect(0, 0, reveal.value, H));
  const currentIndex = Math.max(0, items.findIndex((i) => i.status === 'current'));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: Math.max(0, currentIndex * step - step), y: 0 }}>
      <View style={{ width: W, height: H }} accessible accessibilityLabel={t('Level timeline from {from} to {to}', { from: items[0]?.level ?? '', to: items[items.length - 1]?.level ?? '' })}>
        <Canvas style={{ position: 'absolute', width: W, height: H }}>
          <Line p1={vec(step / 2, cy)} p2={vec(W - step / 2, cy)} color={c.leafPale} strokeWidth={6} strokeCap="round" />
          <Group clip={clip}>
            <Line p1={vec(step / 2, cy)} p2={vec(Math.max(step / 2, currentIndex * step + step / 2), cy)} color={c.leaf} strokeWidth={6} strokeCap="round" />
            {flowers.map((f) => (
              <Group key={f.it.level}>
                <Path path={f.path} color={f.color} opacity={f.it.status === 'future' ? 0.85 : 1} />
                {f.it.status !== 'future' ? <Circle cx={f.cx} cy={cy} r={f.it.status === 'done' ? 5 : 4} color={c.petalYellow} /> : null}
              </Group>
            ))}
          </Group>
        </Canvas>
        {items.map((it, i) => (
          <View key={it.level} style={{ position: 'absolute', left: i * step, width: step, top: 0, alignItems: 'center' }}>
            <T v="smallBold" color={it.status === 'current' ? c.leafDeep : undefined}>
              {it.level}
            </T>
            <View style={{ height: 66 }} />
            <T v="caption" soft center style={{ fontSize: 11 }}>
              {it.date ? `${it.projected ? '~' : ''}${fmtShort(it.date)}` : ''}
            </T>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── 4. Seasonal view ───
function SeasonColumn({ b, i, colW, H, grow, max, colors }: { b: SeasonBar; i: number; colW: number; H: number; grow: SharedValue<number>; max: number; colors: [string, string] }) {
  const bw = colW * 0.34;
  const x = i * colW + colW * 0.14;
  const ph = (b.planned / max) * H;
  const ah = (b.actual / max) * H;
  const phV = useDerivedValue(() => Math.max(2, ph * grow.value));
  const ahV = useDerivedValue(() => Math.max(b.actual > 0 ? 2 : 0, ah * grow.value));
  const py = useDerivedValue(() => H - phV.value);
  const ay = useDerivedValue(() => H - ahV.value);
  return (
    <Group>
      <RoundedRect x={x} y={py} width={bw} height={phV} r={4}>
        <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={[colors[0], colors[1]]} />
      </RoundedRect>
      <RoundedRect x={x + bw + 2} y={ay} width={bw} height={ahV} r={4} color={colors[1]} />
    </Group>
  );
}

export function SeasonalChart({ bars, width }: { bars: SeasonBar[]; width: number }) {
  const { c } = useTheme();
  const H = 130;
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(150, withSpring(1, { damping: 14, stiffness: 90 }));
  }, [grow]);
  const max = Math.max(1, ...bars.map((b) => Math.max(b.planned, b.actual)));
  const colW = width / bars.length;
  const slow = bars.filter((b) => b.rate < 0.4);
  return (
    <View>
      <Canvas style={{ width, height: H }} accessibilityLabel={t('Flowers by month')}>
        {bars.map((b, i) => (
          <SeasonColumn key={`${b.year}-${b.month}`} b={b} i={i} colW={colW} H={H} grow={grow} max={max} colors={b.rate < 0.4 ? [c.alertPale, c.alert] : [c.leafPale, c.leaf]} />
        ))}
      </Canvas>
      <View style={{ flexDirection: 'row' }}>
        {bars.map((b) => (
          <View key={`${b.year}-${b.month}`} style={{ width: colW, alignItems: 'center' }}>
            <T v="caption" color={b.rate < 0.4 ? c.alert : c.inkSoft} numberOfLines={1} style={{ fontSize: 10.5, letterSpacing: -0.2 }}>
              {monthShort(b.month)}
            </T>
            <T v="caption" soft style={{ fontSize: 10 }}>
              {t('{n}d', { n: Math.round(b.rideDays) })}
            </T>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <Swatch color={c.leafPale} label={t('Planned flowers')} />
        <Swatch color={c.leaf} label={t('Planted')} />
        <T v="caption" soft>
          {t('d = rideable days')}
        </T>
      </View>
      {slow.length ? (
        <T v="small" style={{ marginTop: 8 }}>
          {t('Slow months ahead: {months}. Bank what you can before them.', { months: listJoin(slow.map((b) => monthShort(b.month))) })}
        </T>
      ) : null}
    </View>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
      <T v="caption" soft>
        {label}
      </T>
    </View>
  );
}

export const dateRange = (a: string, b: string) => [fmtDate(a), fmtDate(b)] as const;
