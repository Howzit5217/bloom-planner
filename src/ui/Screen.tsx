import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, RefreshControl, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/** Tab switch: content cross-fades with an 8px vertical slide. */
export function FocusFade({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const p = useSharedValue(0);
  useEffect(() => {
    if (focused) {
      p.value = 0;
      p.value = withSpring(1, SPRING);
    }
  }, [focused, p]);
  const a = useAnimatedStyle(() => ({ flex: 1, opacity: Math.min(1, p.value * 1.4), transform: [{ translateY: (1 - p.value) * 8 }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

const PULL_FULL = 110;
/** Scrolling this many times the horizon's climb tilts the camera all the way down, so the scene moves slower than the cards. */
const TILT_SCROLL = 1.8;
/** A pulled page settles back up without overshooting past the top. */
const SETTLE = { damping: 22, stiffness: 200, mass: 1, overshootClamping: true } as const;
/** The camera follows the scroll with a little weight, settling without overshoot. */
const CAMERA = { damping: 30, stiffness: 190, mass: 1, overshootClamping: true } as const;
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
  return (
    <View style={{ flex: 1, backgroundColor: wide ? 'transparent' : c.canvas }}>
      <SkyStatusBar />
      {wide || !live ? null : (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <Meadow height={insets.top + SHEET_TOP + 26} horizon={insets.top + SHEET_TOP - 24} density={1.4} />
        </View>
      )}
      <View style={{ flex: 1, marginTop: insets.top + SHEET_TOP, backgroundColor: c.canvas, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' }}>
        {live ? children : null}
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
  const look = useSkyLook();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const growth = useSharedValue(0);
  const shown = useSharedValue(0);
  const [refreshing, setRefreshing] = useState(false);

  const run = async () => {
    setRefreshing(true);
    shown.value = withTiming(1, { duration: 150 });
    growth.value = withTiming(7, { duration: 900 });
    const started = Date.now();
    try {
      await onRefresh?.();
    } finally {
      setTimeout(() => {
        setRefreshing(false);
        shown.value = withTiming(0, { duration: 300 });
        growth.value = withTiming(0, { duration: 300 });
      }, Math.max(0, 1100 - (Date.now() - started)));
    }
  };

  const sprout = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: 0.7 + 0.3 * shown.value }] }));
  const rail = useScrollRail();
  // Home: a camera over the meadow that tilts down as the page scrolls, until the field fills the screen.
  const appWidth = useAppWidth();
  const frame = useMemo(() => cameraFrame(appWidth, height, Math.round(height * SKY_SHARE)), [appWidth, height]);
  // Shared with the backdrop behind the app's column on a wide screen, so both tilt together.
  const tilt = worldTilt;
  const wide = useWide();
  const live = useLive();
  // The meadow's flowers sway only while Home is the page in view.
  const inView = useIsFocused();
  const tiltScroll = (frame.cy + 36) * TILT_SCROLL;
  useAnimatedReaction(
    () => rail.y.value,
    (y) => {
      tilt.value = withSpring(Math.min(1, Math.max(0, y / tiltScroll)), CAMERA);
    },
  );
  // The sky's colour behind the status bar while the sky is still up there.
  const skyFade = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, horizonAt(frame, tilt.value) / (insets.top + 24))) }));
  // The tall fade comes in over the first scroll, so at rest it never washes over the header.
  const scrolled = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, rail.y.value / 36)) }));
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const pullGrows = !!onRefresh && Platform.OS === 'ios';
  // By hand (Android, the web): at the top, a drag down eases the page down as the seedling grows;
  // let go past the line and it refreshes, short of it and everything springs back.
  const byHand = !!onRefresh && Platform.OS !== 'ios';
  const pullY = useSharedValue(0);
  const pullFrom = useRef<number | null>(null);
  // The finger's height: on the event in the app, on its first touch on the web.
  const touchY = (e: GestureResponderEvent) => {
    const n = e.nativeEvent as unknown as { pageY?: number; touches?: ArrayLike<{ pageY: number }> };
    return n.pageY ?? n.touches?.[0]?.pageY ?? null;
  };
  const onTouchStart = (e: GestureResponderEvent) => {
    pullFrom.current = byHand && !refreshing && rail.y.get() <= 0 ? touchY(e) : null;
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
    pullY.set(Math.min(pull, PULL_FULL * 1.35));
    shown.set(Math.min(1, pull / 30));
    growth.set(Math.min(6.2, (pull / PULL_FULL) * 6.2));
  };
  const onTouchEnd = () => {
    if (pullFrom.current == null) return;
    pullFrom.current = null;
    const pulled = pullY.get();
    pullY.set(withSpring(0, SETTLE));
    if (pulled >= PULL_FULL) void run();
    else {
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

  const scroller = (
    <FocusFade>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={byHand ? pulledDown : undefined}
        overScrollMode={byHand ? 'never' : undefined}
        onTouchStart={byHand ? onTouchStart : undefined}
        onTouchMove={byHand ? onTouchMove : undefined}
        onTouchEnd={byHand ? onTouchEnd : undefined}
        onTouchCancel={byHand ? onTouchEnd : undefined}
        // iOS: the bounce is the pull; its spinner is see-through, so only the seedling shows.
        refreshControl={pullGrows ? <RefreshControl refreshing={refreshing} onRefresh={run} tintColor="transparent" /> : undefined}
        contentContainerStyle={{ paddingTop: backdrop === 'paper' ? 14 : insets.top + 12, paddingBottom: TAB_BAR_SPACE + insets.bottom + 24, paddingHorizontal: 16, gap: 16 }}
      >
        {header}
        {children}
      </Animated.ScrollView>
      <ScrollRail rail={rail} scrollRef={scrollRef} top={backdrop === 'paper' ? 18 : insets.top + 12} bottom={TAB_BAR_SPACE + insets.bottom + 8} />
    </FocusFade>
  );

  if (backdrop === 'paper') return <PaperSheet>{scroller}</PaperSheet>;

  return (
    <View style={{ flex: 1, backgroundColor: wide ? 'transparent' : look.groundNear }}>
      <SkyStatusBar />
      {wide || !live ? null : <CameraMeadow frame={frame} tilt={tilt} animate={inView} />}
      {onRefresh && live ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: insets.top + 2, left: 0, right: 0, alignItems: 'center', zIndex: 2 }, sprout]}>
          <Seedling growth={growth} size={70} />
        </Animated.View>
      ) : null}
      {live ? scroller : null}
      {/* The clock and battery always sit on the sky or field, never on a card. */}
      {insets.top > 0 ? (
        <>
          <EdgeFade edge="top" color={look.groundFar} height={insets.top + 6} solid={insets.top} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 7 }, skyFade]}>
            <EdgeFade edge="top" color={look.top} height={insets.top + 6} solid={insets.top} />
          </Animated.View>
        </>
      ) : null}
      {/* Once the page moves, cards scroll up under a taller, eased fade into the sky (or the field). */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + TOP_FADE + 1 }, scrolled]}>
        <EdgeFade edge="top" color={look.groundFar} height={insets.top + TOP_FADE} solid={insets.top + 4} />
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + TOP_FADE + 1 }, skyFade]}>
          <EdgeFade edge="top" color={look.top} height={insets.top + TOP_FADE} solid={insets.top + 4} />
        </Animated.View>
      </Animated.View>
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
