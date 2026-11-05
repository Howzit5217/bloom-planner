import { View } from 'react-native';
import { DEFAULT_MANUAL_RATES, SAME_ALL_YEAR } from '@/engine/climate';
import { monthName } from '@/engine/format';
import { PillButton } from '@/ui/PillButton';
import { Slider } from '@/ui/Slider';
import { T } from '@/ui/T';
import { t } from '@/i18n';

/** Twelve month sliders, 0-100%: "days you'd realistically ride". */
export function SeasonSliders({ values, onChange }: { values: number[]; onChange: (v: number[]) => void }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
        <PillButton style={{ flex: 1 }} size="sm" variant="secondary" icon="weather-sunny" label={t('Same all year')} onPress={() => onChange(new Array(12).fill(SAME_ALL_YEAR))} />
        <PillButton style={{ flex: 1 }} size="sm" variant="secondary" icon="restore" label={t('Typical seasons')} onPress={() => onChange([...DEFAULT_MANUAL_RATES])} />
      </View>
      {Array.from({ length: 12 }, (_, i) => monthName(i)).map((m, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T v="smallBold" style={{ width: 86 }}>
            {m}
          </T>
          <View style={{ flex: 1 }}>
            <Slider
              label={t("{month}: days you'd realistically ride", { month: m })}
              value={values[i]}
              onChange={(v) => {
                const next = [...values];
                next[i] = Math.round(v * 100) / 100;
                onChange(next);
              }}
            />
          </View>
          <T v="smallBold" soft style={{ width: 44, textAlign: 'right' }}>
            {Math.round(values[i] * 100)}%
          </T>
        </View>
      ))}
    </View>
  );
}
