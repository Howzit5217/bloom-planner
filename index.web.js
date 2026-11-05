// The web version's entry (the iPhone web app). Skia draws with CanvasKit, a WebAssembly build of
// the same engine, which has to finish loading before any screen that draws is even imported.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// The site lives under a path (/bloom-planner/app); canvaskit.wasm is served from there too.
const base = process.env.EXPO_BASE_URL ?? '';

LoadSkiaWeb({ locateFile: (file) => `${base}/${file}` }).then(() => {
  require('expo-router/entry');
});
