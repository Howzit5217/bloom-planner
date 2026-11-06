import { BlurMask, Canvas, Circle, Group, Image, makeImageFromView, type SkImage } from '@shopify/react-native-skia';
import { createContext, useCallback, useContext, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/theme';

/** Where the change starts from (the finger), in points from the screen's top left. */
type At = { x: number; y: number };
type Switch = (apply: () => void, at?: At) => void;

const Ctx = createContext<Switch>((apply) => apply());

/**
 * Changes the app's look (Day and Night) with a reveal: the screen as it was is held over the app,
 * the new look goes on underneath, and a soft-edged circle opens through the old one from where you
 * tapped until the new one fills the screen. Whatever the page does underneath (redrawing, settling)
 * happens out of sight. On the web, which can't picture a screen, and with reduced motion, the look
 * simply changes.
 */
export function ThemeSwitchHost({ children }: { children: ReactNode }) {
  const { reduceMotion } = useTheme();
  // The app's own view, which the picture is of: the window can be taller (the navigation bar), and
  // drawn to that, the picture came out squeezed and shifted, as if the page jumped.
  const win = useWindowDimensions();
  const [size, setSize] = useState({ width: win.width, height: win.height });
  const { width, height } = size;
  const root = useRef<ComponentRef<typeof View>>(null);
  const [held, setHeld] = useState<{ image: SkImage; at: At } | null>(null);
  const r = useSharedValue(0);
  const busy = useRef(false);
  const change = useCallback<Switch>(
    (apply, at) => {
      if (Platform.OS === 'web' || reduceMotion || busy.current) {
        apply();
        return;
      }
      busy.current = true;
      void makeImageFromView(root as unknown as RefObject<number | null>)
        .catch(() => null)
        .then((image) => {
          if (!image) {
            busy.current = false;
            apply();
            return;
          }
          const from = at ?? { x: width / 2, y: height / 2 };
          r.value = 0;
          setHeld({ image, at: from });
          // The old look is up: change underneath it, then open through it.
          requestAnimationFrame(() => {
            apply();
            const far = Math.hypot(Math.max(from.x, width - from.x), Math.max(from.y, height - from.y)) + 40;
            r.value = withTiming(far, { duration: 620, easing: Easing.inOut(Easing.cubic) }, (done) => {
              if (done) scheduleOnRN(finish);
            });
          });
        });
      const finish = () => {
        setHeld(null);
        busy.current = false;
      };
    },
    [height, r, reduceMotion, width],
  );
  return (
    <Ctx.Provider value={change}>
      <View ref={root} collapsable={false} style={{ flex: 1 }} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {children}
      </View>
      {held ? (
        <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
          <Group layer>
            <Image image={held.image} x={0} y={0} width={width} height={height} fit="fill" />
            <Circle cx={held.at.x} cy={held.at.y} r={r} color="black" blendMode="clear">
              <BlurMask blur={18} style="normal" />
            </Circle>
          </Group>
        </Canvas>
      ) : null}
    </Ctx.Provider>
  );
}

/** Change the app's look with the reveal (see ThemeSwitchHost). */
export const useThemeSwitch = () => useContext(Ctx);
