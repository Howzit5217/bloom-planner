import { Platform, type ViewStyle } from 'react-native';

/** Split a list of CSS box shadows at its top-level commas (not the ones inside rgba()). */
function splitShadows(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(css.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(css.slice(start).trim());
  return out.filter(Boolean);
}

const COLOR = /rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\b(?:transparent|white|black)\b/;

/** A shadow's colour at full strength: the system sets how dark its own shadows are. */
function solid(color: string): string {
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
  if (/^#[0-9a-fA-F]{8}$/.test(color)) return color.slice(0, 7);
  if (/^#[0-9a-fA-F]{4}$/.test(color)) return color.slice(0, 4);
  return color;
}

export interface ShadowParts {
  /** The shadows kept as they are. */
  kept: string[];
  /** An elevation standing in for the soft outer shadows, and its colour; 0 for none. */
  elevation: number;
  color: string | null;
}

/** How a list of box shadows is drawn on Android (see shadow). */
export function androidShadow(css: string): ShadowParts {
  const kept: string[] = [];
  let elevation = 0;
  let color: string | null = null;
  for (const part of splitShadows(css)) {
    const c = part.match(COLOR)?.[0] ?? null;
    const rest = c ? part.replace(c, ' ') : part;
    const inset = /\binset\b/.test(rest);
    const [, oy = 0, blur = 0] = (rest.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    // Sharp ones (a highlight line along an edge, a ring) cost nothing to draw: they stay.
    if (blur <= 0.5) {
      kept.push(part);
      continue;
    }
    // A soft inner shadow has no cheap stand-in: left out.
    if (inset) continue;
    elevation = Math.max(elevation, Math.round(Math.max(Math.abs(oy), blur / 4)));
    color = color ?? (c ? solid(c) : null);
  }
  return { kept, elevation, color };
}

/**
 * A view's shadows, written as CSS box shadows. On Android a soft box shadow is blurred on the CPU
 * and sent to the GPU afresh on every frame that anything moves behind it (Home's scene moves every
 * frame), and with every card, button and the tab bar doing it, scrolling couldn't keep up. There the
 * soft outer shadows become one elevation shadow (the system's own, drawn on the GPU), soft inner
 * ones are left out, and sharp ones stay. Elsewhere they're box shadows as written.
 */
export function shadow(css: string | null | undefined | false): ViewStyle {
  if (!css) return {};
  if (Platform.OS !== 'android') return { boxShadow: css };
  const { kept, elevation, color } = androidShadow(css);
  return {
    ...(kept.length ? { boxShadow: kept.join(', ') } : null),
    ...(elevation > 0 ? { elevation, ...(color ? { shadowColor: color } : null) } : null),
  };
}
