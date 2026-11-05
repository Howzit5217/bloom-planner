import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Hand a text file to the phone's share sheet (save it, send it, open it in another app). */
export async function shareTextFile(name: string, text: string, mimeType: string, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType, dialogTitle, UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : undefined });
}
