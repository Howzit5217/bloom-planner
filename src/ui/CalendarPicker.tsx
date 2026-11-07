import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { addMonths, monthGrid, ymIndex, ymOf, type YearMonth } from '@/engine/calendar';
import { fromKey, toKey, type DayKey } from '@/engine/dates';
import { fmtLongDate, fmtMonthYear, monthShort, weekdayName, weekdayNarrow } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import { font, SPRING } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { t } from '@/i18n';
import { shadow } from './shadow';

/** Every calendar's weeks start on Monday, as the Easy Days row does. */
const WEEK_START = 1;
const ROWS = 6;
const CELL_H = 46;
const DOT = 40;
const GRID_H = ROWS * CELL_H;

interface Props {
  /** The chosen day, or null. */
  value: DayKey | null;
  onChange: (k: DayKey) => void;
  /** Earliest day that can be picked. */
  min: DayKey;
  /** Latest day that can be picked. */
  max?: DayKey;
  /** Today: ringed, and where the soft band toward the chosen day starts. */
  today: DayKey;
}

/** The app's own month calendar. Paper card, chunky month title, green bloom on the chosen day. */
export function CalendarPicker({ value, onChange, min, max, today }: Props) {
  const { c } = useTheme();
  const [view, setView] = useState<YearMonth>(() => ymOf(fromKey(value ?? min)));
  const [dir, setDir] = useState(0);
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const [width, setWidth] = useState(0);

  const headings = Array.from({ length: 7 }, (_, i) => {
    const d = (i + WEEK_START) % 7;
    return { short: weekdayNarrow(d), name: weekdayName(d) };
  });
  const minYm = ymOf(fromKey(min));
  const maxYm = max ? ymOf(fromKey(max)) : null;
  const canBack = mode === 'days' ? ymIndex(view) > ymIndex(minYm) : view.year > minYm.year;
  const canNext = mode === 'days' ? !maxYm || ymIndex(view) < ymIndex(maxYm) : !maxYm || view.year < maxYm.year;

  const step = (n: number) => {
    Haptics.selectionAsync().catch(() => {});
    setDir(n);
    setView((v) => (mode === 'days' ? addMonths(v, n) : { year: v.year + n, month: v.month }));
  };

  // Follow the value when it jumps to another month from outside (the quick-jump chips).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value) {
      const ym = ymOf(fromKey(value));
      if (ymIndex(ym) !== ymIndex(view) || mode !== 'days') {
        setDir(Math.sign(ymIndex(ym) - ymIndex(view)));
        setView(ym);
        setMode('days');
      }
    }
  }

  const weeks = monthGrid(view, WEEK_START);
  while (weeks.length < ROWS) weeks.push(Array.from({ length: 7 }, () => null));
  const cell = width / 7;
  // A soft band from today to the chosen day: how far away the goal is, at a glance.
  const bandTo = value != null && value > today ? value : null;

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 26,
        paddingHorizontal: 10,
        paddingTop: 10,
        paddingBottom: 12,
        ...shadow(`0px 6px 24px 0px ${c.shadow}, 0px 1px 3px 0px ${c.shadow}, inset 0px 1px 0px 0px ${c.cardHighlight}`),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <RoundButton icon="chevron-left" label={mode === 'days' ? t('Previous month') : t('Previous year')} disabled={!canBack} onPress={() => step(-1)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mode === 'days' ? t('{month}. Choose a month', { month: fmtMonthYear(view.year, view.month) }) : t('{year}. Back to the days', { year: String(view.year) })}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setDir(0);
            setMode((m) => (m === 'days' ? 'months' : 'days'));
          }}
          hitSlop={6}
          style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}
        >
          <T style={{ fontFamily: font.heading, fontSize: 22, lineHeight: 30, color: c.ink }}>{mode === 'days' ? fmtMonthYear(view.year, view.month) : `${view.year}`}</T>
          <Icon name={mode === 'days' ? 'chevron-down' : 'chevron-up'} size={20} color={c.leafDeep} />
        </Pressable>
        <RoundButton icon="chevron-right" label={mode === 'days' ? t('Next month') : t('Next year')} disabled={!canNext} onPress={() => step(1)} />
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {mode === 'days' ? (
          <>
            <View style={{ flexDirection: 'row', height: 26, alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
              {headings.map((h, i) => (
                <T key={i} v="label" color={c.inkSoft} center style={{ flex: 1, opacity: 0.85 }}>
                  {h.short}
                </T>
              ))}
            </View>
            <Animated.View
              key={`d${ymIndex(view)}`}
              entering={dir > 0 ? FadeInRight.duration(220) : dir < 0 ? FadeInLeft.duration(220) : FadeIn.duration(160)}
              style={{ height: GRID_H }}
            >
              {width > 0
                ? weeks.map((week, r) => (
                    <View key={r} style={{ flexDirection: 'row', height: CELL_H }}>
                      {week.map((k, col) => {
                        if (!k) return <View key={col} style={{ width: cell }} />;
                        const disabled = k < min || (max != null && k > max);
                        const band = bandTo != null && k >= today && k <= bandTo;
                        return (
                          <DayCell
                            key={k}
                            k={k}
                            width={cell}
                            selected={k === value}
                            isToday={k === today}
                            disabled={disabled}
                            band={band}
                            bandEndsHere={k === bandTo}
                            bandStartsHere={k === today}
                            roundL={col === 0 || !week[col - 1]}
                            roundR={col === 6 || !week[col + 1]}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              onChange(k);
                            }}
                          />
                        );
                      })}
                    </View>
                  ))
                : null}
            </Animated.View>
          </>
        ) : (
          <Animated.View key={`m${view.year}`} entering={dir > 0 ? FadeInRight.duration(220) : dir < 0 ? FadeInLeft.duration(220) : FadeIn.duration(160)} style={{ height: GRID_H + 26, paddingTop: 8, gap: 10 }}>
            {[0, 1, 2, 3].map((r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
                {[0, 1, 2].map((col) => {
                  const m = r * 3 + col;
                  const ym = { year: view.year, month: m };
                  const disabled = ymIndex(ym) < ymIndex(minYm) || (maxYm != null && ymIndex(ym) > ymIndex(maxYm));
                  const sel = ymIndex(ym) === ymIndex(view);
                  const holdsValue = value != null && ymIndex(ymOf(fromKey(value))) === ymIndex(ym);
                  return (
                    <Pressable
                      key={m}
                      accessibilityRole="button"
                      accessibilityLabel={fmtMonthYear(view.year, m)}
                      accessibilityState={{ disabled, selected: sel }}
                      disabled={disabled}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setDir(0);
                        setView(ym);
                        setMode('days');
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: sel ? c.button : pressed ? c.leafPale : c.canvasDeep,
                        opacity: disabled ? 0.35 : 1,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      })}
                    >
                      <T style={{ fontFamily: font.headingBold, fontSize: 18, lineHeight: 24, color: sel ? c.onButton : c.ink }}>{monthShort(m)}</T>
                      {holdsValue && !sel ? <View style={{ position: 'absolute', bottom: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: c.leaf }} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

interface DayProps {
  k: DayKey;
  width: number;
  selected: boolean;
  isToday: boolean;
  disabled: boolean;
  band: boolean;
  /** The band ends at this day's dot (it covers only the left half of the cell). */
  bandEndsHere: boolean;
  /** The band starts at this day's dot (it covers only the right half). */
  bandStartsHere: boolean;
  roundL: boolean;
  roundR: boolean;
  onPress: () => void;
}

function DayCell({ k, width, selected, isToday, disabled, band, bandEndsHere, bandStartsHere, roundL, roundR, onPress }: DayProps) {
  const { c } = useTheme();
  const scale = useSharedValue(1);
  const [wasSelected, setWasSelected] = useState(selected);
  if (selected !== wasSelected) {
    setWasSelected(selected);
    if (selected) scale.set(withSequence(withTiming(0.7, { duration: 60 }), withSpring(1, { ...SPRING, damping: 9 })));
  }
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const day = fromKey(k);
  const BAND_H = 34;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={fmtLongDate(k)}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ width, height: CELL_H, alignItems: 'center', justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <>
          {band ? (
            <View
              style={{
                position: 'absolute',
                top: (CELL_H - BAND_H) / 2,
                height: BAND_H,
                // A little past the cell where the next one carries on, so no hairline shows between them.
                left: bandStartsHere ? width / 2 : roundL ? 0 : -0.5,
                right: bandEndsHere ? width / 2 : roundR ? 0 : -0.5,
                backgroundColor: c.leafPale,
                borderTopLeftRadius: roundL && !bandStartsHere ? BAND_H / 2 : 0,
                borderBottomLeftRadius: roundL && !bandStartsHere ? BAND_H / 2 : 0,
                borderTopRightRadius: roundR && !bandEndsHere ? BAND_H / 2 : 0,
                borderBottomRightRadius: roundR && !bandEndsHere ? BAND_H / 2 : 0,
              }}
            />
          ) : null}
          <Animated.View
            style={[
              {
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? c.button : pressed && !disabled ? c.leafPale : isToday ? c.card : 'transparent',
                borderWidth: isToday && !selected ? 2 : 0,
                borderColor: c.nectar,
                ...shadow(selected ? `0px 3px 8px 0px ${c.shadow}` : undefined),
              },
              dot,
            ]}
          >
            <T
              style={{
                fontFamily: selected ? font.heading : isToday ? font.bodyHeavy : font.bodyBold,
                fontSize: selected ? 18 : 16,
                lineHeight: selected ? 24 : 22,
                color: selected ? c.onButton : disabled ? c.inkSoft : c.ink,
                opacity: disabled ? 0.4 : 1,
                includeFontPadding: false,
              }}
            >
              {day.getDate()}
            </T>
          </Animated.View>
        </>
      )}
    </Pressable>
  );
}

function RoundButton({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.leafPale : c.canvasDeep,
        opacity: disabled ? 0.3 : 1,
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}
    >
      <Icon name={icon} size={26} color={c.leafDeep} />
    </Pressable>
  );
}

/** Day keys for "a month from today" style shortcuts. */
export function jumpFrom(today: DayKey, months: number): DayKey {
  const d = fromKey(today);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toKey(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last)));
}
