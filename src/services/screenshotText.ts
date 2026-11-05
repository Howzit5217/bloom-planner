import * as ImagePicker from 'expo-image-picker';

export type ScreenshotText = { lines: string[] } | { error: 'canceled' | 'unsupported' | 'failed' };

/**
 * Pick a screenshot and read its text on the phone (Google ML Kit on Android, Apple Vision on
 * iOS). The picture never leaves the phone. Expo Go has no text reader, so it says so there.
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
  try {
    const blocks = await reader.extractTextFromImage(uri);
    return { lines: blocks.flatMap((b) => b.split(/\r?\n/)) };
  } catch {
    return { error: 'failed' };
  }
}
