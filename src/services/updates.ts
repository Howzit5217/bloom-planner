import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { compareBuilds, newestRelease, parseBuild, shownVersion, type Build } from '@/engine/version';
import type { AppUpdateInfo } from '@/store/app';

/**
 * Updates come from the project's GitHub repository:
 *   - new app versions: the latest GitHub Release (with the Android APK attached); beta builds
 *     also see GitHub pre-releases (tagged v1.0.2-b3)
 *   - new level data: src/data/bloom-levels.json on the main branch
 * Only public files are requested; nothing about the user is sent.
 */
export const GITHUB_REPO: string = (Constants.expoConfig?.extra as { githubRepo?: string } | undefined)?.githubRepo ?? 'Howzit5217/bloom-planner';
export const REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
const LEVELS_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/src/data/bloom-levels.json`;

type Extra = { githubRepo?: string; beta?: number; variant?: string };
const EXTRA = (Constants.expoConfig?.extra ?? {}) as Extra;

/** A beta build (BLOOM_VARIANT=beta, see app.config.js): it shows ":bN" and takes beta updates. */
export const IS_BETA_BUILD = EXTRA.variant === 'beta';

/** This build. A beta build's version already reads "1.0.2:b3"; a release build is always at beta 0. */
export const THIS_BUILD: Build = (() => {
  const b = parseBuild(Constants.expoConfig?.version ?? '') ?? { major: 0, minor: 0, patch: 0, beta: 0 };
  return IS_BETA_BUILD ? b : { ...b, beta: 0 };
})();

/** What the app shows: "1.0.2" on a release build, "1.0.2:b3" on a beta or debug build. */
export const APP_VERSION: string = IS_BETA_BUILD
  ? shownVersion(THIS_BUILD, true)
  : __DEV__
    ? shownVersion({ ...THIS_BUILD, beta: Number(EXTRA.beta ?? 0) }, true)
    : shownVersion(THIS_BUILD, false);

/** Whether a saved update (AppUpdateInfo.version) is still newer than what is installed. */
export function isNewerThanThisBuild(version: string): boolean {
  const b = parseBuild(version);
  return !!b && compareBuilds(b, THIS_BUILD) > 0;
}

async function get(url: string, accept: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: accept } });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface GitHubRelease {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  html_url?: unknown;
  body?: unknown;
  assets?: unknown;
}

/**
 * The newest release this build should be offered, if any.
 * Release builds read only the latest full release (as the download page does), so betas never
 * reach anyone else. Beta builds, and a release build with the developer's Beta Updates on, read
 * recent releases, pre-releases included.
 */
export async function checkForAppUpdate(betaUpdates = false): Promise<AppUpdateInfo | null> {
  // The web version is the newest every time it loads; only the Android app has downloads.
  if (Platform.OS === 'web') return null;
  const api = `https://api.github.com/repos/${GITHUB_REPO}`;
  const takeBetas = IS_BETA_BUILD || betaUpdates;
  const res = await get(takeBetas ? `${api}/releases?per_page=30` : `${api}/releases/latest`, 'application/vnd.github+json');
  if (!res) return null;
  const json: unknown = await res.json().catch(() => null);
  const list = (Array.isArray(json) ? json : json && typeof json === 'object' ? [json] : []) as GitHubRelease[];
  const best = newestRelease(list, THIS_BUILD, takeBetas);
  if (!best) return null;
  const { release, build } = best;
  const assets = (Array.isArray(release.assets) ? release.assets : []) as Array<{ name?: unknown; browser_download_url?: unknown }>;
  const apk = assets.find((a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk'));
  return {
    version: shownVersion(build, release.prerelease === true),
    url: typeof release.html_url === 'string' ? release.html_url : RELEASES_URL,
    apkUrl: typeof apk?.browser_download_url === 'string' ? apk.browser_download_url : null,
    notes: typeof release.body === 'string' ? release.body.slice(0, 600) : '',
  };
}

/** The level file on main, as raw JSON (validated by the store before use). */
export async function fetchLatestLevelData(): Promise<unknown | null> {
  const res = await get(LEVELS_URL, 'application/json');
  if (!res) return null;
  return res.json().catch(() => null);
}
