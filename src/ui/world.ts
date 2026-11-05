import { makeMutable } from 'react-native-reanimated';

/**
 * How far Home's camera looks down (0 level, 1 all the way). Home's scrolling sets it; on a screen
 * wider than the app, the backdrop behind the app's column follows it too, so the meadow beyond the
 * column tilts with the one inside.
 */
export const worldTilt = makeMutable(0);

/** Home: the horizon with the camera level, as a share of the screen from the top: about half, as in the game. */
export const SKY_SHARE = 0.52;
