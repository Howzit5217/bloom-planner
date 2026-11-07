import type { TextProps } from 'react-native';
import { useTheme } from '@/theme/theme';
import { T, type TVariant } from './T';

/** Marks where a value starts and ends inside translated text (an invisible separator, never shown). */
const MARK = '⁣';

/** How a marked value shows: a step count in teal, a flower count in red, anything else in bold. */
export type Emphasis = 'steps' | 'flowers' | 'bold';
const CODE: Record<Emphasis, string> = { steps: 's', flowers: 'f', bold: 'b' };

/**
 * A value to stand out in a sentence (a number, a time, a date), for <Rich>: put it in a translation's
 * placeholder as it is, and the sentence shows it bold, in its colour, wherever the language puts it.
 * Only for text shown through <Rich>.
 */
export const em = (value: string | number, how: Emphasis = 'bold') => `${MARK}${CODE[how]}${value}${MARK}`;

/** Bold of each text variant, for the values in it. */
const BOLD: Partial<Record<TVariant, TVariant>> = { body: 'bodyBold', small: 'smallBold', caption: 'smallBold' };

/** Text with its values (marked by em) standing out: bold, and steps and flowers in their colours. */
export function Rich({ children, v = 'small', soft, color, style, ...rest }: Omit<TextProps, 'children'> & { children: string; v?: TVariant; soft?: boolean; color?: string }) {
  const { c } = useTheme();
  const parts = children.split(MARK);
  const strong = BOLD[v] ?? v;
  return (
    <T v={v} soft={soft} color={color} style={style} {...rest}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const how = part[0];
        const strongColor = how === 's' ? c.teal : how === 'f' ? c.petalRed : (color ?? c.ink);
        return (
          <T key={i} v={strong} color={strongColor} style={v === 'caption' ? { fontSize: 12 } : undefined}>
            {part.slice(1)}
          </T>
        );
      })}
    </T>
  );
}
