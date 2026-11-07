// Expo config plugin: lets the app see Pikmin Bloom on the phone, so "Open Pikmin Bloom" can open it.
// Since Android 11 an app sees other apps only if its manifest names them (a <queries> entry).
const { withAndroidManifest } = require('expo/config-plugins');

const PIKMIN_BLOOM = 'com.nianticlabs.pikmin';

module.exports = function withPikminQuery(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.queries = manifest.queries ?? [];
    if (!manifest.queries.length) manifest.queries.push({});
    const queries = manifest.queries[0];
    queries.package = queries.package ?? [];
    if (!queries.package.some((p) => p.$?.['android:name'] === PIKMIN_BLOOM)) queries.package.push({ $: { 'android:name': PIKMIN_BLOOM } });
    return c;
  });
};
