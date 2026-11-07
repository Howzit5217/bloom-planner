import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';

export type ScreenshotText = { lines: string[] } | { error: 'canceled' | 'unsupported' | 'failed' };

/** Grey from the three channels, as bright as the eye sees it. */
const GREY = [0.299, 0.587, 0.114];

/**
 * A colour matrix taking one mix of the channels (`weights`), its contrast stretched `gain` times
 * about the middle, the same in all three channels (so a grey picture), inverted if asked.
 */
function toneMatrix(weights: number[], gain: number, invert: boolean): number[] {
  const k = invert ? -gain : gain;
  const row = [weights[0] * k, weights[1] * k, weights[2] * k, 0, invert ? 0.5 + gain * 0.5 : 0.5 - gain * 0.5];
  return [...row, ...row, ...row, 0, 0, 0, 1, 0];
}

/**
 * Copies of the part of the screenshot with the player's name (its top half, beside the level
 * badge), enlarged, so a name in a colour or a faint one still reads: in high-contrast grey, the same
 * inverted, and each colour channel on its own (a pink, gold or blue name stands out in one of them).
 * Saved as files for the text reader; any that can't be made are left out.
 */
async function nameCopies(uri: string): Promise<string[]> {
  const out: string[] = [];
  let image: SkImage | null = null;
  try {
    image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  } catch {
    return out;
  }
  if (!image) return out;
  const w = image.width();
  const h = Math.round(image.height() * 0.5);
  const scale = Math.min(2, 2400 / Math.max(1, w));
  const variants: Array<{ weights: number[]; gain: number; invert: boolean }> = [
    { weights: GREY, gain: 1.8, invert: false },
    { weights: GREY, gain: 1.8, invert: true },
    { weights: [1, 0, 0], gain: 1.6, invert: true },
    { weights: [0, 1, 0], gain: 1.6, invert: true },
    { weights: [0, 0, 1], gain: 1.6, invert: true },
  ];
  for (let i = 0; i < variants.length; i++) {
    try {
      const v = variants[i];
      const surface = Skia.Surface.MakeOffscreen(Math.round(w * scale), Math.round(h * scale));
      if (!surface) continue;
      const canvas = surface.getCanvas();
      canvas.scale(scale, scale);
      const paint = Skia.Paint();
      paint.setColorFilter(Skia.ColorFilter.MakeMatrix(toneMatrix(v.weights, v.gain, v.invert)));
      canvas.drawImage(image, 0, 0, paint);
      surface.flush();
      const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG, 100);
      surface.dispose();
      const file = new File(Paths.cache, `screenshot-read-${i}.png`);
      if (file.exists) file.delete();
      file.create();
      file.write(bytes);
      out.push(file.uri);
    } catch {
      // That copy is left out; the others still help.
    }
  }
  return out;
}

/** Done reading: the copies go. */
function dropCopies(uris: string[]) {
  for (const u of uris) {
    try {
      const f = new File(u);
      if (f.exists) f.delete();
    } catch {
      // Already gone.
    }
  }
}

/**
 * Pick a screenshot and read its text on the phone (Google ML Kit on Android, Apple Vision on
 * iOS): the screenshot as it is, then the cleaned-up copies of the name's part of it. The picture
 * never leaves the phone. Expo Go has no text reader, so it says so there.
 */
export async function pickScreenshotText(): Promise<ScreenshotText> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const uri = picked.canceled ? null : picked.assets?.[0]?.uri;
  if (!uri) return { error: 'canceled' };
  let reader: typeof import('expo-text-extractor');
  try {
    reader = await import('expo-text-extractor');
    if (!reader.isSupported) return { error: 'unsupported' };
  } catch {
    return { error: 'unsupported' };
  }
  let lines: string[];
  try {
    const blocks = await reader.extractTextFromImage(uri);
    lines = blocks.flatMap((b) => b.split(/\r?\n/));
  } catch {
    return { error: 'failed' };
  }
  // The copies only add to what the screenshot itself gave.
  const copies = await nameCopies(uri).catch(() => [] as string[]);
  for (const copy of copies) {
    try {
      const blocks = await reader.extractTextFromImage(copy);
      lines.push(...blocks.flatMap((b) => b.split(/\r?\n/)));
    } catch {
      // Skip that copy.
    }
  }
  dropCopies(copies);
  return { lines };
}
