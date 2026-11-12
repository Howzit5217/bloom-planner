import { Canvas, createPicture, Group, Path, Picture, rect, Skia, StrokeJoin, PaintStyle, Text, type SkCanvas, type SkFont, type SkPath } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';
import { useDerivedValue, useSharedValue, withDelay, withSpring, type SharedValue } from 'react-native-reanimated';
import { fmt } from '@/engine/format';
import { useTheme } from '@/theme/theme';
import { font as fonts } from '@/theme/tokens';
import { nextOnLoop, turnsOff } from './digitLoop';
import { useGameFont } from './gameFont';
import { glyphInk, inkRun } from './inkLayout';

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
  /**
   * Digits roll like an odometer (the default). Off, a new number simply shows: for one that follows
   * a finger, where a roll would still be catching up after the finger stops.
   */
  roll?: boolean;
  /**
   * Text as wide as the number can get: the number keeps that width as it changes, centred in it. A
   * drawing that changes size (22 to 9 to -10) can be left showing an old number for a while.
   */
  room?: string;
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
        const b = font.measureText(d);
        const dx = x + (w - b.width) / 2 - b.x;
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
export function GameNumber({ value, size, format = fmt, fill, stroke, rollIn = false, outline = true, roll = true, room, style, accessibilityLabel }: Props) {
  const { c } = useTheme();
  const font = useGameFont(size);
  const text = format(value);
  // Which way the number last moved, so every digit rolls that way round its wheel.
  const [moved, setMoved] = useState({ value, dir: 0 as -1 | 0 | 1 });
  if (value !== moved.value) setMoved({ value, dir: value > moved.value ? 1 : -1 });
  const l = useMemo(() => (font ? layout(font, text, size) : null), [font, text, size]);
  const roomW = useMemo(() => (font && room ? layout(font, room, size).width : 0), [font, room, size]);
  // Not rolling: each digit only as wide as its ink, centred where the number looks centred.
  const run = useMemo(() => (font && l && !roll ? inkRun(text, font, l.sw * 0.35) : null), [font, l, roll, text]);
  const roomRun = useMemo(() => (font && l && !roll && room ? inkRun(room, font, l.sw * 0.35).width : 0), [font, l, roll, room]);
  const f = fill ?? c.gameYellow;
  const s = stroke ?? c.gameOutline;
  // Until the drawn face has loaded (or if it can't), the number still shows, in the same face as text.
  if (!font || !l)
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? text} style={[{ height: size * 1.25, minWidth: size * 0.6 * text.length, justifyContent: 'center' }, style]}>
        <RNText style={{ fontFamily: fonts.heading, fontSize: size, lineHeight: size * 1.2, color: f, textShadowColor: s, textShadowRadius: Math.max(2, size * 0.06), textShadowOffset: { width: 0, height: Math.max(1, size * 0.04) } }}>{text}</RNText>
      </View>
    );
  if (run) {
    // Room for the outline and its drop either side, and for the shift to where it looks centred.
    const pad = l.sw * 1.6 + Math.abs(run.centre - run.width / 2);
    const width = Math.max(run.width, roomRun) + pad * 2;
    const x0 = width / 2 - run.centre;
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? text} style={style}>
        <Canvas style={{ width, height: l.height }}>
          {/* Every outline before any fill, so they run together behind the digits. */}
          {outline ? run.glyphs.map((g, i) => <GlyphOutline key={`o${i}`} ch={g.ch} x={x0 + g.x} y={l.baseline} font={font} sw={l.sw} stroke={s} />) : null}
          {run.glyphs.map((g, i) => (
            <Text key={`f${i}`} x={x0 + g.x} y={l.baseline} text={g.ch} font={font} color={f} />
          ))}
        </Canvas>
      </View>
    );
  }
  let digitIndex = 0;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? text} style={style}>
      <Canvas style={{ width: Math.max(l.width, roomW), height: l.height }}>
        <Group transform={[{ translateX: Math.max(0, roomW - l.width) / 2 }]}>
        {l.slots.map((slot) => {
          if (slot.digit != null && roll) {
            return <DigitSlot key={slot.key} x={slot.x} w={slot.w} digit={slot.digit} dir={moved.dir} l={l} font={font} fill={f} stroke={s} index={digitIndex++} rollIn={rollIn} outline={outline} />;
          }
          // By its ink: a digit in the middle of its slot, as on the rolling wheel; anything else at its start.
          const b = font.measureText(slot.ch);
          const gx = slot.digit != null ? slot.x + (slot.w - b.width) / 2 - b.x : slot.x + l.sw * 0.1 - b.x;
          return (
            <Group key={slot.key}>
              {outline ? <GlyphOutline ch={slot.ch} x={gx} y={l.baseline} font={font} sw={l.sw} stroke={s} /> : null}
              <Text x={gx} y={l.baseline} text={slot.ch} font={font} color={f} />
            </Group>
          );
        })}
        </Group>
      </Canvas>
    </View>
  );
}

/** The characters a live number can show. */
const LIVE_CHARS = '0123456789-';

