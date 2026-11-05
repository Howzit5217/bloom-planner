import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import { climateSummary, seasonRatesFromClimate, type ClimateCache } from '@/engine/climate';
import type { PlayLocation, SeasonRate, ThresholdPreset } from '@/engine/types';
import { fetchClimate, placeLabel, searchPlaces, type Place } from '@/services/climateApi';
import { useTheme } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';
import { Banner } from '@/ui/Banner';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { PillButton } from '@/ui/PillButton';
import { Seedling } from '@/ui/skia/Seedling';
import { T } from '@/ui/T';
import { MonthBars } from './MonthBars';

export interface ClimateResult {
  location: PlayLocation;
  climate: ClimateCache;
  rates: SeasonRate[];
}

interface Props {
  preset: ThresholdPreset;
  /** "Looks right" */
  onAccept: (r: ClimateResult) => void;
  /** "Let me adjust these myself", a skip, or a failed lookup. `prefill` carries climate rates when there are some. */
  onManual: (prefill: ClimateResult | null, reason: 'adjust' | 'skip' | 'failed') => void;
  allowSkip?: boolean;
}

type Phase = { k: 'search' } | { k: 'loading'; label: string } | { k: 'result'; r: ClimateResult; unnamed: boolean } | { k: 'failed'; message: string };

const deviceTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto';
  } catch {
    return 'auto';
  }
};

