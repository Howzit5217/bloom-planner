import { BlendMode, Canvas, createPicture, PaintStyle, Picture, Skia, StrokeCap, TileMode, vec, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { lookKey, mix, type SkyLook } from '@/engine/sky';
import { useSkyLook } from '@/store/sky';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { rng } from './shapes';
import { fieldSprig } from './sprigLayout';
import { sprigPainter } from './sprigPainter';
import { useBloomFactor } from '@/ui/bloom';
import { useAppWidth } from '@/ui/layout';
import { STILL } from './still';

export const color = (paint: SkPaint, hex: string, alpha = 1) => {
  paint.setColor(Skia.Color(hex));
  paint.setAlphaf(alpha);
};

/** A flat, puffy cloud like the game's: three or four round bumps on a flat base, lighter on top. */
function cloud(canvas: SkCanvas, x: number, y: number, s: number, fill: string, shade: string, paint: SkPaint, rand: () => number) {
  const bumps = 3 + Math.floor(rand() * 2);
  const parts: Array<[number, number, number]> = [];
  for (let i = 0; i < bumps; i++) {
    const t = bumps === 1 ? 0.5 : i / (bumps - 1);
    const r = s * (0.32 + (1 - Math.abs(t - 0.5) * 2) * 0.22 + rand() * 0.06);
    parts.push([x + (t - 0.5) * s * 1.5, y - r * 0.55, r]);
  }
  const draw = (dy: number) => {
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x - s * 0.95, y - s * 0.28 + dy, s * 1.9, s * 0.5), s * 0.25, s * 0.25), paint);
    for (const [cx, cy, r] of parts) canvas.drawCircle(cx, cy + dy, r, paint);
  };
  color(paint, shade, 0.9);
  draw(s * 0.09);
  color(paint, fill, 0.97);
  draw(0);
}

/**
 * The sky from the top down to the horizon `hz`, `fullW` wide: the gradient, stars and clouds across
 * all of it, and the sun or moon placed over the part the screen shows (`viewW` wide from `left`).
 */
