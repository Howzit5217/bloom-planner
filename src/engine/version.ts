/**
 * Versions, the Azzé way:
 *   - The version is MAJOR.MINOR.PATCH, raised on the user's word.
 *   - Every build also has a beta number. It goes up by one per beta build, and back to 0 when the
 *     version goes up. A full release is always built at beta 0.
 *   - Release builds show "1.0.2". Debug and beta builds show "1.0.2:b3".
 *   - Full releases are tagged v1.0.2; beta builds are GitHub pre-releases tagged v1.0.2-b3. Release
 *     builds and the download page only ever read the latest full release, so betas reach only the
 *     builder's own devices.
 */

export interface Build {
  major: number;
  minor: number;
  patch: number;
  beta: number;
}

const VERSION_RE = /^v?(\d{1,2})\.(\d{1,2})\.(\d{1,2})(?:[-:]b(\d{1,4}))?$/i;

/** "1.0.2", "v1.0.2", "1.0.2:b3" or "v1.0.2-b3". Null when it isn't one of those. */
export function parseBuild(s: string): Build | null {
  const m = VERSION_RE.exec(s.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), beta: m[4] ? Number(m[4]) : 0 };
}

export function compareBuilds(a: Build, b: Build): number {
  return Math.sign(a.major - b.major) || Math.sign(a.minor - b.minor) || Math.sign(a.patch - b.patch) || Math.sign(a.beta - b.beta);
}

export const versionText = (b: Build) => `${b.major}.${b.minor}.${b.patch}`;

/** What the app shows: "1.0.2" for a release, "1.0.2:b3" for a debug or beta build. */
export const shownVersion = (b: Build, beta: boolean) => (beta ? `${versionText(b)}:b${b.beta}` : versionText(b));

/** GitHub tag: v1.0.2 for a release, v1.0.2-b3 for a beta. */
export const tagFor = (b: Build, beta: boolean) => (beta ? `v${versionText(b)}-b${b.beta}` : `v${versionText(b)}`);

/**
 * Android versionCode: always rises with (version, beta). 1.0.2:b3 -> 100020003.
 * Android's ceiling is 2,100,000,000, which this reaches at 21.0.0, so versions stay below that.
 */
export const versionCodeFor = (b: Build) => ((b.major * 100 + b.minor) * 100 + b.patch) * 10000 + b.beta;

export interface ReleaseLite {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
}

/**
 * The newest release this build should be offered.
 * A release build takes only full releases. A beta build takes betas (pre-releases) too.
 */
export function newestRelease<T extends ReleaseLite>(releases: T[], current: Build, takeBetas: boolean): { release: T; build: Build } | null {
  let best: { release: T; build: Build } | null = null;
  for (const r of releases) {
    if (r.draft === true || typeof r.tag_name !== 'string') continue;
    if (r.prerelease === true && !takeBetas) continue;
    const b = parseBuild(r.tag_name);
    if (!b) continue;
    // A full release is always built at beta 0, whatever its tag says.
    if (r.prerelease !== true) b.beta = 0;
    if (!best || compareBuilds(b, best.build) > 0) best = { release: r, build: b };
  }
  return best && compareBuilds(best.build, current) > 0 ? best : null;
}