/** One glyph's outline (its soft drop, then the brown edge) drawn at (x, y), as GlyphOutline draws it. */
function drawOutline(cv: SkCanvas, ch: string, x: number, y: number, font: SkFont, sw: number, stroke: string) {
  const solid = solidGlyph(ch, font);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setStrokeWidth(sw * 2);
  const layer = (dy: number, color: string) => {
    paint.setColor(Skia.Color(color));
    if (solid) {
      cv.save();
      cv.translate(x, y + dy);
      paint.setStyle(PaintStyle.Fill);
      cv.drawPath(solid, paint);
      paint.setStyle(PaintStyle.Stroke);
      cv.drawPath(solid, paint);
      cv.restore();
    } else {
      // Where the glyph's shape can't be had as a path (the web), from the glyph itself.
      paint.setStyle(PaintStyle.Stroke);
      cv.drawText(ch, x, y + dy, paint, font);
    }
  };
  layer(sw * 0.55, 'rgba(0,0,0,0.18)');
  layer(0, stroke);
}

/**
 * The game number on a ruler: drawn on the UI thread from `value`, a shared value the ruler sets as
 * it moves, so it keeps up however busy the app's JS is. (Drawn from the JS side, it stood still
 * through a whole slide while the page was still working out the plan for the number before.) Laid
 * out like `roll={false}`: each digit only as wide as its ink, centred where the number looks
 * centred, in a canvas as wide as `room`. `fallback` shows until the drawn face has loaded.
 */
export function LiveGameNumber({ value, fallback, size, room, fill, stroke, style }: { value: SharedValue<number>; fallback: number; size: number; room: string; fill?: string; stroke?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const font = useGameFont(size);
  const f = fill ?? c.gameYellow;
  const s = stroke ?? c.gameOutline;
  // Each character drawn once (its outline, and its fill) with its ink, for the UI thread to place.
  const kit = useMemo(() => {
    if (!font) return null;
    const l = layout(font, room, size);
    const gap = l.sw * 0.35;
    const glyphs = LIVE_CHARS.split('').map((ch) => {
      const ink = glyphInk(font, ch);
      const outline = createPicture((cv) => drawOutline(cv, ch, 0, l.baseline, font, l.sw, s));
      const face = createPicture((cv) => {
        const paint = Skia.Paint();
        paint.setAntiAlias(true);
        paint.setColor(Skia.Color(f));
        cv.drawText(ch, 0, l.baseline, paint, font);
      });
      return { left: ink.left, width: ink.width, mass: ink.mass ?? -1, known: ink.mass != null, area: ink.area, outline, face };
    });
    // Room for the widest number, its outline and drop either side, and its shift to where it looks centred.
    const width = inkRun(room, font, gap).width + (l.sw * 1.6 + size * 0.12) * 2;
    return { glyphs, gap, width, height: l.height };
  }, [font, room, size, f, s]);
  const empty = useMemo(() => createPicture(() => {}), []);
  const picture = useDerivedValue(() => {
    if (!kit) return empty;
    const text = String(Math.round(value.value));
    const at: number[] = [];
    const which: number[] = [];
    let cursor = 0;
    let weight = 0;
    let moment = 0;
    let known = true;
    for (let i = 0; i < text.length; i++) {
      const k = LIVE_CHARS.indexOf(text[i]);
      if (k < 0) continue;
      const g = kit.glyphs[k];
      const x = cursor - g.left;
      at.push(x);
      which.push(k);
      if (!g.known) known = false;
      else {
        weight += g.area;
        moment += g.area * (x + g.mass);
      }
      cursor += g.width + kit.gap;
    }
    const width = Math.max(0, cursor - kit.gap);
    const centre = known && weight > 0 ? (width / 2 + moment / weight) / 2 : width / 2;
    const x0 = kit.width / 2 - centre;
    return createPicture((cv) => {
      // Every outline before any fill, so they run together behind the digits.
      for (let i = 0; i < at.length; i++) {
        cv.save();
        cv.translate(x0 + at[i], 0);
        cv.drawPicture(kit.glyphs[which[i]].outline);
        cv.restore();
      }
      for (let i = 0; i < at.length; i++) {
        cv.save();
        cv.translate(x0 + at[i], 0);
        cv.drawPicture(kit.glyphs[which[i]].face);
        cv.restore();
      }
    });
  });
  if (!kit)
    return (
      <View style={[{ height: size * 1.25, minWidth: size * 0.6 * room.length, justifyContent: 'center', alignItems: 'center' }, style]}>
        <RNText style={{ fontFamily: fonts.heading, fontSize: size, lineHeight: size * 1.2, color: f, textShadowColor: s, textShadowRadius: Math.max(2, size * 0.06), textShadowOffset: { width: 0, height: Math.max(1, size * 0.04) } }}>{String(fallback)}</RNText>
      </View>
    );
  return (
    <Canvas style={[{ width: kit.width, height: kit.height }, style]}>
      <Picture picture={picture} />
    </Canvas>
  );
}
