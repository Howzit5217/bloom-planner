import { View } from 'react-native';
import { withAlpha } from './color';

/** Steps along the fade's eased curve: enough that it reads as smooth, not banded. */
const STEPS = 8;

/**
 * A soft fade where scrolling content slides under a fixed header or footer: solid for `solid`
 * points at the edge, then easing off (gently at both ends, like a lens's falloff rather than a
 * straight ramp). A plain gradient, not a drawing: on the web every drawing canvas takes one of the
 * browser's few graphics contexts.
 */
export function EdgeFade({ edge, color, height = 22, solid }: { edge: 'top' | 'bottom'; color: string; height?: number; solid?: number }) {
  const total = height + 1;
  // A pixel past the edge, and solid for the last few, so nothing peeks through where pixels round.
  const s = Math.min(0.9, (solid ?? height * 0.14) / total);
  // Laid out from the solid edge inward; for the bottom edge, the same mirrored.
  const stops: Array<[string, number]> = [[withAlpha(color, 1), 0]];
  for (let k = 0; k <= STEPS; k++) {
    const t = k / STEPS;
    stops.push([withAlpha(color, 1 - t * t * (3 - 2 * t)), (s + (1 - s) * t) * 100]);
  }
  const ordered = edge === 'top' ? stops : stops.map(([col, at]): [string, number] => [col, 100 - at]).reverse();
  const gradient = `linear-gradient(to bottom, ${ordered.map(([col, at]) => `${col} ${at.toFixed(1)}%`).join(', ')})`;
  return (
    <View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, height: total, backgroundImage: gradient }, edge === 'top' ? { top: -1 } : { bottom: -1 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
