import { bortleOf } from '@/engine/lightPollution';
import { fetchTownSize } from '@/services/climateApi';
import { useApp } from '@/store/app';

let busy = false;

/**
 * Works out how light-polluted the location's night sky is (once for each place it's set to), from
 * the size of the town it's in and how far from its middle, for the stars the sky shows there.
 * Offline it tries again next time.
 */
export async function judgeNightSky(): Promise<void> {
  const loc = useApp.getState().location;
  if (!loc || busy) return;
  const known = loc.nightSky;
  if (known && Math.abs(known.latitude - loc.latitude) < 0.01 && Math.abs(known.longitude - loc.longitude) < 0.01) return;
  busy = true;
  try {
    const town = await fetchTownSize(loc.label, loc.latitude, loc.longitude);
    // Still the same place when the answer comes.
    const now = useApp.getState().location;
    if (now && now.latitude === loc.latitude && now.longitude === loc.longitude) await useApp.getState().setNightSky(bortleOf(town?.population, town?.km));
  } catch {
    // Offline: next time.
  } finally {
    busy = false;
  }
}
