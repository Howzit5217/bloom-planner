import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { loadData, Skia, type SkFont, type SkTypeface } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';

let face: SkTypeface | null = null;
let pending: Promise<SkTypeface | null> | null = null;

/**
 * The game numbers' typeface (Baloo 2 ExtraBold), loaded once for the whole app and kept: Skia's own
 * useFont loads the file again for every number on every mount, and gives up for good on the first
 * failure, which left numbers blank after a bad connection. A failed load is tried again, a little
 * later each time; after that, the next number to need it tries afresh.
 */
function loadFace(): Promise<SkTypeface | null> {
  if (face) return Promise.resolve(face);
  pending ??= (async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const tf = await loadData(Baloo2_800ExtraBold, (d) => Skia.Typeface.MakeFreeTypeFaceFromData(d));
        if (tf) {
          face = tf;
          return tf;
        }
      } catch {
        // Offline or the file didn't come: wait and try again.
      }
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
    pending = null;
    return null;
  })();
  return pending;
}

/**
 * Loads the face ahead of the first screen, so its numbers and badges open already drawn rather than
 * as plain text that then changes: the splash waits for this (or `ms`, whichever comes first).
 */
export function preloadGameFont(ms = 2000): Promise<void> {
  if (face) return Promise.resolve();
  return Promise.race([loadFace().then(() => undefined), new Promise<void>((r) => setTimeout(r, ms))]);
}

/** A Skia font in the game numbers' face at `size`, or null until it has loaded. */
export function useGameFont(size: number): SkFont | null {
  const [tf, setTf] = useState<SkTypeface | null>(() => face);
  useEffect(() => {
    if (tf) return;
    let live = true;
    void loadFace().then((t) => {
      if (live && t) setTf(t);
    });
    return () => {
      live = false;
    };
  }, [tf]);
  return useMemo(() => (tf ? Skia.Font(tf, size) : null), [tf, size]);
}
