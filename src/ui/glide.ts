import { useMemo } from 'react';
import { Platform } from 'react-native';
import { cancelAnimation, Easing, scrollTo, useAnimatedReaction, useSharedValue, withTiming, type AnimatedRef } from 'react-native-reanimated';
import type Animated from 'react-native-reanimated';

/** How long a glide takes: a short hop quickly, a long way a little longer, never a crawl. */
const glideMs = (distance: number) => Math.round(Math.min(420, 200 + Math.sqrt(Math.abs(distance)) * 5));

/**
 * A scroll view's animated scroll, at the app's own pace. A scroll view's own animated scrollTo runs on
 * Android's animation clock, which the device's animation-speed setting stretches or squeezes (or turns
 * off), so it went faster or slower than every other animation in the app; this one runs on the same
 * clock as the rest. The web keeps the browser's own smooth scrolling (no device setting changes it).
 * `stop` ends a glide at once (a finger taking over) and can be called from a worklet.
 */
export function useGlide(ref: AnimatedRef<Animated.ScrollView>, horizontal: boolean) {
  const at = useSharedValue(0);
  const on = useSharedValue(0);
  useAnimatedReaction(
    () => at.value,
    (v) => {
      if (on.get()) scrollTo(ref, horizontal ? v : 0, horizontal ? 0 : v, false);
    },
  );
  // The same two functions for the view's life, so what's built from them once stays right.
  return useMemo(() => {
    /** Glide from where the view is now (`from`) to `to`. */
    const go = (to: number, from: number) => {
      if (Platform.OS === 'web') {
        ref.current?.scrollTo(horizontal ? { x: to, animated: true } : { y: to, animated: true });
        return;
      }
      cancelAnimation(at);
      on.set(1);
      at.set(from);
      at.set(
        withTiming(to, { duration: glideMs(to - from), easing: Easing.out(Easing.cubic) }, (done) => {
          if (done) on.set(0);
        }),
      );
    };
    const stop = () => {
      'worklet';
      on.set(0);
      cancelAnimation(at);
    };
    // Whether a glide is under way (on the UI thread), so a scroll it makes can be told from a finger's.
    return { go, stop, active: on };
  }, [at, on, ref, horizontal]);
}
