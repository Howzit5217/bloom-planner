import { View } from 'react-native';
import type { TempLimits } from '@/engine/climate';
import { cToF, fmtTemp, fToC, usesF, type TempUnit } from '@/engine/units';
import { Segmented } from '@/ui/Segmented';
import { Stepper } from '@/ui/Stepper';
import { T } from '@/ui/T';
import { useT } from '@/i18n';

/**
 * A temperature limit, set in the player's unit: whole degrees °C, or whole degrees °F (kept in °C to
 * the tenth, so it reads back as set). `range` is in °C. The other unit shows underneath.
 */
function TempLimit({ label, celsius, f, range, onChange }: { label: string; celsius: number; f: boolean; range: [number, number]; onChange: (celsius: number) => void }) {
  const { t } = useT();
  const shown = Math.round(f ? cToF(celsius) : celsius);
  const [lo, hi] = f ? [Math.round(cToF(range[0])), Math.round(cToF(range[1]))] : range;
  return (
    <View style={{ gap: 8 }}>
      <T v="smallBold">{label}</T>
      <Stepper label={label} value={shown} min={lo} max={hi} onChange={(v) => onChange(f ? Math.round(fToC(v) * 10) / 10 : v)} size={52} />
      <T v="caption" soft center>
        {t('Feels like {t} ({other})', { t: fmtTemp(celsius, f), other: fmtTemp(celsius, !f) })}
      </T>
    </View>
  );
}

/**
 * How temperatures show (the phone's way, °C or °F), and the too-hot and too-cold limits: feels-like
 * highs, for walking far and for riding alike. In setup and in Settings.
 */
export function WeatherLimits({ unit, onUnit, limits, onLimits }: { unit: TempUnit; onUnit: (u: TempUnit) => void; limits: TempLimits; onLimits: (l: TempLimits) => void }) {
  const { t } = useT();
  const f = usesF(unit);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <T v="smallBold">{t('Temperatures')}</T>
        <Segmented<TempUnit>
          label={t('Temperatures')}
          value={unit}
          onChange={onUnit}
          options={[
            { key: 'auto', label: t('Automatic') },
            { key: 'c', label: '°C' },
            { key: 'f', label: '°F' },
          ]}
        />
      </View>
      {/* Kept at least 5 degrees apart, so there are always days in between. */}
      <TempLimit label={t('Too hot above')} celsius={limits.hot} f={f} range={[20, 46]} onChange={(v) => onLimits({ ...limits, hot: Math.max(v, limits.cold + 5) })} />
      <TempLimit label={t('Too cold below')} celsius={limits.cold} f={f} range={[-15, 20]} onChange={(v) => onLimits({ ...limits, cold: Math.min(v, limits.hot - 5) })} />
    </View>
  );
}
