import { useState } from 'react';
import { Canvas } from '@shopify/react-native-skia';
import { Pressable, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { daysBetween, fromKey, toKey, todayKey, type DayKey } from '@/engine/dates';
import { fmt, fmtDate, fmtLongDate, monthShort } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { CalendarPicker, jumpFrom } from './CalendarPicker';
import { Icon } from './Icon';
import { PillButton } from './PillButton';
import { Sheet } from './Sheet';
import { FlowerHead } from './skia/FlowerHead';
import { ScrollText } from './ScrollText';
import { T } from './T';
import { t, tn } from '@/i18n';
import { STILL } from '@/ui/skia/still';
import { shadow } from './shadow';

interface Props {
  label: string;
  value: DayKey | null;
  onChange: (k: DayKey) => void;
  minimumDate: Date;
  maximumDate?: Date;
  placeholder?: string;
  error?: string | null;
}

const JUMPS = [1, 3, 6, 12];
const jumpLabel = (months: number) => (months === 12 ? t('1 year') : tn(months, '{n} month', '{n} months'));

function distance(today: DayKey, k: DayKey): string {
  const n = daysBetween(today, k);
  if (n === 1) return t('Tomorrow');
  if (n < 0) return tn(-n, '{n} day ago', '{n} days ago', { n: fmt(-n) });
  const inDays = tn(n, 'In {n} day', 'In {n} days', { n: fmt(n) });
  if (n < 21) return inDays;
  const months = n / 30.44;
  if (months < 3) return `${inDays} · ${t('about {n} weeks', { n: fmt(Math.round(n / 7)) })}`;
  return `${inDays} · ${t('about {n} months', { n: fmt(Math.round(months)) })}`;
}

/**
 * The field's own little tear-off calendar page: the month on a green band and the day beneath,
 * so it shows the date you picked. Before there is one, a flower waits on a blank page.
 */
function CalendarPage({ value }: { value: DayKey | null }) {
  const { c } = useTheme();
  const d = value ? fromKey(value) : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 42, height: 46, borderRadius: 12, backgroundColor: c.card, overflow: 'hidden', ...shadow(`0px 2px 6px 0px ${c.shadow}`) }}
    >
      <View style={{ height: 15, backgroundColor: d ? c.leaf : c.leafPale, alignItems: 'center', justifyContent: 'center' }}>
        {d ? <Text style={{ fontFamily: font.bodyHeavy, fontSize: 9.5, lineHeight: 12, color: '#FFFFFF', letterSpacing: 0.4 }}>{monthShort(d.getMonth()).toUpperCase()}</Text> : null}
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {d ? (
          <Animated.Text key={value} entering={ZoomIn.duration(220)} style={{ fontFamily: font.heading, fontSize: 20, lineHeight: 24, color: c.leafDeep, includeFontPadding: false }}>
            {d.getDate()}
          </Animated.Text>
        ) : (
          <Canvas __destroyWebGLContextAfterRender={STILL} style={{ width: 22, height: 22 }}>
            <FlowerHead r={9} color={c.petalYellow} transform={[{ translateX: 11 }, { translateY: 11 }]} />
          </Canvas>
        )}
      </View>
    </View>
  );
}

/** A date field that opens the app's own calendar in a sheet. */
export function DateField({ label, value, onChange, minimumDate, maximumDate, placeholder, error }: Props) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayKey | null>(value);
  const today = todayKey();
  const min = toKey(minimumDate);
  const max = maximumDate ? toKey(maximumDate) : undefined;

  return (
    <View>
      <T v="label" soft style={{ marginBottom: 6 }}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? fmtDate(value) : t('not set')}`}
        accessibilityHint={t('Opens a calendar')}
        onPress={() => {
          setDraft(value && value >= min ? value : null);
          setOpen(true);
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 64,
          paddingLeft: 11,
          paddingRight: 16,
          borderRadius: radius.field,
          backgroundColor: c.canvasDeep,
          opacity: pressed ? 0.8 : 1,
          ...shadow(`inset 0px 2px 5px 0px ${c.shadow}`),
        })}
      >
        <CalendarPage value={value} />
        <T style={{ flex: 1, fontFamily: font.heading, fontSize: 24, color: value ? c.leafDeep : c.inkSoft }}>{value ? fmtDate(value) : (placeholder ?? t('Pick a date'))}</T>
        <Icon name="chevron-down" size={22} color={c.inkSoft} />
      </Pressable>
      {error ? (
        <T v="caption" color={c.alert} style={{ marginTop: 6 }}>
          {error}
        </T>
      ) : null}

      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <CalendarPicker value={draft} onChange={setDraft} min={min} max={max} today={today} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {JUMPS.map((months) => {
            const k = jumpFrom(today, months);
            const disabled = k < min || (max != null && k > max);
            const sel = k === draft;
            return (
              <Pressable
                key={months}
                accessibilityRole="button"
                accessibilityLabel={t('{span} from today', { span: jumpLabel(months) })}
                accessibilityState={{ disabled, selected: sel }}
                disabled={disabled}
                onPress={() => setDraft(k)}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  paddingHorizontal: 4,
                  minHeight: 40,
                  borderRadius: 999,
                  justifyContent: 'center',
                  backgroundColor: sel ? c.leafPale : pressed ? c.leafPale : c.canvasDeep,
                  opacity: disabled ? 0.35 : 1,
                })}
              >
                <ScrollText v="smallBold" color={c.leafDeep} behind={sel ? c.leafPale : c.canvasDeep} center style={{ alignSelf: 'stretch' }}>
                  {jumpLabel(months)}
                </ScrollText>
              </Pressable>
            );
          })}
        </View>
        <View style={{ minHeight: 46 }}>
          {draft ? (
            <>
              <T v="h3">{fmtLongDate(draft)}</T>
              <T v="small" soft>
                {distance(today, draft)}
              </T>
            </>
          ) : (
            <T v="small" soft style={{ marginTop: 12 }}>
              {t('Tap a day to choose it.')}
            </T>
          )}
        </View>
        <PillButton
          label={t('Use this date')}
          icon="check"
          disabled={!draft}
          onPress={() => {
            if (draft) onChange(draft);
            setOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}