export function drawSky(canvas: SkCanvas, rand: () => number, hz: number, fullW: number, left: number, viewW: number, look: SkyLook) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, hz), [Skia.Color(look.top), Skia.Color(look.mid), Skia.Color(look.horizon)], [0, 0.55, 1], TileMode.Clamp));
  canvas.drawRect(Skia.XYWHRect(0, 0, fullW, hz + 1), paint);
  paint.setShader(null);
  // Stars on a clear night, thicker up high.
  if (look.stars > 0) {
    const n = Math.round(((fullW * hz) / 1300) * look.stars);
    for (let i = 0; i < n; i++) {
      const sy = Math.pow(rand(), 1.6) * hz * 0.85;
      color(paint, '#FFFFFF', (0.35 + rand() * 0.6) * look.stars);
      canvas.drawCircle(rand() * fullW, sy, 0.6 + rand() * 1.2, paint);
    }
  }
  // The sun's arc, or the moon.
  const glow = Skia.Paint();
  glow.setAntiAlias(true);
  glow.setMaskFilter(Skia.MaskFilter.MakeBlur(0, 14, true));
  // High noon stays below the status bar and the top row of pills.
  const skyY = (height: number) => Math.max(40, hz - 18 - height * (hz - 44) * 0.7);
  if (look.sun) {
    const sx = left + look.sun.x * viewW;
    const sy = skyY(look.sun.height);
    // A broad, soft halo lighting the sky round the sun: bigger and warmer the lower it is.
    const low = 1 - look.sun.height;
    const halo = Skia.Paint();
    halo.setAntiAlias(true);
    halo.setBlendMode(BlendMode.Screen);
    halo.setShader(Skia.Shader.MakeRadialGradient(vec(sx, sy), viewW * (0.38 + 0.3 * low), [Skia.Color(look.sun.color), Skia.Color(`${look.sun.color}00`)], [0, 1], TileMode.Clamp));
    halo.setAlphaf(0.32 + 0.25 * low);
    canvas.drawRect(Skia.XYWHRect(0, 0, fullW, hz + 1), halo);
    color(glow, look.sun.color, 0.55);
    canvas.drawCircle(sx, sy, 30, glow);
    color(paint, look.sun.color);
    canvas.drawCircle(sx, sy, 15, paint);
  }
  if (look.moon) {
    const mx = left + look.moon.x * viewW;
    const my = skyY(look.moon.height);
    const R = 15;
    // A soft halo, then a round disc lit from the upper left, with a few gentle craters.
    color(glow, '#E4E9FF', 0.4);
    canvas.drawCircle(mx, my, R * 2.1, glow);
    color(glow, '#F6F3DF', 0.25);
    canvas.drawCircle(mx, my, R * 1.35, glow);
    paint.setAlphaf(1);
    paint.setShader(Skia.Shader.MakeRadialGradient(vec(mx - R * 0.35, my - R * 0.35), R * 1.45, [Skia.Color('#FFFDF0'), Skia.Color('#F1ECD2'), Skia.Color('#DCD6BC')], [0, 0.6, 1], TileMode.Clamp));
    canvas.drawCircle(mx, my, R, paint);
    paint.setShader(null);
    for (const [dx, dy, cr] of [
      [0.32, -0.18, 0.24],
      [-0.28, 0.3, 0.17],
      [0.12, 0.45, 0.12],
      [-0.42, -0.2, 0.1],
    ] as const) {
      color(paint, '#D8D1B6', 0.75);
      canvas.drawCircle(mx + dx * R, my + dy * R, cr * R, paint);
    }
  }
  // Clouds drift along the upper sky, sized to the screen.
  const count = Math.round(look.clouds * Math.max(0.6, fullW / 420));
  const shade = mix(look.cloudColor, look.mid, 0.35);
  for (let i = 0; i < count; i++) {
    const s = viewW * (0.07 + rand() * 0.07);
    const cy = hz * (0.18 + rand() * 0.62);
    cloud(canvas, rand() * (fullW + s) - s * 0.5, cy, s, look.cloudColor, shade, paint, rand);
  }
}

/**
 * The field lit from the sky: a broad glow across the grass on the sun's side, strongest toward the
 * horizon where its light rakes across (warmer and wider the lower the sun), the far side a touch in
 * shade, and a bright glint on the horizon under it. By night the moon gives a faint, cool sheen the
 * same way; under cloud, with neither showing, the light stays flat. `lightX` is where the sun (or
 * moon) is across the picture.
 */
export function drawSunlight(canvas: SkCanvas, w: number, hz: number, groundH: number, lightX: number, look: SkyLook) {
  const sun = look.sun;
  const moon = !sun && look.moon ? look.moon : null;
  if (!sun && !moon) return;
  const tint = sun ? sun.color : '#CFDBFF';
  const low = sun ? 1 - sun.height : 0.6;
  const strength = sun ? 0.55 + 0.3 * low : 0.14;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setBlendMode(BlendMode.Screen);
  // The glow: an ellipse spread along the horizon below the light, fading down the field.
  const reach = w * (0.75 + 0.5 * low);
  const flat = Skia.Matrix().translate(lightX, hz).scale(1, 0.6 + 0.3 * (1 - low)).translate(-lightX, -hz);
  paint.setShader(Skia.Shader.MakeRadialGradient(vec(lightX, hz), reach, [Skia.Color(tint), Skia.Color(`${tint}00`)], [0, 1], TileMode.Clamp, flat));
  paint.setAlphaf(strength);
  canvas.drawRect(Skia.XYWHRect(0, hz, w, groundH), paint);
  // The glint where the light meets the horizon.
  const glint = Skia.Matrix().translate(lightX, hz).scale(1, 0.12).translate(-lightX, -hz);
  paint.setShader(Skia.Shader.MakeRadialGradient(vec(lightX, hz), w * 0.32, [Skia.Color('#FFFFFF'), Skia.Color(tint), Skia.Color(`${tint}00`)], [0, 0.35, 1], TileMode.Clamp, glint));
  paint.setAlphaf(sun ? 0.5 + 0.3 * low : 0.12);
  canvas.drawRect(Skia.XYWHRect(0, hz - 10, w, Math.min(groundH, 60) + 10), paint);
  // The side away from the light, a little in shade.
  const shade = Skia.Paint();
  shade.setAntiAlias(true);
  const away = lightX < w / 2 ? w : 0;
  shade.setShader(Skia.Shader.MakeLinearGradient(vec(lightX, 0), vec(away, 0), [Skia.Color('#0B2A1200'), Skia.Color('#0B2A12')], [0.25, 1], TileMode.Clamp));
  shade.setAlphaf(sun ? 0.12 + 0.12 * low : 0.06);
  canvas.drawRect(Skia.XYWHRect(0, hz, w, groundH), shade);
}

