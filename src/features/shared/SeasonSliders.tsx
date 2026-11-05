import { View } from 'react-native';
import { DEFAULT_MANUAL_RATES, SAME_ALL_YEAR } from '@/engine/climate';
import { MONTHS } from '@/engine/format';
import { PillButton } from '@/ui/PillButton';
import { Slider } from '@/ui/Slider';
import { T } from '@/ui/T';

/** Twelve month sliders, 0-100%: "days you'd realistically ride". */
export function SeasonSliders({ values, onChange }: { values: number[]; onChange: (v: number[]) => void }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <PillButton size="sm" variant="secondary" icon="weather-sunny" label="Same all year" onPress={() => onChange(new Array(12).fill(SAME_ALL_YEAR))} />
        <PillButton size="sm" variant="secondary" icon="restore" label="Temperate default" onPress={() => onChange([...DEFAULT_MANUAL_RATES])} />
      </View>
      {MONTHS.map((m, i) => (
        <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T v="smallBold" style={{ width: 86 }}>
            {m}
          </T>
          <View style={{ flex: 1 }}>
            <Slider
              label={`${m}: days you'd realistically ride`}
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
