import { Canvas, Group, Path, rect, Skia, Text, type SkFont, type SkPath } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';
import { useDerivedValue, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { fmt } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import { font as fonts } from '@/theme/tokens';
import { nextOnLoop, turnsOff } from './digitLoop';
import { useGameFont } from './gameFont';

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
/**
 * The places drawn on each digit's wheel. A roll starts in 0..9 and moves at most nine places either
 * way (a quick fling can skip that many levels at once), so -9..18, with room for the spring's
 * overshoot: never past the end of the strip, where the digit would go blank.
 */
const LOOP = Array.from({ length: 32 }, (_, i) => i - 11);

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

function DigitSlot({ x, w, digit, dir, l, font, fill, stroke, index, rollIn, outline }: { x: number; w: number; digit: number; dir: -1 | 0 | 1; l: Layout; font: SkFont; fill: string; stroke: string; index: number; rollIn: boolean; outline: boolean }) {
  // The digit's place on its wheel (see digitLoop): it rolls the short way round, the same spring.
  const pos = useSharedValue(rollIn ? 0 : digit);
  const place = useRef(rollIn ? 0 : digit);
  const first = useRef(true);
  useEffect(() => {
    let from = place.current;
    // Back near 0..9 in whole turns (the same digit shows), so the drawn strip always covers it.
    const off = turnsOff(from);
    if (off !== 0) {
      from -= off;
      pos.set(pos.get() - off);
    }
    // Rolling in, a number counts up from 0; after that each digit rolls the way the number moved.
    const to = first.current && rollIn ? digit : nextOnLoop(from, digit, dir);
    first.current = false;
    place.current = to;
    pos.set(withDelay(index * 35, withSpring(to, { damping: 15, stiffness: 110 })));
    // dir only says which way to roll a change of digit; it never starts a roll on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digit, index, pos, rollIn]);
  const lineH = l.lineH;
  const transform = useDerivedValue(() => [{ translateY: -(pos.value - LOOP[0]) * lineH }]);
  return (
    <Group clip={rect(x - l.sw, 0, w + l.sw * 2, l.height)}>
      <Group transform={transform}>
        <DigitStrip x={x} w={w} baseline={l.baseline} lineH={lineH} sw={l.sw} font={font} fill={fill} stroke={stroke} outline={outline} />
      </Group>
    </Group>
  );
}

/**
 * One digit's wheel of glyphs. It only changes with the number's size or colours, never with the
 * digit itself (that's the wheel's position), so a change of number doesn't redraw it: a ruler slid
 * quickly changes the number many times a second.
 */
const DigitStrip = memo(function DigitStrip({ x, w, baseline, lineH, sw, font, fill, stroke, outline }: { x: number; w: number; baseline: number; lineH: number; sw: number; font: SkFont; fill: string; stroke: string; outline: boolean }) {
  return (
    <>
      {LOOP.map((k) => {
        const d = DIGITS[((k % 10) + 10) % 10];
        const dx = x + (w - font.measureText(d).width) / 2;
        const y = baseline + (k - LOOP[0]) * lineH;
        return (
          <Group key={k}>
            {outline ? <GlyphOutline ch={d} x={dx} y={y} font={font} sw={sw} stroke={stroke} /> : null}
            <Text x={dx} y={y} text={d} font={font} color={fill} />
          </Group>
        );
      })}
    </>
  );
});

/** The game's chunky yellow numbers with a brown outline. Digits roll like an odometer. */
export function GameNumber({ value, size, format = fmt, fill, stroke, rollIn = false, outline = true, style, accessibilityLabel }: Props) {
  const { c } = useTheme();
  const font = useGameFont(size);
  const text = format(value);
  // Which way the number last moved, so every digit rolls that way round its wheel.
  const [moved, setMoved] = useState({ value, dir: 0 as -1 | 0 | 1 });
  if (value !== moved.value) setMoved({ value, dir: value > moved.value ? 1 : -1 });
  const l = useMemo(() => (font ? layout(font, text, size) : null), [font, text, size]);
  const f = fill ?? c.gameYellow;
  const s = stroke ?? c.gameOutline;
  // Until the drawn face has loaded (or if it can't), the number still shows, in the same face as text.
  if (!font || !l)
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? text} style={[{ height: size * 1.25, minWidth: size * 0.6 * text.length, justifyContent: 'center' }, style]}>
        <RNText style={{ fontFamily: fonts.heading, fontSize: size, lineHeight: size * 1.2, color: f, textShadowColor: s, textShadowRadius: Math.max(2, size * 0.06), textShadowOffset: { width: 0, height: Math.max(1, size * 0.04) } }}>{text}</RNText>
      </View>
    );
  let digitIndex = 0;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? text} style={style}>
      <Canvas style={{ width: l.width, height: l.height }}>
        {l.slots.map((slot) => {
          if (slot.digit != null) {
            return <DigitSlot key={slot.key} x={slot.x} w={slot.w} digit={slot.digit} dir={moved.dir} l={l} font={font} fill={f} stroke={s} index={digitIndex++} rollIn={rollIn} outline={outline} />;
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