/**
 * How the sun (or moon) lights the field, for the flowers and their shadows: its colour, how low it
 * is, and how lit a spot across the picture is (1 facing it, -1 away; 0 with neither showing).
 */
export function fieldLight(look: SkyLook, w: number, lightX: number) {
  const sun = look.sun;
  const moon = !sun && look.moon ? look.moon : null;
  const on = sun ? 1 : moon ? 0.35 : 0;
  return {
    on,
    tint: sun ? sun.color : '#CFDBFF',
    low: sun ? 1 - sun.height : 0.6,
    lightX,
    lit: (x: number) => (on ? on * (1 - 2 * Math.min(1, Math.abs(x - lightX) / (w * 0.6))) : 0),
  };
}
export type FieldLight = ReturnType<typeof fieldLight>;

/**
 * Soft shadows on the grass under the flowers, cast away from the light: across the field from it
 * and toward the viewer (the light is ahead, in the sky), longer the lower it is. `flowers` are the
 * stems' bases and head sizes, back to front.
 */
export function drawShadows(canvas: SkCanvas, light: FieldLight, flowers: Array<{ x: number; y: number; r: number }>) {
  if (!light.on) return;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color('#0B2A12'));
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(0, 2, true));
  const reach = 0.6 + 1.8 * light.low;
  for (const f of flowers) {
    if (f.r < 3) continue;
    const away = f.x >= light.lightX ? 1 : -1;
    const len = f.r * reach;
    paint.setAlphaf(0.16 * light.on);
    canvas.drawOval(Skia.XYWHRect(f.x + away * len * 0.5 - len * 0.7, f.y + f.r * 0.15 * light.low, len * 1.4, Math.max(1.5, f.r * 0.42)), paint);
  }
}

/** Where the soft lighter patches go and what colour: gathered toward the light, in its colour. */
export function shineOf(look: SkyLook, rand: () => number, w: number, lightX: number) {
  const lit = look.sun ?? null;
  const x = lit ? lightX + (rand() - 0.5) * w * 1.1 : rand() * w;
  const near = lit ? 1 - Math.min(1, Math.abs(x - lightX) / w) : 0.5;
  return { x, color: lit ? mix('#FFFFFF', lit.color, 0.6) : '#FFFFFF', alpha: (0.06 + rand() * 0.07) * (0.6 + 0.9 * near) * (1 - look.night * 0.7) };
}

/** The grass blades' colour, darker at night. */
export const bladeColorOf = (c: Palette, look: SkyLook) => mix(mix(c.grassBlade, look.groundNear, 0.35), '#1B2B44', look.night * 0.45);

