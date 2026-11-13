/** The web version can't open the game or look through the phone's pictures: it picks a screenshot. */
export const canOpenPikmin = false;
/** A screenshot picked in the browser is a file of the device's: the web can't delete it. */
export const canDeleteScreenshots = false;

export interface ShotSource {
  contentUri?: string | null;
  assetId?: string | null;
  fileName?: string | null;
  width?: number;
  height?: number;
}

export type DeleteResult = 'deleted' | 'canceled' | 'missing' | 'denied' | 'failed';

export function openPikmin(): boolean {
  return false;
}

export async function allowPictures(): Promise<'all' | 'limited' | 'none'> {
  return 'none';
}

export async function newestPictureSince(_since: number): Promise<{ uri: string; source: ShotSource } | null> {
  return null;
}

export function forgetPicture(_uri: string) {}

export async function deleteScreenshot(_src: ShotSource): Promise<DeleteResult> {
  return 'failed';
}
