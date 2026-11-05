import { useIsFocused } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, RefreshControl, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { SPRING } from '@/theme/tokens';
import { EdgeFade } from './EdgeFade';
import { ScrollRail, useScrollRail } from './ScrollRail';
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
/** Where the paper pages' sheet starts, below the safe area: the meadow strip shows above it. */
const SHEET_TOP = 66;

/**
 * The paper pages' look: a strip of meadow along the top and a cream sheet over it that holds the
 * page. Everything scrolls inside the sheet, so nothing slides over the meadow or the status bar.
 */
export function PaperSheet({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: c.dark ? 0.9 : 1 }}>
        <Meadow height={insets.top + SHEET_TOP + 26} density={1.2} />
      </View>
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
 * The refresh uses the platform's own RefreshControl. A seedling sprouts above the content:
 * on iOS it grows with the pull itself; on Android (which doesn't report the pull distance)
 * it sprouts while the refresh runs, beside a leaf-green spinner.
 */
export function Screen({ children, backdrop = 'paper', onRefresh, header, bottomExtra }: Props) {
  const { c } = useTheme();
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
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const pullGrows = !!onRefresh && Platform.OS === 'ios';
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
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={run}
              tintColor="transparent"
              colors={[c.leaf, c.petalRed, c.petalYellow]}
              progressBackgroundColor={c.card}
              progressViewOffset={backdrop === 'paper' ? 8 : insets.top + 40}
            />
          ) : undefined
        }
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
    <View style={{ flex: 1, backgroundColor: c.meadowBottom }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <Meadow height={height + 40} density={0.95} />
      </View>
      {onRefresh ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: insets.top + 2, left: 0, right: 0, alignItems: 'center', zIndex: 2 }, sprout]}>
          <Seedling growth={growth} size={70} />
        </Animated.View>
      ) : null}
      {scroller}
      {/* Cards scroll up under a soft fade, never into the clock and battery. */}
      <EdgeFade edge="top" color={c.meadowTop} height={insets.top + 14} />
      {bottomExtra}
    </View>
  );
}
