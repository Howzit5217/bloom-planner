/** The web version can't open the game or look through the phone's pictures: it picks a screenshot. */
export const canOpenPikmin = false;

export function openPikmin(): boolean {
  return false;
}

export async function allowPictures(): Promise<'all' | 'limited' | 'none'> {
  return 'none';
}

export async function newestPictureSince(_since: number): Promise<string | null> {
  return null;
}

export function forgetPicture(_uri: string) {}
