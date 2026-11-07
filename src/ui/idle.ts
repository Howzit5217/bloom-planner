import { createContext, useContext, useEffect, useRef } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';

/** How often a decoration's idle motion moves on: about 30 times a second, plenty for a gentle sway. */
const STEP_MS = 33;

/** Whether the page is the one in view: set by the page around everything on it (Screen, PaperSheet). */
const PageFocus = createContext(true);
export const PageFocusProvider = PageFocus.Provider;

/**
 * Whether the page this is on is the one in view. Every tab stays mounted, so without this a hidden
 * page's flowers went on swaying (and being drawn again) behind Home, slowing its scrolling. Outside
 * any page (the window's own overlays, the setup screens) it counts as in view.
 */
export function usePageFocused(): boolean {
  return useContext(PageFocus);
}

/**
 * A decoration's slow idle clock: 0 to 1 over `period` ms, round and round (so a sine of it loops
 * without a seam), first starting after `delay` ms. It moves on about 30 times a second rather than
 * on every frame (a quarter of the drawing on a 120 Hz screen, and a gentle sway looks the same),
 * and only while its page is in view and `on`; with reduced motion it stays still.
 */
export function useIdleClock(period: number, { delay = 0, on = true }: { delay?: number; on?: boolean } = {}): SharedValue<number> {
  const { reduceMotion } = useTheme();
  const focused = usePageFocused();
  const phase = useSharedValue(0);
  const since = useSharedValue(0);
  const tick = useFrameCallback((info) => {
    since.value += Math.min(100, info.timeSincePreviousFrame ?? 0);
    if (since.value >= STEP_MS) {
      phase.value = (phase.value + since.value / period) % 1;
      since.value = 0;
    }
  }, false);
  const run = on && focused && !reduceMotion;
  // The delay is the first start's only: coming back to the page, it carries straight on.
  const started = useRef(false);
  useEffect(() => {
    if (!run) {
      tick.setActive(false);
      return;
    }
    const id = setTimeout(
      () => {
        started.current = true;
        tick.setActive(true);
      },
      started.current ? 0 : delay,
    );
    return () => {
      clearTimeout(id);
      tick.setActive(false);
    };
  }, [run, delay, tick]);
  return phase;
}
