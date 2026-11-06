import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { AppState, Linking } from 'react-native';
import { create } from 'zustand';

/** Downloaded updates live here, and only until the next start. */
const dir = () => new Directory(Paths.cache, 'updates');

/** Intent.FLAG_GRANT_READ_URI_PERMISSION: lets the system installer read the downloaded file. */
const GRANT_READ = 1;
/** No data for this long and the download is given up on (the button offers to try again). */
const STALL_MS = 30_000;

export type UpdateStep = 'idle' | 'downloading' | 'ready' | 'failed';

interface UpdateInstall {
  step: UpdateStep;
  /** How much of it has come, 0 to 1, while downloading; null when the size isn't known. */
  share: number | null;
  /** Download the new APK in the app (or use the one already downloaded) and open Android's installer. */
  start: (apkUrl: string) => Promise<void>;
}

// The downloaded APK, kept for opening the installer again until the app next starts.
let downloaded: { url: string; file: File } | null = null;

/**
 * The update, shared by the popup and Home's banner so both show the same progress. It downloads in
 * the app with its progress, gives up on a stalled download (rather than sitting on "Downloading"
 * for ever), and then opens Android's installer: one tap on Install. (Android never lets an app from
 * outside the Play Store update itself silently; the first time it also asks to allow Bloom Planner
 * to install apps.) The installer waits for the app to be on screen, which Android requires, and can
 * be opened again from the button without downloading again.
 */
export const useUpdateInstall = create<UpdateInstall>((set, get) => ({
  step: 'idle',
  share: null,
  start: async (apkUrl) => {
    if (get().step === 'downloading') return;
    if (downloaded?.url === apkUrl && downloaded.file.exists) {
      set({ step: 'ready', share: 1 });
      await openInstaller(downloaded.file, apkUrl);
      return;
    }
    set({ step: 'downloading', share: null });
    try {
      const file = await download(apkUrl, (share) => set({ share }));
      downloaded = { url: apkUrl, file };
      set({ step: 'ready', share: 1 });
      await openInstaller(file, apkUrl);
    } catch {
      set({ step: 'failed', share: null });
    }
  },
}));

async function download(apkUrl: string, onShare: (share: number | null) => void): Promise<File> {
  const d = dir();
  if (d.exists) d.delete();
  d.create();
  const stop = new AbortController();
  let heard = Date.now();
  let shown = -1;
  const watch = setInterval(() => {
    if (Date.now() - heard > STALL_MS) stop.abort();
  }, 5000);
  try {
    return await File.downloadFileAsync(apkUrl, d, {
      idempotent: true,
      signal: stop.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        heard = Date.now();
        // Only a new whole percent changes the button.
        const pct = totalBytes > 0 ? Math.floor((bytesWritten / totalBytes) * 100) : -2;
        if (pct === shown) return;
        shown = pct;
        onShare(pct >= 0 ? Math.min(1, pct / 100) : null);
      },
    });
  } finally {
    clearInterval(watch);
  }
}

/** Once the app is on screen (Android won't start the installer from the background). */
function whenOnScreen(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      sub.remove();
      resolve();
    });
  });
}

async function openInstaller(file: File, apkUrl: string): Promise<void> {
  await whenOnScreen();
  // Not waited on: it only finishes when the installer closes. If it can't open, the browser takes over.
  IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    flags: GRANT_READ,
    type: 'application/vnd.android.package-archive',
  }).catch(() => Linking.openURL(apkUrl).catch(() => {}));
}

/** The last update's download is no longer needed once the app starts again. */
export function clearDownloadedUpdates(): void {
  downloaded = null;
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    // Nothing to clear.
  }
}
