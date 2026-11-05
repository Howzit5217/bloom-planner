import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useState } from 'react';
import { View } from 'react-native';

/** A soft fade where scrolling content slides under a fixed header or footer. */
export function EdgeFade({ edge, color, height = 22 }: { edge: 'top' | 'bottom'; color: string; height?: number }) {
  const [w, setW] = useState(0);
  const clear = `${color}00`;
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      // A pixel past the edge, and solid for the last few, so nothing peeks through where pixels round.
      style={[{ position: 'absolute', left: 0, right: 0, height: height + 1 }, edge === 'top' ? { top: -1 } : { bottom: -1 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {w > 0 ? (
        <Canvas style={{ width: w, height: height + 1 }}>
          <Rect x={0} y={0} width={w} height={height + 1}>
            <LinearGradient start={vec(0, 0)} end={vec(0, height + 1)} colors={edge === 'top' ? [color, color, clear] : [clear, color, color]} positions={edge === 'top' ? [0, 0.14, 1] : [0, 0.86, 1]} />
          </Rect>
        </Canvas>
      ) : null}
    </View>
  );
}
