import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { seasonRatesFromClimate } from '@/engine/climate';
import { MonthBars } from '@/features/shared/MonthBars';
import { SeasonSliders } from '@/features/shared/SeasonSliders';
import { useApp } from '@/store/app';
import { PillButton } from '@/ui/PillButton';
import { SubScreen } from '@/ui/SubScreen';
import { T } from '@/ui/T';

export default function Seasons() {
  const { width } = useWindowDimensions();
  const seasons = useApp((s) => s.seasonRates);
  const climate = useApp((s) => s.climate);
  const preset = useApp((s) => s.settings.preset);
  const setSeasonRates = useApp((s) => s.setSeasonRates);
  const [values, setValues] = useState(seasons.map((r) => r.rideable));
  return (
    <SubScreen title="Your months">
      <T v="body" soft>
        Days you'd realistically ride, by month. This stops the planner promising you a January you can't ride.
      </T>
      <MonthBars rates={values} width={width - 32} height={90} />
      <SeasonSliders values={values} onChange={setValues} />
      <PillButton
        label="Save my months"
        icon="check"
        onPress={async () => {
          await setSeasonRates(values.map((v, i) => ({ month: i + 1, rideable: v, source: 'manual' as const })));
          router.back();
        }}
      />
      {climate ? (
        <PillButton
          label="Use the climate record instead"
          variant="secondary"
          onPress={async () => {
            await setSeasonRates(seasonRatesFromClimate(climate, preset));
            router.back();
          }}
        />
      ) : null}
      <PillButton
        label="Every day is rideable"
        variant="ghost"
        onPress={async () => {
          await setSeasonRates(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, rideable: 1, source: 'default' as const })));
          router.back();
        }}
      />
    </SubScreen>
  );
}
