import appJson from '../../../app.json';
import { compareBuilds, newestRelease, parseBuild, shownVersion, tagFor, versionCodeFor } from '../version';

describe('versions (:b# builds)', () => {
  it('parses every form', () => {
    expect(parseBuild('1.0.2')).toEqual({ major: 1, minor: 0, patch: 2, beta: 0 });
    expect(parseBuild('v1.0.2-b3')).toEqual({ major: 1, minor: 0, patch: 2, beta: 3 });
    expect(parseBuild('1.0.2:b17')).toEqual({ major: 1, minor: 0, patch: 2, beta: 17 });
    expect(parseBuild('nightly')).toBeNull();
  });

  it('shows the beta only on beta builds', () => {
    const b = parseBuild('1.0.2:b3')!;
    expect(shownVersion(b, true)).toBe('1.0.2:b3');
    expect(shownVersion(b, false)).toBe('1.0.2');
    expect(tagFor(b, true)).toBe('v1.0.2-b3');
    expect(tagFor(b, false)).toBe('v1.0.2');
  });

  it('versionCode always rises, and is above the first releases (1 and 2)', () => {
    const order = ['1.0.1', '1.0.1:b1', '1.0.1:b9', '1.0.2', '1.0.2:b1', '1.1.0', '2.0.0'].map((s) => versionCodeFor(parseBuild(s)!));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
    expect(order[0]).toBeGreaterThan(2);
    expect(versionCodeFor(parseBuild('20.99.99:b9999')!)).toBeLessThan(2100000000);
    expect(parseBuild('1.0.2:b10000')).toBeNull();
  });

  it('orders by version, then beta', () => {
    expect(compareBuilds(parseBuild('1.0.2')!, parseBuild('1.0.1:b40')!)).toBe(1);
    expect(compareBuilds(parseBuild('1.0.2:b1')!, parseBuild('1.0.2')!)).toBe(1);
  });

  const releases = [
    { tag_name: 'v1.0.1', prerelease: false },
    { tag_name: 'v1.0.2-b1', prerelease: true },
    { tag_name: 'v1.0.2-b2', prerelease: true },
    { tag_name: 'v1.0.3-b1', prerelease: true, draft: true },
  ];

  it('release builds are never offered a beta', () => {
    expect(newestRelease(releases, parseBuild('1.0.1')!, false)).toBeNull();
    expect(newestRelease(releases, parseBuild('1.0.0')!, false)?.build).toEqual(parseBuild('1.0.1'));
  });

  it('beta builds take the newest beta, never a draft', () => {
    expect(newestRelease(releases, parseBuild('1.0.1')!, true)?.release.tag_name).toBe('v1.0.2-b2');
    expect(newestRelease(releases, parseBuild('1.0.2:b2')!, true)).toBeNull();
  });

  it('a beta build moves on to the next full release', () => {
    const r = [...releases, { tag_name: 'v1.0.3', prerelease: false }];
    expect(newestRelease(r, parseBuild('1.0.2:b2')!, true)?.release.tag_name).toBe('v1.0.3');
  });

  describe('app.config.js', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dynamic = require('../../../app.config.js') as ((ctx: { config: any }) => any) & { versionCode: (v: string, b: number) => number };
    const withEnv = (variant: string | undefined, beta: number) => {
      const before = process.env.BLOOM_VARIANT;
      if (variant) process.env.BLOOM_VARIANT = variant;
      else delete process.env.BLOOM_VARIANT;
      try {
        return dynamic({ config: { ...appJson.expo, version: '1.0.2', extra: { ...appJson.expo.extra, beta } } });
      } finally {
        if (before === undefined) delete process.env.BLOOM_VARIANT;
        else process.env.BLOOM_VARIANT = before;
      }
    };

    it('uses the same versionCode formula as the app', () => {
      for (const s of ['1.0.1', '1.0.2:b3', '2.4.9:b120']) {
        const b = parseBuild(s)!;
        expect(dynamic.versionCode(`${b.major}.${b.minor}.${b.patch}`, b.beta)).toBe(versionCodeFor(b));
      }
    });

    it('builds a release at beta 0 and a beta at its number', () => {
      const rel = withEnv(undefined, 3);
      expect(rel.version).toBe('1.0.2');
      expect(rel.android.versionCode).toBe(100020000);
      expect(rel.extra).toMatchObject({ variant: 'release', beta: 3 });
      const beta = withEnv('beta', 3);
      expect(beta.version).toBe('1.0.2:b3');
      expect(beta.android.versionCode).toBe(100020003);
      expect(beta.extra.variant).toBe('beta');
    });

    it('app.json holds a plain version and a beta number', () => {
      expect(appJson.expo.version).toMatch(/^\d{1,2}\.\d{1,2}\.\d{1,2}$/);
      expect(Number.isInteger(appJson.expo.extra.beta)).toBe(true);
    });
  });
});
