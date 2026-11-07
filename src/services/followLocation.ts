import * as Location from 'expo-location';
import { placeLabel } from '@/services/climateApi';
import { useApp } from '@/store/app';

/** Moved less than this (km) from the place, it stays put: a walk round town doesn't change the sky. */
const MOVED_KM = 3;
/** Looked at most this often, whatever asks. */
const EVERY = 4 * 60_000;

let busy = false;
let lastTry = 0;

const deviceTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto';
  } catch {
    return 'auto';
  }
};

/** Distance between two places, km (on a round Earth). */
function km(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const r = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * r;
  const dLon = (b.longitude - a.longitude) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Turning Follow Your Location on: asks to use the location while the app is open. True when allowed. */
export async function allowFollowing(): Promise<boolean> {
  try {
    return (await Location.requestForegroundPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

/**
 * With Follow Your Location on, the place moves to where the phone is once it's a few km away, so the
 * sky, the forecast and the weather alerts are for where you are. Only while the app is open (it
 * never asks for the location in the background), and the months stay as they were: they're
 * the home place's weather history. `now` looks straight away (it was just turned on).
 */
export async function followLocation(now = false): Promise<void> {
  if (!useApp.getState().settings.followLocation || busy) return;
  if (!now && Date.now() - lastTry < EVERY) return;
  busy = true;
  lastTry = Date.now();
  try {
    if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return;
    let pos: Location.LocationObject | null = null;
    try {
      pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000, requiredAccuracy: 5000 });
    } catch {
      pos = null;
    }
    pos ??= await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const { latitude, longitude } = pos.coords;
    const here = useApp.getState().location;
    if (here && km(here, { latitude, longitude }) < MOVED_KM) return;
    let label = '';
    try {
      const [g] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (g) label = placeLabel({ name: g.city ?? g.subregion ?? g.district ?? g.name ?? '', admin1: g.region, country: g.country });
    } catch {
      label = '';
    }
    await useApp.getState().moveLocation({ latitude, longitude, label, timezone: deviceTz() });
  } catch {
    // No fix right now: it tries again later.
  } finally {
    busy = false;
  }
}
