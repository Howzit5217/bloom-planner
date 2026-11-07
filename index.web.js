// The web version's entry (the iPhone web app). Skia draws with CanvasKit, a WebAssembly build of
// the same engine, which has to finish loading before any screen that draws is even imported.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// The site lives under a path (/bloom-planner/app); canvaskit.wasm is served from there too. The
// development server serves public files from the root instead.
const base = __DEV__ ? '' : (process.env.EXPO_BASE_URL ?? '');

// The built site names canvaskit.wasm for its contents (tools/web-finish.js), so it can be kept.
const named = (file) => (file === 'canvaskit.wasm' && globalThis.__CANVASKIT_WASM__) || file;

LoadSkiaWeb({ locateFile: (file) => `${base}/${named(file)}` }).then(() => {
  require('expo-router/entry');
});
