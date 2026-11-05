// The dynamic part of the app config: which build this is, and its version.
//
// app.json holds the version (expo.version, "1.0.2") and the beta number (expo.extra.beta).
//   BLOOM_VARIANT=beta  a beta build for the developer's own devices. Shows "1.0.2:b3", takes beta
//                       updates (GitHub pre-releases), and its versionCode sits above the 1.0.2 release.
//   anything else       a release build. Shows "1.0.2" and only ever sees full releases.
// `expo start` (debug) is a release-variant config, but the app shows ":bN" there too, like the
// other apps' debug builds.
//
// The versionCode formula is the same as versionCodeFor() in src/engine/version.ts (a test checks it).

function versionCode(version, beta) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/.exec(version);
  if (!m) throw new Error(`app.json "version" must be MAJOR.MINOR.PATCH (got "${version}")`);
  if (!Number.isInteger(beta) || beta < 0 || beta > 9999) throw new Error(`app.json "extra.beta" must be 0 to 9999 (got ${beta})`);
  return ((Number(m[1]) * 100 + Number(m[2])) * 100 + Number(m[3])) * 10000 + beta;
}

module.exports = ({ config }) => {
  const variant = process.env.BLOOM_VARIANT === 'beta' ? 'beta' : 'release';
  const beta = Number(config.extra?.beta ?? 0);
  const built = variant === 'beta' ? beta : 0;
  return {
    ...config,
    // Android's versionName comes from here, so a beta shows as "1.0.2:b3" in system settings too.
    version: variant === 'beta' ? `${config.version}:b${beta}` : config.version,
    android: { ...config.android, versionCode: versionCode(config.version, built) },
    extra: { ...config.extra, variant, beta },
  };
};

module.exports.versionCode = versionCode;
