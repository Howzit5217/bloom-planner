import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { deriveMonths, explainMonth, PRESET_LABELS, rideableDaysInMonth } from '@/engine/climate';
import { toKey } from '@/engine/dates';
import { fmtDate, MONTHS } from '@/engine/format';
import { MonthBars } from '@/features/shared/MonthBars';
import { fetchClimate } from '@/services/climateApi';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { Banner } from '@/ui/Banner';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { PillButton } from '@/ui/PillButton';
import { SubScreen } from '@/ui/SubScreen';
import { T } from '@/ui/T';

/** §9.5 Showing the work: let the user interrogate every monthly number. */
export default function Climate() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const location = useApp((s) => s.location);
  const climate = useApp((s) => s.climate);
  const preset = useApp((s) => s.settings.preset);
  const seasons = useApp((s) => s.seasonRates);
  const setLocationAndClimate = useApp((s) => s.setLocationAndClimate);
  const setSeasonRates = useApp((s) => s.setSeasonRates);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!location || !climate) {
    return (
      <SubScreen title="Climate">
        <T v="body">No place set yet. Find your place in Settings to see the weather behind your months.</T>
      </SubScreen>
    );
  }
  const months = deriveMonths(climate, preset);
  const manual = seasons.some((r) => r.source === 'manual');
  return (
    <SubScreen title="Climate">
      <Card style={{ gap: 6 }}>
        <T v="h2">{location.label || `${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`}</T>
        <T v="small" soft>
          {climate.years} years sampled ({climate.sampleDays.toLocaleString()} days), looked up {fmtDate(toKey(new Date(location.resolvedAt)))}. Threshold: {PRESET_LABELS[preset]}.
        </T>
        <View style={{ marginTop: 12 }}>
          <MonthBars rates={months.map((m) => m.rate)} width={width - 32 - 36} />
        </View>
      </Card>
      {manual ? <Banner icon="tune-variant" text="You've set your months by hand, so the planner uses those. These are what the weather record says." /> : null}
      <Card style={{ gap: 2 }}>
        {months.map((m, i) => (
          <Pressable key={m.month} accessibilityRole="button" accessibilityState={{ expanded: open === i }} onPress={() => setOpen(open === i ? null : i)} style={{ paddingVertical: 10, minHeight: 48 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="bodyBold">{MONTHS[i]}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T v="smallBold" color={m.rate >= 0.6 ? c.leafDeep : m.rate >= 0.35 ? c.nectar : c.alert}>
                  {rideableDaysInMonth(m.month, m.rate).toFixed(1)} days · {Math.round(m.rate * 100)}%
                </T>
                <Icon name={open === i ? 'chevron-up' : 'chevron-down'} size={20} color={c.inkSoft} />
              </View>
            </View>
            {open === i ? (
              <T v="small" soft style={{ marginTop: 6 }}>
                {explainMonth(m)}
              </T>
            ) : null}
          </Pressable>
        ))}
      </Card>
      {error ? <Banner icon="wifi-off" tone="alert" text={error} /> : null}
      <PillButton
        label={busy ? 'Recalculating…' : 'Recalculate'}
        icon="refresh"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const fresh = await fetchClimate(location.latitude, location.longitude, location.timezone);
            const keep = manual ? seasons : null;
            await setLocationAndClimate({ ...location, resolvedAt: new Date().toISOString(), climateYears: fresh.years }, fresh);
            if (keep) await setSeasonRates(keep);
          } catch {
            setError("Couldn't reach Open-Meteo. Your current months stay as they are; try again later.");
          } finally {
            setBusy(false);
          }
        }}
      />
      <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync('https://open-meteo.com')} style={{ minHeight: 44, justifyContent: 'center' }}>
        <T v="caption" soft>
          Weather data by Open-Meteo.com (CC BY 4.0). Only the coordinates are sent to it.
        </T>
      </Pressable>
    </SubScreen>
  );
}
