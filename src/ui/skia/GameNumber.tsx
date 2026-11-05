import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Canvas, Group, rect, Text, useFont, type SkFont } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useDerivedValue, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { fmt } from '@/engine/format';
import { useTheme } from '@/theme/theme';

interface Props {
  value: number;
  size: number;
  format?: (n: number) => string;
  fill?: string;
  stroke?: string;
  /** Roll from 0 on first mount. */
  rollIn?: boolean;
  /** Brown outline + drop shadow (the game look). Off for plain ink numbers. */
  outline?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const DIGITS = '0123456789';

interface Layout {
  width: number;
  height: number;
  baseline: number;
  lineH: number;
  sw: number;
  digitW: number;
  slots: Array<{ ch: string; x: number; w: number; digit: number | null; key: string }>;
}

function layout(font: SkFont, text: string, size: number): Layout {
  const sw = Math.max(2, size * 0.11);
  const zero = font.measureText('0');
  let digitW = 0;
  for (const d of DIGITS) digitW = Math.max(digitW, font.measureText(d).width);
  const comma = font.measureText(',');
  const top = zero.y; // negative, above baseline
  const bottom = Math.max(zero.y + zero.height, comma.y + comma.height);
  const pad = sw * 1.4;
  const baseline = pad - top;
  const height = baseline + bottom + pad;
  const lineH = height;
  const slots: Layout['slots'] = [];
  let x = pad + sw * 0.3;
  const chars = text.split('');
  // Key digits by position from the right so units stay units when the number grows.
  let fromRight = 0;
  const keys = chars.map(() => '');
  for (let i = chars.length - 1; i >= 0; i--) keys[i] = `${chars[i] >= '0' && chars[i] <= '9' ? 'd' : 'c'}${fromRight++}`;
  chars.forEach((ch, i) => {
    const isDigit = ch >= '0' && ch <= '9';
    const w = isDigit ? digitW : font.measureText(ch).width + sw * 0.2;
    slots.push({ ch, x, w, digit: isDigit ? Number(ch) : null, key: keys[i] });
    x += w;
  });
  return { width: x + pad + sw * 0.9, height, baseline, lineH, sw, digitW, slots };
}

function DigitSlot({ x, w, digit, l, font, fill, stroke, index, rollIn, outline }: { x: number; w: number; digit: number; l: Layout; font: SkFont; fill: string; stroke: string; index: number; rollIn: boolean; outline: boolean }) {
  const pos = useSharedValue(rollIn ? 0 : digit);
  useEffect(() => {
    pos.value = withDelay(index * 35, withSpring(digit, { damping: 15, stiffness: 110 }));
  }, [digit, index, pos]);
  const transform = useDerivedValue(() => [{ translateY: -pos.value * l.lineH }]);
  return (
    <Group clip={rect(x - l.sw, 0, w + l.sw * 2, l.height)}>
      <Group transform={transform}>
        {DIGITS.split('').map((d, k) => {
          const dx = x + (w - font.measureText(d).width) / 2;
          const y = l.baseline + k * l.lineH;
          return (
            <Group key={d}>
              {outline ? <Text x={dx} y={y + l.sw * 0.55} text={d} font={font} color="rgba(0,0,0,0.18)" style="stroke" strokeWidth={l.sw * 2} strokeJoin="round" /> : null}
              {outline ? <Text x={dx} y={y} text={d} font={font} color={stroke} style="stroke" strokeWidth={l.sw * 2} strokeJoin="round" /> : null}
              <Text x={dx} y={y} text={d} font={font} color={fill} />
            </Group>
          );
        })}
      </Group>
    </Group>
  );
}

/** The game's chunky yellow numbers with a brown outline. Digits roll like an odometer. */
export function GameNumber({ value, size, format = fmt, fill, stroke, rollIn = false, outline = true, style, accessibilityLabel }: Props) {
  const { c } = useTheme();
  const font = useFont(Baloo2_800ExtraBold, size);
  const text = format(value);
  const l = useMemo(() => (font ? layout(font, text, size) : null), [font, text, size]);
  const f = fill ?? c.gameYellow;
  const s = stroke ?? c.gameOutline;
  if (!font || !l) return <View style={[{ height: size * 1.25, minWidth: size * 0.6 * text.length }, style]} />;
  let digitIndex = 0;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? text} style={style}>
      <Canvas style={{ width: l.width, height: l.height }}>
        {l.slots.map((slot) => {
          if (slot.digit != null) {
            return <DigitSlot key={slot.key} x={slot.x} w={slot.w} digit={slot.digit} l={l} font={font} fill={f} stroke={s} index={digitIndex++} rollIn={rollIn} outline={outline} />;
          }
          return (
            <Group key={slot.key}>
              {outline ? <Text x={slot.x} y={l.baseline + l.sw * 0.55} text={slot.ch} font={font} color="rgba(0,0,0,0.18)" style="stroke" strokeWidth={l.sw * 2} strokeJoin="round" /> : null}
              {outline ? <Text x={slot.x} y={l.baseline} text={slot.ch} font={font} color={s} style="stroke" strokeWidth={l.sw * 2} strokeJoin="round" /> : null}
              <Text x={slot.x} y={l.baseline} text={slot.ch} font={font} color={f} />
            </Group>
          );
        })}
      </Canvas>
    </View>
  );
}
