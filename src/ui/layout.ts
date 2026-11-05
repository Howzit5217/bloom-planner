import { useWindowDimensions } from 'react-native';

/**
 * The widest the app gets. On a phone it's the whole screen; on a tablet or a computer the app
 * sits in a column this wide, centred, so nothing stretches or shrinks to an odd size.
 */
export const MAX_APP_WIDTH = 520;

/** The width the app's pages actually have: the screen's, up to MAX_APP_WIDTH. */
export function useAppWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, MAX_APP_WIDTH);
}

/** A screen wider than the app: the app keeps its column and the backdrop fills the rest. */
export function useWide(): boolean {
  return useWindowDimensions().width > MAX_APP_WIDTH;
}
