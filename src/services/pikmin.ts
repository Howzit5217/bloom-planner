import * as IntentLauncher from 'expo-intent-launcher';
import { AssetField, MediaType, Query, requestPermissionsAsync } from 'expo-media-library';

/** Pikmin Bloom's package on Android (plugins/withPikminQuery.js lets the app see it). */
const PIKMIN_BLOOM = 'com.nianticlabs.pikmin';

/** Whether this version can open the game and find the screenshot taken there (Android: yes). */
export const canOpenPikmin = true;

/** Opens Pikmin Bloom; false if it isn't on the phone. */
export function openPikmin(): boolean {
  try {
    IntentLauncher.openApplication(PIKMIN_BLOOM);
    return true;
  } catch {
    return false;
  }
}

/** Asks to see the phone's pictures, to find the screenshot taken in the game; whether it may. */
export async function allowPictures(): Promise<boolean> {
  try {
    return (await requestPermissionsAsync(false, ['photo'])).granted;
  } catch {
    return false;
  }
}

/**
 * The newest picture saved since `since` (ms): the screenshot just taken in the game, or null if
 * there's none. Newest by when the file was written, as a screenshot may carry no date it was taken.
 */
export async function newestPictureSince(since: number): Promise<string | null> {
  try {
    const assets = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.IMAGE).orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false }).limit(3).exe();
    for (const asset of assets) {
      const info = await asset.getInfo();
      if (Math.max(info.creationTime ?? 0, info.modificationTime ?? 0) >= since - 2000) return info.uri;
    }
  } catch {
    // No access, or nothing to read: as if there were none.
  }
  return null;
}