/** A grass blade from (x, y) up, `len` long, leaning by `lean`. */
export function drawBlade(canvas: SkCanvas, blade: SkPaint, x: number, y: number, len: number, lean: number, width: number) {
  blade.setStrokeWidth(Math.max(1, width));
  canvas.drawPath(Skia.PathBuilder.Make().moveTo(x, y).quadTo(x + lean * 0.3, y - len * 0.6, x + lean, y - len).build(), blade);
}

/** A soft haze where the ground meets the sky, `haze` deep, fading down from the horizon. */
export function drawHaze(canvas: SkCanvas, w: number, hz: number, haze: number, alpha: number, look: SkyLook) {
  const paint = Skia.Paint();
  paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, hz), vec(0, hz + haze), [Skia.Color(look.horizon), Skia.Color(`${look.horizon}00`)], [0, 1], TileMode.Clamp));
  paint.setAlphaf(alpha);
  canvas.drawRect(Skia.XYWHRect(0, hz, w, haze), paint);
}

/** Fog, rain or snow over the scene, fireflies at night, and the dark theme's dimming by day. */
export function drawWeather(canvas: SkCanvas, rand: () => number, w: number, h: number, hz: number, look: SkyLook, c: Palette) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const groundH = Math.max(1, h - hz);
  if (look.fog) {
    color(paint, '#E9EDF2', 0.22);
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
  }
  if (look.rain) {
    const drop = Skia.Paint();
    drop.setAntiAlias(true);
    drop.setStyle(PaintStyle.Stroke);
    drop.setStrokeCap(StrokeCap.Round);
    drop.setStrokeWidth(1.6);
    color(drop, '#E4ECFF', 0.42);
    for (let i = 0; i < Math.round((w * h) / 1700); i++) {
      const x = rand() * w;
      const y = rand() * h;
      canvas.drawLine(x, y, x - 3, y + 11, drop);
    }
  }
  if (look.snow) {
    for (let i = 0; i < Math.round((w * h) / 2500); i++) {
      color(paint, '#FFFFFF', 0.6 + rand() * 0.35);
      canvas.drawCircle(rand() * w, rand() * h, 1.2 + rand() * 2, paint);
    }
  }
  if (look.night > 0.6) {
    const fly = Skia.Paint();
    fly.setAntiAlias(true);
    fly.setBlendMode(BlendMode.Screen);
    fly.setMaskFilter(Skia.MaskFilter.MakeBlur(0, 4, true));
    for (let i = 0; i < Math.round(w / 40); i++) {
      color(fly, '#F6D66E', 0.55);
      canvas.drawCircle(rand() * w, hz + rand() * groundH * 0.85, 2 + rand() * 2, fly);
    }
  }
  // The dark theme by day: a touch dimmer, so the cards stay the brightest thing.
  if (c.dark && look.night < 0.5) {
    color(paint, '#0A0E14', 0.22);
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
  }
}

