import { router } from 'expo-router';
import { useState } from 'react';
import { seasonRatesFromClimate } from '@/engine/climate';
import { MonthBars } from '@/features/shared/MonthBars';
import { SeasonSliders } from '@/features/shared/SeasonSliders';
import { useApp } from '@/store/app';
import { PillButton } from '@/ui/PillButton';
import { SubScreen } from '@/ui/SubScreen';
import { T } from '@/ui/T';
import { useT } from '@/i18n';
import { useAppWidth } from '@/ui/layout';

export default function Seasons() {
  const width = useAppWidth();
  const { t } = useT();
  const seasons = useApp((s) => s.seasonRates);
  const climate = useApp((s) => s.climate);
  const preset = useApp((s) => s.settings.preset);
  const limits = useApp((s) => s.settings.limits);
  const setSeasonRates = useApp((s) => s.setSeasonRates);
  const [values, setValues] = useState(seasons.map((r) => r.rideable));
  return (
    <SubScreen title={t('Your Months')}>
      <T v="body" soft>
        {t("Days you'd really ride, by month, so the plan never counts on a January you can't ride.")}
      </T>
      <MonthBars rates={values} width={width - 32} height={90} />
      <SeasonSliders values={values} onChange={setValues} />
      <PillButton
        label={t('Save these months')}
        icon="check"
        onPress={async () => {
          await setSeasonRates(values.map((v, i) => ({ month: i + 1, rideable: v, source: 'manual' as const })));
          router.back();
        }}
      />
      {climate ? (
        <PillButton
          label={t('Use the climate record instead')}
          variant="secondary"
          onPress={async () => {
            await setSeasonRates(seasonRatesFromClimate(climate, preset, limits));
            router.back();
          }}
        />
      ) : null}
      <PillButton
        label={t('Every day is rideable')}
        variant="ghost"
        onPress={async () => {
          await setSeasonRates(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, rideable: 1, source: 'default' as const })));
          router.back();
        }}
      />
    </SubScreen>
  );
}
