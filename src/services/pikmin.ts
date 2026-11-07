import * as IntentLauncher from 'expo-intent-launcher';
import { File, Paths } from 'expo-file-system';
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

/**
 * Asks to see the phone's pictures, to find the screenshot taken in the game: 'all' when it may,
 * 'limited' when only pictures picked one by one are allowed (a new screenshot isn't among them), or
 * 'none'.
 */
export async function allowPictures(): Promise<'all' | 'limited' | 'none'> {
  try {
    const r = await requestPermissionsAsync(false, ['photo']);
    if (!r.granted) return 'none';
    return r.accessPrivileges === 'limited' ? 'limited' : 'all';
  } catch {
    return 'none';
  }
}

/** The copy of a found screenshot that gets read: in the app's own cache, under a plain name. */
const COPY_NAME = 'from-pikmin-bloom.img';

/**
 * The newest picture saved since `since` (ms): the screenshot just taken in the game, or null if
 * there's none. Newest by when the file was written, as a screenshot may carry no date it was taken.
 * It comes back as a copy in the app's cache, read from there just as a picked screenshot is (see
 * localCopy); forgetPicture deletes it once it's read.
 */
export async function newestPictureSince(since: number): Promise<string | null> {
  try {
    const assets = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.IMAGE).orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false }).limit(3).exe();
    for (const asset of assets) {
      const info = await asset.getInfo();
      if (Math.max(info.creationTime ?? 0, info.modificationTime ?? 0) >= since - 2000) return await localCopy(asset.id, info.uri);
    }
  } catch {
    // No access, or nothing to read: as if there were none.
  }
  return null;
}

/**
 * The screenshot copied into the app's cache. Read where it lies, among the phone's pictures, it
 * couldn't be: its name has the game's in it ("Screenshot_..._Pikmin Bloom.jpg"), the space came
 * through as "%20", and the text reader, taking it as a file's path, found no such file. A picked
 * screenshot was always a copy in the cache already, which is why that way worked.
 */
async function localCopy(contentUri: string, fileUri: string): Promise<string> {
  const copy = new File(Paths.cache, COPY_NAME);
  for (const from of [contentUri, fileUri]) {
    try {
      if (copy.exists) copy.delete();
      await new File(from).copy(copy);
      if (copy.exists) return copy.uri;
    } catch {
      // The other way of reaching it, or failing both, its own path read as it is.
    }
  }
  return decodeURI(fileUri);
}

/** Done with a found screenshot: its copy goes. */
export function forgetPicture(uri: string) {
  try {
    const f = new File(uri);
    if (uri.endsWith(COPY_NAME) && f.exists) f.delete();
  } catch {
    // Already gone.
  }
}
