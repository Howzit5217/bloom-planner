import { Easing } from 'react-native';
import type { BottomTabNavigationOptions } from 'expo-router/tabs';

/** The tabs, left to right (the order of the tab bar). */
export const TAB_ORDER = ['index', 'progress', 'levels', 'settings'] as const;

/** How long the pages take to cross-fade when the tab changes. */
export const TAB_FADE_MS = 280;

/**
 * The last change of tab: from which tab to which, numbered left to right. `seq` goes up by one at
 * each change, so a page can tell a new change of tab from losing focus to a page opened over the
 * tabs (where nothing moves). The tab bar sets it before the pages hear of the change.
 */
export const tabMove = { from: 0, to: 0, seq: 0 };

export function noteTab(index: number, first: boolean) {
  if (first) {
    tabMove.from = index;
    tabMove.to = index;
    return;
  }
  if (index === tabMove.to) return;
  tabMove.from = tabMove.to;
  tabMove.to = index;
  tabMove.seq += 1;
}

/**
 * The pages cross-fade without the scene behind them ever thinning: the new page (always on top)
 * comes in over the first half while the old one stays as it is, which then goes under it. A plain
 * cross-fade let the background show through half way, a flash between two meadow strips.
 */
export const tabTransition: Pick<BottomTabNavigationOptions, 'animation' | 'sceneStyleInterpolator' | 'transitionSpec'> = {
  animation: 'fade',
  sceneStyleInterpolator: ({ current }) => ({
    sceneStyle: { opacity: current.progress.interpolate({ inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [0, 1, 1, 1, 0] }) },
  }),
  transitionSpec: { animation: 'timing', config: { duration: TAB_FADE_MS, easing: Easing.inOut(Easing.quad) } },
};