/** Search a place (or use the current location), fetch its weather history, show the derived months. */
export function PlaceFinder({ preset, onAccept, onManual, allowSkip = true }: Props) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'search' });
  const [locError, setLocError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Debounced autocomplete (300ms).
  useEffect(() => {
    if (phase.k !== 'search') return;
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setSearching(true);
      setSearchError(null);
      try {
        setResults(await searchPlaces(q, ctrl.signal));
      } catch {
        if (!ctrl.signal.aborted) setSearchError("Couldn't search right now. Check your connection, or set your months by hand.");
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, phase.k]);

  const lookup = async (label: string, latitude: number, longitude: number, timezone: string, elevation: number | null, unnamed = false) => {
    setPhase({ k: 'loading', label: label || 'this spot' });
    try {
      const climate = await fetchClimate(latitude, longitude, timezone);
      const location: PlayLocation = { label, latitude, longitude, timezone, elevation, resolvedAt: new Date().toISOString(), climateYears: climate.years };
      setPhase({ k: 'result', r: { location, climate, rates: seasonRatesFromClimate(climate, preset) }, unnamed });
    } catch {
      setPhase({ k: 'failed', message: "I couldn't fetch the weather history for that spot. You can set your months by hand instead, and try again later from Settings." });
    }
  };

  const useMyLocation = async () => {
    setLocError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLocError('No problem. Location is off, so type a town instead.');
        return;
      }
      setPhase({ k: 'loading', label: 'your location' });
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const { latitude, longitude, altitude } = pos.coords;
      let label = '';
      try {
        const [g] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (g) label = placeLabel({ name: g.city ?? g.subregion ?? g.district ?? g.name ?? '', admin1: g.region, country: g.country });
      } catch {
        label = '';
      }
      await lookup(label, latitude, longitude, deviceTz(), altitude ?? null, !label);
    } catch {
      setPhase({ k: 'search' });
      setLocError("Couldn't get your location. Type a town instead.");
    }
  };

  if (phase.k === 'loading') {
    return (
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
        <GrowingSeedling />
        <T v="h3" center>
          Reading the weather history for {phase.label}…
        </T>
        <T v="small" soft center>
          Ten years of days, sorted into good and bad for planting. This takes a second or two.
        </T>
      </View>
    );
  }

  if (phase.k === 'failed') {
    return (
      <View style={{ gap: 16 }}>
        <Banner icon="weather-cloudy-alert" tone="alert" title="Weather lookup didn't work" text={phase.message} />
        <PillButton label="Set my months by hand" icon="tune-variant" onPress={() => onManual(null, 'failed')} />
        <PillButton label="Try again" variant="secondary" onPress={() => setPhase({ k: 'search' })} />
      </View>
    );
  }

  if (phase.k === 'result') {
    const { r, unnamed } = phase;
    const s = climateSummary(r.rates);
    const name = r.location.label || `${r.location.latitude.toFixed(2)}, ${r.location.longitude.toFixed(2)}`;
    return (
      <View style={{ gap: 14 }}>
        <Card>
          <T v="h2">{name}</T>
          <T v="small" soft>
            Based on the last {r.climate.years} years of weather here.
          </T>
          <T v="body" style={{ marginTop: 10 }}>
            Best months: {s.bestText}, around {s.bestDays} rideable days each.
          </T>
          <T v="body">
            Worst months: {s.worstText}, around {s.worstDays}.
          </T>
          <View style={{ marginTop: 14 }}>
            <MonthBars rates={r.rates.map((x) => x.rideable)} width={width - 48 - 36} />
          </View>
        </Card>
        {unnamed ? <Banner icon="map-marker-question" tone="nectar" text="I couldn't find a name for this spot. Is this where you plant? If not, try a different place." /> : null}
        <PillButton label="Looks right" icon="check" onPress={() => onAccept(r)} />
        <PillButton label="Let me adjust these myself" variant="secondary" icon="tune-variant" onPress={() => onManual(r, 'adjust')} />
        <PillButton label="Try a different place" variant="ghost" onPress={() => setPhase({ k: 'search' })} />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: c.canvasDeep,
          borderRadius: radius.field,
          paddingHorizontal: 14,
          minHeight: 58,
          boxShadow: `inset 0px 2px 5px 0px ${c.shadow}`,
        }}
      >
        <Icon name="magnify" size={22} color={c.inkSoft} />
        <TextInput
          accessibilityLabel="Town or city where you plant"
          value={query}
          onChangeText={setQuery}
          placeholder="Town or city"
          placeholderTextColor={c.inkSoft + '99'}
          autoCorrect={false}
          returnKeyType="search"
          style={{ flex: 1, fontFamily: font.bodyBold, fontSize: 18, color: c.ink, paddingVertical: 8 }}
        />
        {searching ? <ActivityIndicator color={c.leaf} /> : null}
      </View>
      {(query.trim().length >= 2 ? results : []).map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={p.label}
          onPress={() => lookup(p.label, p.latitude, p.longitude, p.timezone, p.elevation)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 52,
            paddingHorizontal: 14,
            borderRadius: 16,
            backgroundColor: pressed ? c.leafPale : c.card,
            boxShadow: `0px 2px 10px 0px ${c.shadow}`,
          })}
        >
          <Icon name="map-marker" size={20} color={c.leafDeep} />
          <T v="bodyBold" style={{ flex: 1 }} numberOfLines={2}>
            {p.label}
          </T>
        </Pressable>
      ))}
      {searchError ? <Banner icon="wifi-off" tone="alert" text={searchError} /> : null}
      {query.trim().length >= 2 && !searching && !results.length && !searchError ? (
        <T v="small" soft>
          No places found. Try a nearby town.
        </T>
      ) : null}
      <PillButton label="Use my current location" variant="secondary" icon="crosshairs-gps" onPress={useMyLocation} />
      {locError ? (
        <T v="small" soft>
          {locError}
        </T>
      ) : null}
      <T v="caption" soft>
        Only the coordinates are sent, and only to Open-Meteo, for weather history. With "current location", your phone's own maps service turns them into a place name.
      </T>
      {allowSkip ? <PillButton label="Skip, I'll set my months by hand" variant="ghost" onPress={() => onManual(null, 'skip')} /> : null}
    </View>
  );
}

function GrowingSeedling() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStage((s) => (s >= 7 ? 1 : s + 1)), 380);
    return () => clearInterval(t);
  }, []);
  return <Seedling stage={stage} size={120} />;
}
