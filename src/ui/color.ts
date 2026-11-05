/** The same colour, fully clear: what a fade runs to. Hex (#RRGGBB, #RRGGBBAA) and rgb()/rgba(). */
export function clearOf(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}00`;
  if (/^#[0-9a-f]{8}$/i.test(color)) return `${color.slice(0, 7)}00`;
  const m = color.match(/^rgba?\(([^,]+),([^,]+),([^,)]+)/i);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},0)` : 'transparent';
}

/** The same colour at `alpha` (0..1). Hex (#RRGGBB, #RRGGBBAA) and rgb()/rgba(); anything else as it is. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i);
  if (hex) {
    const base = hex[4] ? parseInt(hex[4], 16) / 255 : 1;
    return `rgba(${parseInt(hex[1], 16)},${parseInt(hex[2], 16)},${parseInt(hex[3], 16)},${+(a * base).toFixed(3)})`;
  }
  const m = color.match(/^rgba?\(([^,]+),([^,]+),([^,)]+)(?:,([^)]+))?\)/i);
  if (m) return `rgba(${m[1].trim()},${m[2].trim()},${m[3].trim()},${+(a * (m[4] ? Number(m[4]) : 1)).toFixed(3)})`;
  return color;
}
