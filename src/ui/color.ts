/** The same colour, fully clear: what a fade runs to. Hex (#RRGGBB, #RRGGBBAA) and rgb()/rgba(). */
export function clearOf(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}00`;
  if (/^#[0-9a-f]{8}$/i.test(color)) return `${color.slice(0, 7)}00`;
  const m = color.match(/^rgba?\(([^,]+),([^,]+),([^,)]+)/i);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},0)` : 'transparent';
}
