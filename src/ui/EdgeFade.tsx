import { View } from 'react-native';
import { clearOf } from './color';

/**
 * A soft fade where scrolling content slides under a fixed header or footer. A plain gradient, not
 * a drawing: on the web every drawing canvas takes one of the browser's few graphics contexts.
 */
export function EdgeFade({ edge, color, height = 22 }: { edge: 'top' | 'bottom'; color: string; height?: number }) {
  const clear = clearOf(color);
  // A pixel past the edge, and solid for the last few, so nothing peeks through where pixels round.
  const stops = edge === 'top' ? `${color} 0%, ${color} 14%, ${clear} 100%` : `${clear} 0%, ${color} 86%, ${color} 100%`;
  return (
    <View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, height: height + 1, backgroundImage: `linear-gradient(to bottom, ${stops})` }, edge === 'top' ? { top: -1 } : { bottom: -1 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
