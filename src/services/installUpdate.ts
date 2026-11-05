import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';

/** Downloaded updates live here, and only until the next start. */
const dir = () => new Directory(Paths.cache, 'updates');

/** Intent.FLAG_GRANT_READ_URI_PERMISSION: lets the system installer read the downloaded file. */
const GRANT_READ = 1;

/**
 * Downloads the new APK inside the app and opens Android's installer on it: one tap on Install.
 * (Android never lets an app from outside the Play Store update itself silently.) The first time,
 * Android asks to allow Bloom Planner to install apps. If anything fails, the browser takes over,
 * as before.
 */
export async function downloadAndInstall(apkUrl: string): Promise<void> {
  try {
    const d = dir();
    if (d.exists) d.delete();
    d.create();
    const file = await File.downloadFileAsync(apkUrl, d);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      flags: GRANT_READ,
      type: 'application/vnd.android.package-archive',
    });
  } catch {
    await Linking.openURL(apkUrl).catch(() => {});
  }
}

/** The last update's download is no longer needed once the app starts again. */
export function clearDownloadedUpdates(): void {
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    // Nothing to clear.
  }
}