function drawScene(w: number, h: number, horizon: number, look: SkyLook, c: Palette, density: number, seed: number) {
  return createPicture((canvas) => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const rand = rng(seed);
    const hz = Math.max(0, Math.min(h, horizon));
    const groundH = Math.max(1, h - hz);

    if (hz > 0) drawSky(canvas, rand, hz, w, 0, w, look);

    // ── The ground ──
    paint.setAlphaf(1);
    paint.setShader(
      Skia.Shader.MakeLinearGradient(vec(0, hz), vec(0, h), [Skia.Color(look.groundFar), Skia.Color(look.groundMid), Skia.Color(look.groundNear)], [0, 0.4, 1], TileMode.Clamp),
    );
    canvas.drawRect(Skia.XYWHRect(0, hz, w, groundH), paint);
    paint.setShader(null);
    // Lit from the sun (or moon) where it is in the sky above.
    const lightX = (look.sun ?? look.moon)?.x != null ? (look.sun ?? look.moon)!.x * w : w / 2;
    drawSunlight(canvas, w, hz, groundH, lightX, look);
    // Soft lighter patches, flatter toward the horizon, catching the light.
    for (let i = 0; i < 6; i++) {
      const t = rand();
      const py = hz + t * groundH;
      const pr = w * (0.18 + rand() * 0.3) * (0.5 + t);
      const shine = shineOf(look, rand, w, lightX);
      color(paint, shine.color, shine.alpha);
      canvas.drawOval(Skia.XYWHRect(shine.x - pr, py - pr * 0.12 * (0.4 + t), pr * 2, pr * 0.24 * (0.4 + t)), paint);
    }
    // Grass blades, smaller in the distance.
    const blade = Skia.Paint();
    blade.setAntiAlias(true);
    blade.setStyle(PaintStyle.Stroke);
    blade.setStrokeCap(StrokeCap.Round);
    color(blade, bladeColorOf(c, look), 0.5);
    const blades = Math.round((w * groundH) / 850);
    for (let i = 0; i < blades; i++) {
      const t = Math.pow(rand(), 0.8);
      const x = rand() * w;
      const y = hz + 4 + t * (groundH - 4);
      const k = 0.35 + 0.75 * t;
      drawBlade(canvas, blade, x, y, (5 + rand() * 7) * k, (rand() - 0.5) * 6 * k, 2 * k);
    }
    // A few of the setup screens' stemmed flowers across the field, back to front.
    const colors = [c.petalRed, c.petalYellow, c.petalWhite, c.petalBlue];
    const n = Math.round(((w * groundH) / 1700) * density * 0.4);
    const sprigs = Array.from({ length: n }, () => {
      const t = Math.pow(rand(), 0.9);
      return fieldSprig(rand() * w, hz + 6 + t * (groundH - 6), (6 + rand() * 6) * (0.5 + 0.7 * t), colors[Math.floor(rand() * colors.length)], rand);
    });
    sprigs.sort((a, b) => a.y - b.y);
    const light = fieldLight(look, w, lightX);
    drawShadows(canvas, light, sprigs);
    const paintSprig = sprigPainter(c, look, light);
    for (const sp of sprigs) paintSprig(canvas, sp);
    // Haze where the ground meets the sky (and a thicker one in fog). A field drawn on its own (its
    // horizon at the top edge) meets a separately drawn sky there, so its haze is fuller.
    const own = horizon <= 0;
    drawHaze(canvas, w, hz, Math.min(groundH * (look.fog ? 0.45 : own ? 0.12 : 0.08), look.fog ? 400 : own ? 110 : 70), look.fog ? 0.85 : own ? 0.8 : 0.45, look);
    drawWeather(canvas, rand, w, h, hz, look, c);
  }, Skia.XYWHRect(0, 0, w, h));
}

/**
 * The backdrop: a sky (the real time of day and weather where you play) above a field of grass and
 * flowers. Drawn once into a picture, so scrolling over it is cheap; redrawn when the sky changes.
 * `horizon` is where the ground starts, in points from the top: at the bottom edge it's only sky, at
 * the top edge only field. (Home draws its own, through a camera: CameraMeadow.)
 */
export function Meadow({ height, horizon, density = 1, seed: fixedSeed, width }: { height: number; horizon: number; density?: number; seed?: number; width?: number }) {
  const { c } = useTheme();
  const look = useSkyLook();
  const appWidth = useAppWidth();
  const w = width ?? appWidth;
  const bloom = useBloomFactor();
  // A fresh field every visit unless a seed pins it.
  const [randomSeed] = useState(() => 1 + Math.floor(Math.random() * 2147483000));
  const seed = fixedSeed ?? randomSeed;
  // Drawn again only when the sky visibly changes (lookKey), not at every few minutes' tick.
  const sky = lookKey(look);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const picture = useMemo(() => drawScene(w, height, horizon, look, c, density * bloom, seed), [w, height, horizon, sky, c, density, bloom, seed]);
  return (
    <View pointerEvents="none" style={{ width: w, height }}>
      <Canvas __destroyWebGLContextAfterRender={STILL} style={{ width: w, height }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
