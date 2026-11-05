// Expo config plugin: sign Android release builds with the project's own upload key, and
// limit the APK to the ABIs real devices use. Keeps the managed workflow: android/ is generated.
//
// The key is read from environment variables at build time (never committed):
//   BLOOM_UPLOAD_STORE_FILE      absolute path to the .jks keystore
//   BLOOM_UPLOAD_STORE_PASSWORD
//   BLOOM_UPLOAD_KEY_ALIAS
//   BLOOM_UPLOAD_KEY_PASSWORD
// Without them, release builds fall back to the debug key (fine for local testing only).
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const RELEASE_BLOCK = `
        release {
            if (System.getenv('BLOOM_UPLOAD_STORE_FILE')) {
                storeFile file(System.getenv('BLOOM_UPLOAD_STORE_FILE'))
                storePassword System.getenv('BLOOM_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('BLOOM_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('BLOOM_UPLOAD_KEY_PASSWORD')
            }
        }`;

function patchBuildGradle(src) {
  if (src.includes('BLOOM_UPLOAD_STORE_FILE')) return src;
  const sc = src.indexOf('signingConfigs {');
  if (sc < 0) throw new Error('withReleaseSigning: signingConfigs block not found');
  const insertAt = sc + 'signingConfigs {'.length;
  src = src.slice(0, insertAt) + RELEASE_BLOCK + src.slice(insertAt);
  const bt = src.indexOf('buildTypes {');
  const rel = src.indexOf('release {', bt);
  const line = 'signingConfig signingConfigs.debug';
  const at = src.indexOf(line, rel);
  if (bt < 0 || rel < 0 || at < 0) throw new Error('withReleaseSigning: release buildType not found');
  return (
    src.slice(0, at) +
    "signingConfig System.getenv('BLOOM_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug" +
    src.slice(at + line.length)
  );
}

module.exports = function withReleaseSigning(config, { architectures = 'armeabi-v7a,arm64-v8a,x86_64' } = {}) {
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = patchBuildGradle(cfg.modResults.contents);
    return cfg;
  });
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'reactNativeArchitectures'));
    props.push({ type: 'property', key: 'reactNativeArchitectures', value: architectures });
    cfg.modResults = props;
    return cfg;
  });
  return config;
};

module.exports.patchBuildGradle = patchBuildGradle;
