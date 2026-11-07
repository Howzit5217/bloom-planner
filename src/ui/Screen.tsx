import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, RefreshControl, TextInput, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { GestureDetector, useNativeGesture, usePanGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useSkyLook } from '@/store/sky';
import { useTheme } from '@/theme/theme';
import { SPRING } from '@/theme/tokens';
import { EdgeFade } from './EdgeFade';
import { useAppWidth, useWide } from './layout';
import { ScrollRail, useScrollRail } from './ScrollRail';
import { cameraFrame, horizonAt } from './camera';
import { SKY_SHARE, worldTilt } from './world';
import { CameraMeadow } from './skia/CameraMeadow';
import { Meadow } from './skia/Meadow';
import { Seedling } from './skia/Seedling';
import { TAB_BAR_SPACE } from './TabBar';
import { useGlide } from './glide';
import { useT } from '@/i18n';

/** Whether the app has shown its first page yet (that one doesn't slide in). */
let appOpened = false;

/** Tab switch: content cross-fades with an 8px vertical slide. */
export function FocusFade({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  // The page the app opens on is simply there: sliding in after the splash looked like a jump.
  const [opening] = useState(() => focused && !appOpened);
  const p = useSharedValue(opening ? 1 : 0);
  const skip = useRef(opening);
  useEffect(() => {
    appOpened = true;
  }, []);
  useEffect(() => {
    if (!focused) return;
    if (skip.current) {
      skip.current = false;
      return;
    }
    p.value = 0;
    p.value = withSpring(1, SPRING);
  }, [focused, p]);
  const a = useAnimatedStyle(() => ({ flex: 1, opacity: Math.min(1, p.value * 1.4), transform: [{ translateY: (1 - p.value) * 8 }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

const PULL_FULL = 110;
/** While refreshing, a page pulled by hand holds this far down, the seedling growing in the gap. */
const HOLD = 78;
/** How far above the keyboard a box being typed in comes to rest. */
const KEYBOARD_GAP = 48;
/** Scrolling this many times the horizon's climb tilts the camera all the way down, so the scene moves slower than the cards. */
const TILT_SCROLL = 1.8;
/** A pulled page settles back up without overshooting past the top. */
const SETTLE = { damping: 22, stiffness: 200, mass: 1, overshootClamping: true } as const;
/** Where the paper pages' sheet starts, below the safe area: the meadow strip shows above it. */
const SHEET_TOP = 66;
/** Home: how far below the status bar the cards fade out as they scroll up under the top. */
const TOP_FADE = 48;

/** Light status-bar text under a night or stormy sky; the theme's otherwise. Only the focused page sets it. */
function SkyStatusBar() {
  const { isDark } = useTheme();
  const look = useSkyLook();
  const focused = useIsFocused();
  return focused ? <StatusBar style={look.darkSky || isDark ? 'light' : 'dark'} /> : null;
}

/**
 * Whether this page draws its pictures now. On the web each drawing canvas takes one of the
 * browser's few graphics contexts (about sixteen) and the oldest are dropped past that, which blanked
 * Home's drawings once every tab had been opened. So there a page out of sight lets go of its
 * drawings and makes them afresh when it's back. In the app every page keeps them.
 */
function useLive(): boolean {
  const focused = useIsFocused();
  return Platform.OS !== 'web' || focused;
}

/**
 * The paper pages' look: a strip of sky and field along the top and a cream sheet over it that
 * holds the page. Everything scrolls inside the sheet, so nothing slides over the sky or the status bar.
 */
export function PaperSheet({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  // Wider than the app, the meadow behind the whole window shows above the sheet instead.
  const wide = useWide();
  const live = useLive();
  // Out of sight on the web, nothing at all, not even the empty sheet: the page stays behind the
  // others, and on a wide screen Home is see-through, so its sheet showed through Home.
  if (!live) return <View style={{ flex: 1 }} />;
  return (
    <View style={{ flex: 1, backgroundColor: wide ? 'transparent' : c.canvas }}>
      <SkyStatusBar />
      {wide ? null : (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          {/* The sun and moon keep to the strip of sky under the status bar, on their paths. */}
          <Meadow height={insets.top + SHEET_TOP + 26} horizon={insets.top + SHEET_TOP - 24} density={1.4} skyTop={insets.top + 15} />
        </View>
      )}
      <View style={{ flex: 1, marginTop: insets.top + SHEET_TOP, backgroundColor: c.canvas, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' }}>
        {children}
        <EdgeFade edge="top" color={c.canvas} height={16} />
      </View>
    </View>
  );
}

interface Props {
  children: ReactNode;
  /** 'meadow': full grassy backdrop (Home). 'paper': warm canvas with a flower strip on top. */
  backdrop?: 'meadow' | 'paper';
  onRefresh?: () => Promise<void>;
  header?: ReactNode;
  bottomExtra?: ReactNode;
}

/**
 * Scrollable page with the backdrop, safe areas, tab-bar clearance and an optional pull-to-refresh.
 * The refresh shows only a seedling sprouting above the content, growing with the pull: never the
 * platform's spinner circle. On iOS the page's own bounce gives the pull (its spinner hidden);
 * Android and the web, whose spinner can't be hidden, follow the finger by hand.
 */
export function Screen({ children, backdrop = 'paper', onRefresh, header, bottomExtra }: Props) {
  const { t } = useT();
  const look = useSkyLook();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const growth = useSharedValue(0);
  const shown = useSharedValue(0);
  const [refreshing, setRefreshing] = useState(false);
  // The same, for the pull's gesture on the UI thread.
  const busy = useSharedValue(0);
  const pullY = useSharedValue(0);

  const run = async () => {
    setRefreshing(true);
    busy.value = 1;
    shown.value = withTiming(1, { duration: 150 });
    growth.value = withTiming(7, { duration: 900 });
    // Pulled by hand, the page holds open while it refreshes, the seedling growing in the gap above.
    if (Platform.OS !== 'ios') pullY.value = withSpring(HOLD, SETTLE);
    const started = Date.now();
    try {
      await onRefresh?.();
    } finally {
      setTimeout(() => {
        setRefreshing(false);
        busy.value = 0;
        shown.value = withTiming(0, { duration: 300 });
        growth.value = withTiming(0, { duration: 300 });
        pullY.value = withSpring(0, SETTLE);
      }, Math.max(0, 1100 - (Date.now() - started)));
    }
  };

  const sprout = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: 0.7 + 0.3 * shown.value }] }));
  const rail = useScrollRail();
  // Home: a camera over the meadow that tilts down as the page scrolls, until the field fills the screen.
  const appWidth = useAppWidth();
  // Down under Android's navigation bar too, where the app is drawn past the window's height: cut
  // short there, the bare ground colour showed as a band along the bottom.
  const below = Platform.OS === 'android' ? insets.bottom : 0;
  const frame = useMemo(() => cameraFrame(appWidth, height, Math.round(height * SKY_SHARE), below), [appWidth, height, below]);
  // Shared with the backdrop behind the app's column on a wide screen, so both tilt together.
  const tilt = worldTilt;
  const wide = useWide();
  const live = useLive();
  // The meadow's flowers sway only while Home is the page in view.
  const inView = useIsFocused();
  const tiltScroll = (frame.cy + 36) * TILT_SCROLL;
  const meadow = backdrop === 'meadow';
  // Tied straight to the scroll, so it moves exactly as smoothly as the page does: a spring restarted
  // on every scroll event lagged, then caught up in little steps when events came unevenly. Easing
  // in and out at the ends keeps the start and the finish soft. Only Home's own scroll moves it: the
  // other pages scrolled it too, and Home came back looking down at the field from the top.
  const tiltAt = (y: number) => {
    'worklet';
    const k = Math.min(1, Math.max(0, y / tiltScroll));
    return k * k * (3 - 2 * k) * 0.35 + k * 0.65;
  };
  useAnimatedReaction(
    () => rail.y.value,
    (y) => {
      if (meadow) tilt.value = tiltAt(y);
    },
  );
  // Back on a page: on the web its scroller was let go while out of sight and comes back at the top, so
  // the rail starts there again too; and Home's camera looks where Home is, whatever happened meanwhile.
  useEffect(() => {
    if (!inView) return;
    if (Platform.OS === 'web') rail.y.set(0);
    if (meadow) tilt.set(tiltAt(rail.y.get()));
    // tiltAt only changes with the window's size, which a scroll catches up with anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, meadow, rail, tilt]);
  // The fade under the status bar is in the sky's colour while the sky is still up there, the
  // field's once the camera looks down: one gives way to the other, never both half-showing.
  const skyShare = useDerivedValue(() => Math.min(1, Math.max(0, horizonAt(frame, tilt.value) / (insets.top + 24))));
  const skyFade = useAnimatedStyle(() => ({ opacity: skyShare.value }));
  const fieldFade = useAnimatedStyle(() => ({ opacity: 1 - skyShare.value }));
  // The fade eases in (and slides down a touch) as soon as the page moves, however fast it's flung,
  // and out again back at the top; at rest it's not there at all, so nothing lines the sky.
  const fadeIn = useSharedValue(0);
  useAnimatedReaction(
    () => rail.y.value > 4,
    (moved, before) => {
      if (moved !== before) fadeIn.value = withTiming(moved ? 1 : 0, { duration: moved ? 260 : 200, easing: Easing.out(Easing.cubic) });
    },
  );
  const scrolled = useAnimatedStyle(() => ({ opacity: fadeIn.value, transform: [{ translateY: (fadeIn.value - 1) * 12 }] }));
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Lifting a box clear of the keyboard runs at the app's own pace, whatever the device's animation speed.
  const lift = useGlide(scrollRef, false);
  // Typing: the box being typed in scrolls up clear of the keyboard, with room made below the page
  // so even the last box can rise above it. Only the page in view does this.
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    if (!inView || Platform.OS === 'web') return;
    const reveal = (keyboardTop: number) => {
      const input = TextInput.State.currentlyFocusedInput() as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
      input?.measureInWindow?.((_x, y, _w, h) => {
        const over = y + h + KEYBOARD_GAP - keyboardTop;
        if (over > 0) lift.go(rail.y.get() + over, rail.y.get());
      });
    };
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeyboard(e.endCoordinates.height);
      // Once the room below is laid out, the box moves up.
      setTimeout(() => reveal(e.endCoordinates.screenY), 60);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [inView, rail, lift]);
  const pullGrows = !!onRefresh && Platform.OS === 'ios';
  // By hand (Android, the web): at the top, a drag down eases the page down as the seedling grows;
  // let go past the line and it refreshes, short of it and everything springs back. Android follows
  // the finger with a gesture beside the page's own scrolling (touch events alone were cancelled the
  // moment the page claimed the drag); the web, where the browser scrolls, with the touches.
  const viaGesture = !!onRefresh && Platform.OS === 'android';
  const byHand = !!onRefresh && Platform.OS === 'web';
  const pullFrom = useRef<number | null>(null);
  const pulling = useSharedValue(0);
  const startY = useSharedValue(0);
  const crossed = useSharedValue(0);
  const tick = () => {
    Haptics.selectionAsync().catch(() => {});
  };
  const pullGesture = usePanGesture({
    enabled: viaGesture,
    // Only a drag down starts it, and a sideways swipe never does.
    activeOffsetY: 12,
    failOffsetX: [-24, 24],
    onActivate: (e) => {
      'worklet';
      // Only from the very top, and not while a refresh is under way.
      pulling.set(rail.y.get() <= 0.5 && busy.get() === 0 ? 1 : 0);
      startY.set(e.absoluteY);
      crossed.set(0);
    },
    onUpdate: (e) => {
      'worklet';
      if (!pulling.get()) return;
      // From where the finger is on the screen: the page moves with it, so its own coordinates would drift.
      const pull = Math.max(0, (e.absoluteY - startY.get()) * 0.55);
      const past = pull >= PULL_FULL ? 1 : 0;
      if (past !== crossed.get()) {
        crossed.set(past);
        if (past) scheduleOnRN(tick);
      }
      pullY.set(Math.min(pull, PULL_FULL * 1.35));
      shown.set(Math.min(1, pull / 30));
      growth.set(Math.min(6.2, (pull / PULL_FULL) * 6.2));
    },
    onDeactivate: () => {
      'worklet';
      if (!pulling.get()) return;
      pulling.set(0);
      if (pullY.get() >= PULL_FULL) {
        scheduleOnRN(run);
      } else {
        pullY.set(withSpring(0, SETTLE));
        shown.set(withTiming(0, { duration: 200 }));
        growth.set(withTiming(0, { duration: 200 }));
      }
    },
  });
  const pageScroll = useNativeGesture({});
  const pageGesture = useSimultaneousGestures(pullGesture, pageScroll);
  // A light tick as the pull passes the line, so letting go there is felt to refresh.
  const pastLine = useRef(false);
  // The finger's height: on the event in the app, on its first touch on the web.
  const touchY = (e: GestureResponderEvent) => {
    const n = e.nativeEvent as unknown as { pageY?: number; touches?: ArrayLike<{ pageY: number }> };
    return n.pageY ?? n.touches?.[0]?.pageY ?? null;
  };
  const onTouchStart = (e: GestureResponderEvent) => {
    pullFrom.current = byHand && !refreshing && rail.y.get() <= 0 ? touchY(e) : null;
    pastLine.current = false;
  };
  const onTouchMove = (e: GestureResponderEvent) => {
    if (pullFrom.current == null) return;
    // The page scrolled instead (a drag up first): no pull this time.
    if (rail.y.get() > 1) {
      pullFrom.current = null;
      pullY.set(withSpring(0, SETTLE));
      return;
    }
    const y = touchY(e);
    if (y == null) return;
    const pull = Math.max(0, (y - pullFrom.current) * 0.55);
    if (pull >= PULL_FULL !== pastLine.current) {
      pastLine.current = pull >= PULL_FULL;
      if (pastLine.current) Haptics.selectionAsync().catch(() => {});
    }
    pullY.set(Math.min(pull, PULL_FULL * 1.35));
    shown.set(Math.min(1, pull / 30));
    growth.set(Math.min(6.2, (pull / PULL_FULL) * 6.2));
  };
  const onTouchEnd = () => {
    if (pullFrom.current == null) return;
    pullFrom.current = null;
    if (pullY.get() >= PULL_FULL) void run();
    else {
      pullY.set(withSpring(0, SETTLE));
      shown.set(withTiming(0, { duration: 200 }));
      growth.set(withTiming(0, { duration: 200 }));
    }
  };
  const pulledDown = useAnimatedStyle(() => ({ transform: [{ translateY: pullY.value }] }));
  const onScroll = useAnimatedScrollHandler((e) => {
    rail.track(e);
    if (pullGrows && !refreshing) {
      const pull = Math.max(0, -e.contentOffset.y);
      shown.set(Math.min(1, pull / 30));
      growth.set(Math.min(6.2, (pull / PULL_FULL) * 6.2));
    }
  });

  const page = (
    <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={byHand || viaGesture ? pulledDown : undefined}
        overScrollMode={byHand || viaGesture ? 'never' : undefined}
        onTouchStart={byHand ? onTouchStart : undefined}
        onTouchMove={byHand ? onTouchMove : undefined}
        onTouchEnd={byHand ? onTouchEnd : undefined}
        onTouchCancel={byHand ? onTouchEnd : undefined}
        // A screen reader can't pull: the page offers Refresh as an action instead.
        accessibilityActions={onRefresh ? [{ name: 'refresh', label: t('Refresh') }] : undefined}
        onAccessibilityAction={onRefresh ? (e) => void (e.nativeEvent.actionName === 'refresh' && !refreshing && run()) : undefined}
        // iOS: the bounce is the pull; its spinner is see-through, so only the seedling shows.
        refreshControl={pullGrows ? <RefreshControl refreshing={refreshing} onRefresh={run} tintColor="transparent" /> : undefined}
        contentContainerStyle={{ paddingTop: backdrop === 'paper' ? 14 : insets.top + 12, paddingBottom: TAB_BAR_SPACE + insets.bottom + 24 + keyboard, paddingHorizontal: 16, gap: 16 }}
      >
        {header}
        {children}
      </Animated.ScrollView>
  );
  const scroller = (
    <FocusFade>
      {viaGesture ? <GestureDetector gesture={pageGesture}>{page}</GestureDetector> : page}
      <ScrollRail rail={rail} scrollRef={scrollRef} top={backdrop === 'paper' ? 18 : insets.top + 12} bottom={TAB_BAR_SPACE + insets.bottom + 8} />
    </FocusFade>
  );

  if (backdrop === 'paper') return <PaperSheet>{scroller}</PaperSheet>;
  // Out of sight on the web, nothing at all (see PaperSheet): not its fades either.
  if (!live) return <View style={{ flex: 1 }} />;

  const layered = (
    <>
      {onRefresh ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: insets.top + 2, left: 0, right: 0, alignItems: 'center', zIndex: 2 }, sprout]}>
          <Seedling growth={growth} size={70} />
        </Animated.View>
      ) : null}
      {scroller}
    </>
  );
  return (
    <View style={{ flex: 1, backgroundColor: wide ? 'transparent' : look.groundNear }}>
      <SkyStatusBar />
      {wide ? (
        <>
          {layered}
          {/* On a wide screen the meadow is behind the whole window: the column's fade is a gradient
              in the sky's colour (or the field's, once the camera looks down). */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + TOP_FADE + 1 }, scrolled]}>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + TOP_FADE + 1 }, fieldFade]}>
              <EdgeFade edge="top" color={look.groundFar} height={insets.top + TOP_FADE} solid={insets.top + 4} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + TOP_FADE + 1 }, skyFade]}>
              <EdgeFade edge="top" color={look.top} height={insets.top + TOP_FADE} solid={insets.top + 4} />
            </Animated.View>
          </Animated.View>
        </>
      ) : (
        // Once the page moves, cards scroll up under a tall, eased fade into the scene itself (the
        // sky, or the field once the camera looks down), solid behind the clock and battery.
        <CameraMeadow frame={frame} tilt={tilt} animate={inView} topFade={{ height: insets.top + TOP_FADE, solid: insets.top + 4, shown: fadeIn }}>
          {layered}
        </CameraMeadow>
      )}
      {bottomExtra}
    </View>
  );
}

/**
 * On a screen wider than the app, Home's meadow behind the whole window: the app keeps its column in
 * front, and the sky and field carry on to the edges, tilting with Home's camera.
 */
export function WorldBackdrop() {
  const { width, height } = useWindowDimensions();
  const look = useSkyLook();
  const frame = useMemo(() => cameraFrame(width, height, Math.round(height * SKY_SHARE)), [width, height]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: look.groundNear }}>
      <CameraMeadow frame={frame} tilt={worldTilt} />
    </View>
  );
}
