import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { fmtDate } from '@/engine/format';
import { fromKey, toKey, type DayKey } from '@/engine/dates';
import { useTheme } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { Icon } from './Icon';
import { PillButton } from './PillButton';
import { Sheet } from './Sheet';
import { T } from './T';

interface Props {
  label: string;
  value: DayKey | null;
  onChange: (k: DayKey) => void;
  minimumDate: Date;
  maximumDate?: Date;
  placeholder?: string;
  error?: string | null;
}

/** Native date picker: Android dialog, iOS inline calendar in a sheet. */
export function DateField({ label, value, onChange, minimumDate, maximumDate, placeholder = 'Pick a date', error }: Props) {
  const { c, isDark } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(value ? fromKey(value) : minimumDate);
  const current = value ? fromKey(value) : minimumDate;

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate,
        maximumDate,
        onValueChange: (_e: DateTimePickerChangeEvent, d: Date) => onChange(toKey(d)),
      });
    } else {
      setIosDraft(current);
      setIosOpen(true);
    }
  };

  return (
    <View>
      <T v="label" soft style={{ marginBottom: 6 }}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? fmtDate(value) : 'not set'}`}
        onPress={open}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 64,
          paddingHorizontal: 16,
          borderRadius: radius.field,
          backgroundColor: c.canvasDeep,
          opacity: pressed ? 0.8 : 1,
          boxShadow: `inset 0px 2px 5px 0px ${c.shadow}`,
        })}
      >
        <Icon name="calendar-heart" size={26} color={c.leafDeep} />
        <T style={{ fontFamily: font.heading, fontSize: 24, color: value ? c.leafDeep : c.inkSoft }}>{value ? fmtDate(value) : placeholder}</T>
      </Pressable>
      {error ? (
        <T v="caption" color={c.alert} style={{ marginTop: 6 }}>
          {error}
        </T>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Sheet visible={iosOpen} onClose={() => setIosOpen(false)} title={label}>
          <DateTimePicker
            value={iosDraft}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            themeVariant={isDark ? 'dark' : 'light'}
            accentColor={c.leaf}
            onValueChange={(_, d) => setIosDraft(d)}
          />
          <PillButton
            label="Use this date"
            onPress={() => {
              onChange(toKey(iosDraft));
              setIosOpen(false);
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}
