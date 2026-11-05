import Constants from 'expo-constants';
import type { AppUpdateInfo } from '@/store/app';

/**
 * Updates come from the project's GitHub repository:
 *   - new app versions: the latest GitHub Release (with the Android APK attached)
 *   - new level data: src/data/bloom-levels.json on the main branch
 * Only public files are requested; nothing about the user is sent.
 */
export const GITHUB_REPO: string = (Constants.expoConfig?.extra as { githubRepo?: string } | undefined)?.githubRepo ?? 'Howzit5217/bloom-planner';
export const REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
const LEVELS_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/src/data/bloom-levels.json`;

/** The version baked into this build (app.json "version"), also correct inside Expo Go. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
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

/** The latest release, if it is newer than this build. */
export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  const res = await get(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, 'application/vnd.github+json');
  if (!res) return null;
  const json: any = await res.json().catch(() => null);
  const tag: string | undefined = json?.tag_name;
  if (!tag || compareVersions(tag, APP_VERSION) <= 0) return null;
  const assets: any[] = Array.isArray(json.assets) ? json.assets : [];
  const apk = assets.find((a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk'));
  return {
    version: tag.replace(/^v/i, ''),
    url: typeof json.html_url === 'string' ? json.html_url : RELEASES_URL,
    apkUrl: apk?.browser_download_url ?? null,
    notes: typeof json.body === 'string' ? json.body.slice(0, 600) : '',
  };
}

/** The level file on main, as raw JSON (validated by the store before use). */
export async function fetchLatestLevelData(): Promise<unknown | null> {
  const res = await get(LEVELS_URL, 'application/json');
  if (!res) return null;
  return res.json().catch(() => null);
}
