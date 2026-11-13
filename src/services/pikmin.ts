import * as IntentLauncher from 'expo-intent-launcher';
import { File, Paths } from 'expo-file-system';
import { Asset, AssetField, MediaType, Query, requestPermissionsAsync } from 'expo-media-library';

/** Pikmin Bloom's package on Android (plugins/withPikminQuery.js lets the app see it). */
const PIKMIN_BLOOM = 'com.nianticlabs.pikmin';

/** Whether this version can open the game and find the screenshot taken there (Android: yes). */
export const canOpenPikmin = true;
/** Whether a screenshot read can be deleted from the phone's pictures afterwards (Android: yes). */
export const canDeleteScreenshots = true;

/** Where a screenshot read came from among the phone's pictures, so it can be deleted afterwards. */
export interface ShotSource {
  /** Its own address among the phone's pictures, when known (a screenshot found after the game). */
  contentUri?: string | null;
  /** What the picker told of a picked one: its id when it gives one, else its name and size to find it by. */
  assetId?: string | null;
  fileName?: string | null;
  width?: number;
  height?: number;
}

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
export async function newestPictureSince(since: number): Promise<{ uri: string; source: ShotSource } | null> {
  try {
    const assets = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.IMAGE).orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false }).limit(3).exe();
    for (const asset of assets) {
      const info = await asset.getInfo();
      if (Math.max(info.creationTime ?? 0, info.modificationTime ?? 0) >= since - 2000) return { uri: await localCopy(asset.id, info.uri), source: { contentUri: asset.id } };
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

export type DeleteResult = 'deleted' | 'canceled' | 'missing' | 'denied' | 'failed';

/**
 * Android's photo picker names what it hands over by the picture's number among the phone's pictures
 * ("516.png"), not the file's own name: that number finds it directly.
 */
const pickerNumber = (src: ShotSource) => src.fileName?.match(/^(\d+)\.[a-z0-9]+$/i)?.[1] ?? null;
const knownDirectly = (src: ShotSource) => !!(src.contentUri || src.assetId || pickerNumber(src));

/** A picked screenshot among the phone's pictures: by the id or number the picker gave, else by its name and size. */
async function findPicture(src: ShotSource): Promise<Asset | null> {
  if (src.contentUri) return new Asset(src.contentUri);
  const id = src.assetId ?? pickerNumber(src);
  if (id) {
    const asset = new Asset(id.startsWith('content://') ? id : `content://media/external/images/media/${id}`);
    // Where it can be looked at, it has to be the size of the screenshot read: never another picture.
    // (Where it can't, Android's question shows the picture before it goes.)
    try {
      const [w, h] = await Promise.all([asset.getWidth(), asset.getHeight()]);
      if (src.width && src.height && (w !== src.width || h !== src.height)) return null;
    } catch {
      // Not allowed to look: the question will show it.
    }
    return asset;
  }
  if (!src.fileName) return null;
  // The same size first (a screenshot is the screen's), then any recent picture of that name.
  const sized = src.width && src.height ? new Query().eq(AssetField.MEDIA_TYPE, MediaType.IMAGE).eq(AssetField.WIDTH, src.width).eq(AssetField.HEIGHT, src.height) : null;
  for (const q of [sized, new Query().eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)]) {
    if (!q) continue;
    const assets = await q.orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false }).limit(60).exe();
    for (const asset of assets) if ((await asset.getFilename()) === src.fileName) return asset;
  }
  return null;
}

/**
 * Deletes the screenshot just read from the phone's pictures. Android asks first, in its own words
 * ("Allow Bloom Planner to delete this photo?", with the picture): 'canceled' if the answer is no. A
 * picked screenshot the picker gave no number for is found by its name and size, which needs leave
 * to see the pictures ('denied' without it).
 */
export async function deleteScreenshot(src: ShotSource): Promise<DeleteResult> {
  if (!knownDirectly(src) && (await allowPictures()) === 'none') return 'denied';
  let asset: Asset | null = null;
  try {
    asset = await findPicture(src);
  } catch {
    return 'failed';
  }
  if (!asset) return 'missing';
  try {
    await asset.delete();
    return 'deleted';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Android's question answered no.
    if (/grant|permission|denied|cancel/i.test(message)) return 'canceled';
    if (/not found|no such|does not exist|doesn't exist/i.test(message)) return 'missing';
    return 'failed';
  }
}
