import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Canvas, Group, Path, rect, Skia, Text, useFont, type SkFont, type SkPath } from '@shopify/react-native-skia';
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


const solidCache = new WeakMap<SkFont, Map<string, SkPath | null>>();

/**
 * A glyph's outer shape only, its inner loops filled in. The outline is drawn from this, so small
 * loops (in 6, 8, 9, 0, %) come out solid brown rather than as a pinhole the shadow shows through.
 */
function solidGlyph(ch: string, font: SkFont): SkPath | null {
  let byChar = solidCache.get(font);
  if (!byChar) {
    byChar = new Map();
    solidCache.set(font, byChar);
  }
  if (byChar.has(ch)) return byChar.get(ch)!;
  let src: SkPath | null = null;
  try {
    src = Skia.Path.MakeFromText(ch, 0, 0, font);
  } catch {
    // Not on the web (Skia there can't turn text into paths): the outline is drawn as stroked text.
  }
  let out: SkPath | null = null;
  if (src) {
    const contours: number[][][] = [];
    for (const cmd of src.toCmds()) {
      if (cmd[0] === 0 || !contours.length) contours.push([]);
      contours[contours.length - 1].push(cmd);
    }
    // Signed area from each segment's end point: outer and inner contours wind opposite ways.
    const end = (cmd: number[]) => (cmd[0] === 3 ? [cmd[3], cmd[4]] : cmd[0] === 5 ? null : [cmd[cmd.length - 2], cmd[cmd.length - 1]]);
    const area = (cs: number[][]) => {
      const pts = cs.map(end).filter((p): p is number[] => !!p);
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        a += x1 * y2 - x2 * y1;
      }
      return a / 2;
    };
    const areas = contours.map(area);
    const biggest = areas.reduce((m, a, i) => (Math.abs(a) > Math.abs(areas[m]) ? i : m), 0);
    const sign = Math.sign(areas[biggest]);
    const b = Skia.PathBuilder.Make();
    contours.forEach((cs, i) => {
      if (Math.sign(areas[i]) !== sign) return;
      for (const c of cs) {
        if (c[0] === 0) b.moveTo(c[1], c[2]);
        else if (c[0] === 1) b.lineTo(c[1], c[2]);
        else if (c[0] === 2) b.quadTo(c[1], c[2], c[3], c[4]);
        else if (c[0] === 3) b.conicTo(c[1], c[2], c[3], c[4], c[5]);
        else if (c[0] === 4) b.cubicTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        else if (c[0] === 5) b.close();
      }
    });
    out = b.build();
  }
  byChar.set(ch, out);
  return out;
}

/** The brown outline (and its soft drop) behind one glyph, with solid inner loops. */
function GlyphOutline({ ch, x, y, font, sw, stroke }: { ch: string; x: number; y: number; font: SkFont; sw: number; stroke: string }) {
  const solid = solidGlyph(ch, font);
  if (!solid) {
    // The same outline from the glyph itself, where its shape can't be had as a path (the web).
    return (
      <>
        <Text x={x} y={y + sw * 0.55} text={ch} font={font} color="rgba(0,0,0,0.18)" style="stroke" strokeWidth={sw * 2} strokeJoin="round" />
        <Text x={x} y={y} text={ch} font={font} color={stroke} style="stroke" strokeWidth={sw * 2} strokeJoin="round" />
      </>
    );
  }
  return (
    <>
      <Group transform={[{ translateX: x }, { translateY: y + sw * 0.55 }]}>
        <Path path={solid} color="rgba(0,0,0,0.18)" />
        <Path path={solid} color="rgba(0,0,0,0.18)" style="stroke" strokeWidth={sw * 2} strokeJoin="round" />
      </Group>
      <Group transform={[{ translateX: x }, { translateY: y }]}>
        <Path path={solid} color={stroke} />
        <Path path={solid} color={stroke} style="stroke" strokeWidth={sw * 2} strokeJoin="round" />
      </Group>
    </>
  );
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
              {outline ? <GlyphOutline ch={d} x={dx} y={y} font={font} sw={l.sw} stroke={stroke} /> : null}
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
              {outline ? <GlyphOutline ch={slot.ch} x={slot.x} y={l.baseline} font={font} sw={l.sw} stroke={s} /> : null}
              <Text x={slot.x} y={l.baseline} text={slot.ch} font={font} color={f} />
            </Group>
          );
        })}
      </Canvas>
    </View>
  );
}
