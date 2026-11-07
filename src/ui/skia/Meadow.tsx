import { BlendMode, Canvas, ClipOp, createPicture, PaintStyle, Picture, Skia, StrokeCap, TileMode, vec, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { lookKey, mix, multiply, type SkyLook } from '@/engine/sky';
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

/** How far a cloud reaches round its middle, in its sizes: for the picture it's drawn into. */
export const CLOUD_BOUNDS = { left: -1.75, top: -1.25, width: 3.5, height: 1.7 };

/**
 * A cloud as clouds look (a fair-weather cumulus): a heap of rounded billows, the biggest in the
 * middle building into a dome, smaller ones crowding their tops like a cauliflower's, sitting on a
 * flat, shaded base. Each billow is lit from the sun's side above and shaded away from it, and the
 * ones in front overlap the ones behind, so every billow stands out from the next; the edges are
 * soft and a little see-through, as cloud is. `lean` is where the light comes from across (-1 left
 * to 1 right). Its shape comes from `rand`, so each cloud is its own.
 */
export function cloud(canvas: SkCanvas, x: number, y: number, s: number, fill: string, shade: string, _paint: SkPaint, rand: () => number, lean = 0) {
  const base = y + s * 0.12;
  const puffs: Array<{ x: number; y: number; r: number; edge: number }> = [];
  // Each its own build: some long and flat, some tall and heaped, built up off-centre a little.
  const wide = 0.75 + rand() * 0.55;
  const tall = 0.65 + rand() * 0.5;
  const n = 4 + Math.floor(rand() * 3) + (wide > 1.05 ? 1 : 0);
  const peak = (rand() - 0.5) * 0.6;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1 + (rand() - 0.5) * 0.25;
    const dome = Math.max(0, 1 - (t - peak) * (t - peak) * 0.8);
    const r = s * (0.15 + 0.21 * dome * tall + rand() * 0.05);
    const p = { x: x + t * s * 0.78 * wide, y: base - r * 0.75 - dome * s * 0.26 * tall - rand() * s * 0.03, r, edge: 1 - dome };
    puffs.push(p);
    // Smaller billows building on its top, and smaller still on theirs.
    if (dome > 0.35 && rand() < 0.4 + 0.6 * tall) {
      const k = 1 + Math.floor(rand() * 2);
      for (let j = 0; j < k; j++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.2;
        const r2 = r * (0.5 + rand() * 0.22);
        const q = { x: p.x + Math.cos(a) * r * 0.65, y: p.y + Math.sin(a) * r * 0.65, r: r2, edge: 0.35 };
        puffs.push(q);
        if (rand() < 0.4) {
          const a3 = -Math.PI / 2 + (rand() - 0.5) * 1.8;
          puffs.push({ x: q.x + Math.cos(a3) * r2 * 0.6, y: q.y + Math.sin(a3) * r2 * 0.6, r: r2 * (0.45 + rand() * 0.15), edge: 0.7 });
        }
      }
    }
  }
  // The highest first, so the lower billows in front overlap them.
  puffs.sort((a, b) => a.y - b.y);
  const top = Math.min(...puffs.map((p) => p.y - p.r));
  const lit = mix(fill, '#FFFFFF', 0.55);
  const dark = mix(shade, fill, 0.15);
  const blur = Math.max(1, s * 0.03);
  const layer = Skia.Paint();
  canvas.saveLayer(layer);
  // A faint, wider veil of cloud round it all: the thin edges real cloud has.
  const veil = Skia.Paint();
  veil.setAntiAlias(true);
  veil.setMaskFilter(Skia.MaskFilter.MakeBlur(0, s * 0.07, true));
  veil.setColor(Skia.Color(fill));
  veil.setAlphaf(0.28);
  for (const p of puffs) canvas.drawCircle(p.x, p.y, p.r * 1.05, veil);
  const puff = Skia.Paint();
  puff.setAntiAlias(true);
  puff.setMaskFilter(Skia.MaskFilter.MakeBlur(0, blur, true));
  for (const p of puffs) {
    // Lit toward the light, shading round to the far side and underneath.
    const lx = p.x + lean * p.r * 0.38;
    const ly = p.y - p.r * 0.5;
    puff.setShader(Skia.Shader.MakeRadialGradient(vec(lx, ly), p.r * 1.5, [Skia.Color(lit), Skia.Color(fill), Skia.Color(mix(fill, dark, 0.4))], [0, 0.5, 1], TileMode.Clamp));
    // The small billows on the edges are thinner: a little see-through.
    puff.setAlphaf(1 - 0.25 * p.edge);
    canvas.drawCircle(p.x, p.y, p.r, puff);
  }
  // The base in shadow, darkest along the bottom.
  const under = Skia.Paint();
  under.setBlendMode(BlendMode.SrcATop);
  under.setShader(Skia.Shader.MakeLinearGradient(vec(x, top + (base - top) * 0.45), vec(x, base + s * 0.05), [Skia.Color(`${dark}00`), Skia.Color(`${dark}80`), Skia.Color(dark)], [0, 0.6, 1], TileMode.Clamp));
  canvas.drawRect(Skia.XYWHRect(x - s * 1.7, top, s * 3.4, base + s * 0.3 - top), under);
  // A flat, soft-edged bottom: what hangs below the base thins out to nothing.
  const cut = Skia.Paint();
  cut.setBlendMode(BlendMode.DstOut);
  cut.setShader(Skia.Shader.MakeLinearGradient(vec(x, base - s * 0.04), vec(x, base + s * 0.1), [Skia.Color('#00000000'), Skia.Color('#000000FF')], [0, 1], TileMode.Clamp));
  canvas.drawRect(Skia.XYWHRect(x - s * 1.7, base - s * 0.04, s * 3.4, s * 0.4), cut);
  canvas.restore();
}

/** The sun's disc, in points: bigger than the real thing (as a photo's glare makes it look), still small in the sky. */
const SUN_R = 12;
/** The altitude (degrees) where the setting sun's lower edge meets the horizon; it's gone at -0.83. */
const SUN_TOUCH = 2.2;

/**
 * Where the sun's centre sits, from its altitude: up to just below the status bar at 70 degrees, and
 * near the horizon sinking behind it as it really sets, its last edge going at -0.83 degrees.
 */
export function sunY(hz: number, altitude: number, top = SKY_TOP) {
  // The whole path fits between the horizon and `top`, however little sky there is (a page's strip).
  const topRise = Math.max(SUN_R + 2, Math.min(hz - top, 18 + (hz - top - 4) * 0.7));
  const rise = altitude <= SUN_TOUCH ? -SUN_R + ((altitude + 0.83) / (SUN_TOUCH + 0.83)) * 2 * SUN_R : SUN_R + ((altitude - SUN_TOUCH) / (70 - SUN_TOUCH)) * (topRise - SUN_R);
  return Math.max(top, hz - Math.min(topRise, rise));
}

/** The highest the sun or moon is drawn, by default: below the status bar and the top row of pills. */
const SKY_TOP = 40;
const MOON_R = 13;

/**
 * The moon's lit part, round (0, 0) with the sun to the right (+x): the bright half-disc on that side,
 * and the line between light and dark coming back across it, bulging toward the sun for a crescent
 * and away from it past half (`lit` is the share lit, 0 new to 1 full).
 */
function litPath(R: number, lit: number) {
  const b = Skia.PathBuilder.Make();
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    if (i === 0) b.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    else b.lineTo(Math.cos(a) * R, Math.sin(a) * R);
  }
  const w = R * (1 - 2 * lit);
  for (let i = 1; i <= N; i++) {
    const a = Math.PI / 2 - (i / N) * Math.PI;
    b.lineTo(Math.cos(a) * w, Math.sin(a) * R);
  }
  b.close();
  return b.build();
}

const clear = (hex: string) => Skia.Color(`${hex}00`);

/**
 * The sun itself: a white-hot disc (yellow to orange as it gets low) with the glare round it, drawn
 * last, over anything that dims the scene (the dark theme's veil), as a light is. Below the horizon
 * it's hidden by the ground, so it sinks out of sight at sunset. Behind cloud it's a pale, softer
 * disc with little glare (and the drifting clouds pass over it). The sky's light round it is drawSky's.
 */
export function drawSunDisc(canvas: SkCanvas, hz: number, left: number, viewW: number, look: SkyLook, top = SKY_TOP) {
  const sun = look.sun;
  if (!sun) return;
  const sx = left + sun.x * viewW;
  const sy = sunY(hz, sun.altitude, top);
  const through = 1 - look.veil;
  // Low down, air bends the light: the disc looks a little flattened on the horizon.
  const flat = 1 - 0.12 * Math.max(0, Math.min(1, 1 - sun.altitude / 3));
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(sx - SUN_R * 8, 0, SUN_R * 16, hz), ClipOp.Intersect, true);
  // The glare: brightest hugging the disc, falling off quickly (as light does), in the disc's colour.
  const glare = Skia.Paint();
  glare.setAntiAlias(true);
  glare.setBlendMode(BlendMode.Screen);
  const reach = SUN_R * (3.2 + 1.6 * sun.power);
  glare.setShader(Skia.Shader.MakeRadialGradient(vec(sx, sy), reach, [Skia.Color('#FFFFFF'), Skia.Color(sun.disc), Skia.Color(`${sun.disc}55`), clear(sun.disc)], [0, 0.28, 0.55, 1], TileMode.Clamp));
  glare.setAlphaf((0.55 + 0.4 * sun.power) * (0.12 + 0.88 * through));
  canvas.drawCircle(sx, sy, reach, glare);
  // The disc, with a soft edge rather than a sticker's: one colour nearly to the rim (white-hot high
  // up, gold to orange low down), only a touch deeper at the very edge.
  const disc = Skia.Paint();
  disc.setAntiAlias(true);
  disc.setMaskFilter(Skia.MaskFilter.MakeBlur(0, 0.8, true));
  const white = Math.max(0, (sun.power - 0.5) / 0.5);
  const core = mix(sun.disc, '#FFFFFF', 0.25 + 0.75 * white);
  disc.setShader(Skia.Shader.MakeRadialGradient(vec(sx, sy), SUN_R, [Skia.Color(core), Skia.Color(core), Skia.Color(mix(sun.disc, core, 0.55))], [0, 0.7, 1], TileMode.Clamp));
  disc.setAlphaf(1 - 0.78 * look.veil);
  canvas.drawOval(Skia.XYWHRect(sx - SUN_R, sy - SUN_R * flat, SUN_R * 2, SUN_R * 2 * flat), disc);
  canvas.restore();
}

/**
 * The sky from the top down to the horizon `hz`, `fullW` wide: the gradient, the sunrise or sunset
 * glow, stars and clouds across all of it, and the sun's light or the moon placed over the part the
 * screen shows (`viewW` wide from `left`). `clouds: false` leaves the clouds out, for a scene that
 * has them drifting live (Home). The sun's disc is drawSunDisc's, drawn after the rest of the scene.
 */
export function drawSky(canvas: SkCanvas, rand: () => number, hz: number, fullW: number, left: number, viewW: number, look: SkyLook, { clouds = true, top = SKY_TOP }: { clouds?: boolean; top?: number } = {}) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, hz), [Skia.Color(look.top), Skia.Color(look.mid), Skia.Color(look.horizon)], [0, 0.55, 1], TileMode.Clamp));
  canvas.drawRect(Skia.XYWHRect(0, 0, fullW, hz + 1), paint);
  paint.setShader(null);
  // Sunrise and sunset: the horizon glows under the sun, gold to orange, spreading along it and
  // fading up the sky; it's there from before the sun rises and lingers after it has set.
  const glow = look.glow;
  if (glow.strength > 0.01) {
    const gx = left + glow.x * viewW;
    const wide = viewW * 1.15;
    const squash = Skia.Matrix().translate(gx, hz).scale(1, Math.min(1, (hz * 0.8) / wide)).translate(-gx, -hz);
    paint.setShader(Skia.Shader.MakeRadialGradient(vec(gx, hz), wide, [Skia.Color(glow.color), Skia.Color(`${glow.color}99`), Skia.Color(`${glow.color}33`), clear(glow.color)], [0, 0.3, 0.62, 1], TileMode.Clamp, squash));
    paint.setAlphaf(glow.strength);
    canvas.drawRect(Skia.XYWHRect(0, 0, fullW, hz + 1), paint);
    paint.setShader(null);
  }
  // Stars on a clear night, thicker up high.
  if (look.stars > 0) {
    const n = Math.round(((fullW * hz) / 1300) * look.stars);
    for (let i = 0; i < n; i++) {
      const sy = Math.pow(rand(), 1.6) * hz * 0.85;
      color(paint, '#FFFFFF', (0.35 + rand() * 0.6) * look.stars);
      canvas.drawCircle(rand() * fullW, sy, 0.6 + rand() * 1.2, paint);
    }
  }
  if (look.sun) {
    // The sky brightens round the sun, a whitish haze close in that fades into the blue (paler and
    // wider behind cloud, where the light spreads through it).
    const sun = look.sun;
    const sx = left + sun.x * viewW;
    const sy = sunY(hz, sun.altitude, top);
    const through = 1 - look.veil;
    const haze = mix('#FFFFFF', sun.color, 0.25 + 0.5 * (1 - sun.power));
    const lit = Skia.Paint();
    lit.setAntiAlias(true);
    lit.setBlendMode(BlendMode.Screen);
    const reach = viewW * (0.5 + 0.25 * look.veil);
    lit.setShader(Skia.Shader.MakeRadialGradient(vec(sx, sy), reach, [Skia.Color(haze), Skia.Color(`${haze}88`), Skia.Color(`${haze}22`), clear(haze)], [0, 0.1, 0.38, 1], TileMode.Clamp));
    lit.setAlphaf((0.45 + 0.35 * sun.power) * (0.3 + 0.7 * through));
    canvas.drawRect(Skia.XYWHRect(0, 0, fullW, hz + 1), lit);
  }
  if (look.moon) {
    // The moon where it is in the sky, in its phase: the side toward the sun lit, the rest dark (a
    // faint earthshine at night). By day it's a pale disc in the blue; it sinks behind the horizon.
    const moon = look.moon;
    const mx = left + moon.x * viewW;
    const my = sunY(hz, moon.altitude, top);
    const R = MOON_R;
    const through = 1 - look.veil;
    const dark = look.night;
    canvas.save();
    canvas.clipRect(Skia.XYWHRect(mx - R * 4, 0, R * 8, hz), ClipOp.Intersect, true);
    if (dark > 0.2 && moon.fraction > 0.05) {
      const halo = Skia.Paint();
      halo.setAntiAlias(true);
      halo.setMaskFilter(Skia.MaskFilter.MakeBlur(0, 14, true));
      color(halo, '#E4E9FF', 0.4 * (0.4 + 0.6 * through) * dark * moon.fraction);
      canvas.drawCircle(mx, my, R * 2.1, halo);
      color(halo, '#F6F3DF', 0.25 * through * dark * moon.fraction);
      canvas.drawCircle(mx, my, R * 1.35, halo);
    }
    const behind = Skia.Paint();
    behind.setAlphaf((1 - 0.7 * look.veil) * (0.45 + 0.55 * dark));
    canvas.saveLayer(behind);
    color(paint, '#8C96B4', 0.2 * dark);
    canvas.drawCircle(mx, my, R, paint);
    // The lit part: clipped to the phase turned toward the sun, the face itself staying upright.
    canvas.save();
    canvas.translate(mx, my);
    canvas.rotate((moon.tilt * 180) / Math.PI, 0, 0);
    canvas.clipPath(litPath(R, moon.fraction), ClipOp.Intersect, true);
    canvas.rotate((-moon.tilt * 180) / Math.PI, 0, 0);
    canvas.translate(-mx, -my);
    const lx = mx + Math.cos(moon.tilt) * R * 0.35;
    const ly = my + Math.sin(moon.tilt) * R * 0.35;
    paint.setAlphaf(1);
    paint.setShader(Skia.Shader.MakeRadialGradient(vec(lx, ly), R * 1.45, [Skia.Color('#FFFDF0'), Skia.Color('#F1ECD2'), Skia.Color('#DCD6BC')], [0, 0.6, 1], TileMode.Clamp));
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
    canvas.restore();
    canvas.restore();
    canvas.restore();
  }
  if (!clouds) return;
  const shade = cloudShade(look);
  const lean = look.sun && look.veil < 0.5 ? Math.max(-1, Math.min(1, (look.sun.x - 0.5) * 2.2)) : 0;
  for (const k of cloudsOf(look, rand, hz, fullW, viewW)) cloud(canvas, k.x, k.y, k.s, look.cloudColor, shade, paint, rand, lean);
}

/** The clouds' shaded underside: a soft blue-grey, deeper in bad weather (the cloud colour greys already). */
export const cloudShade = (look: SkyLook) => mix(mix(look.cloudColor, '#7E8CA0', 0.38), look.mid, 0.2);

/** Where the clouds go along the upper sky, sized to the screen: as many as the weather has. */
export function cloudsOf(look: SkyLook, rand: () => number, hz: number, fullW: number, viewW: number): Array<{ x: number; y: number; s: number }> {
  const count = Math.round(look.clouds * Math.max(0.6, fullW / 420));
  return Array.from({ length: count }, () => {
    // From small wisps to big heaps (more small than big), bigger and heavier the more the sky is covered.
    const s = viewW * (0.05 + Math.pow(rand(), 1.4) * 0.12) * (1 + 0.6 * look.veil);
    const y = hz * (0.18 + rand() * 0.62);
    return { x: rand() * (fullW + s) - s * 0.5, y, s };
  });
}

/**
 * The field lit from the sky: a broad sheen across the grass on the sun's side, strongest toward the
 * horizon where its light rakes across (warmer and wider the lower the sun), the far side a touch in
 * shade. After sunset (and before sunrise) the glow on the
 * horizon does the same, faintly; by night the moon gives a faint, cool sheen. Under cloud the
 * light stays flat. `lightX` is where the sun (or moon) is across the picture.
 */
export function drawSunlight(canvas: SkCanvas, w: number, hz: number, groundH: number, lightX: number, look: SkyLook) {
  const sun = look.sun;
  const dusk = !sun && look.glow.strength > 0.15 ? look.glow : null;
  const moon = !sun && !dusk && look.moon ? look.moon : null;
  if (!sun && !dusk && !moon) return;
  const tint = sun ? sun.color : dusk ? dusk.color : '#CFDBFF';
  const low = sun ? 1 - sun.height : dusk ? 1 : 0.6;
  // Under cloud the light on the field is flat: as much of it as gets through.
  const through = 1 - look.veil;
  const strength = (sun ? (0.3 + 0.3 * low) * (0.5 + 0.5 * sun.power) : dusk ? 0.3 * dusk.strength : 0.14 * (moon?.fraction ?? 0)) * through;
  if (strength <= 0.01) return;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setBlendMode(BlendMode.Screen);
  // The glow: an ellipse spread along the horizon below the light, fading down the field.
  const reach = w * (0.75 + 0.5 * low);
  const flat = Skia.Matrix().translate(lightX, hz).scale(1, 0.6 + 0.3 * (1 - low)).translate(-lightX, -hz);
  paint.setShader(Skia.Shader.MakeRadialGradient(vec(lightX, hz), reach, [Skia.Color(tint), Skia.Color(`${tint}00`)], [0, 1], TileMode.Clamp, flat));
  paint.setAlphaf(strength);
  canvas.drawRect(Skia.XYWHRect(0, hz, w, groundH), paint);
  // The side away from the light, a little in shade.
  const shade = Skia.Paint();
  shade.setAntiAlias(true);
  const away = lightX < w / 2 ? w : 0;
  shade.setShader(Skia.Shader.MakeLinearGradient(vec(lightX, 0), vec(away, 0), [Skia.Color('#0B2A1200'), Skia.Color('#0B2A12')], [0.25, 1], TileMode.Clamp));
  shade.setAlphaf((sun ? 0.1 + 0.1 * low : 0.05) * through);
  canvas.drawRect(Skia.XYWHRect(0, hz, w, groundH), shade);
}

/**
 * How the sun (or moon) lights the field, for the flowers and their shadows: its colour, how low it
 * is, and how lit a spot across the picture is (1 facing it, -1 away; 0 with neither showing).
 */
export function fieldLight(look: SkyLook, w: number, lightX: number) {
  const sun = look.sun;
  const moon = !sun && look.moon ? look.moon : null;
  const on = (sun ? 1 : moon ? 0.35 * moon.fraction : 0) * (1 - look.veil);
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
// The grass turns with the ground through autumn and winter (green blades on gold ground looked painted on).
export const bladeColorOf = (c: Palette, look: SkyLook) => mix(mix(multiply(c.grassBlade, look.light), look.groundNear, Math.min(0.92, 0.35 + 0.45 * look.turn + 0.5 * look.snowCover)), '#1B2B44', look.night * 0.3);

/** A grass blade from (x, y) up, `len` long, leaning by `lean`. */
export function drawBlade(canvas: SkCanvas, blade: SkPaint, x: number, y: number, len: number, lean: number, width: number) {
  blade.setStrokeWidth(Math.max(1, width));
  canvas.drawPath(Skia.PathBuilder.Make().moveTo(x, y).quadTo(x + lean * 0.3, y - len * 0.6, x + lean, y - len).build(), blade);
}

/** How much of the haze a flower `y` takes on, `haze` deep below the horizon `hz`: some right at the horizon, none from half way down it. */
export const hazeFade = (hz: number, haze: number, alpha: number) => (y: number) => {
  const k = 1 - (y - hz) / Math.max(1, haze * 0.5);
  return y <= hz || k <= 0 ? 0 : Math.min(0.55, 0.55 * alpha) * k * k;
};

/**
 * The air between here and the far field: at the horizon the sky's own colour (so the sky runs into
 * the field rather than meeting it at a line), thinning quickly down the field, as distance fades
 * things in real air. On the sun's side at sunrise and sunset it takes the glow's colour (`glowX`,
 * where that is across the picture). `haze` deep; `alpha` how thick it is at the horizon.
 */
export function drawHaze(canvas: SkCanvas, w: number, hz: number, haze: number, alpha: number, look: SkyLook, glowX = w / 2) {
  const paint = Skia.Paint();
  const fade = (hex: string) =>
    Skia.Shader.MakeLinearGradient(vec(0, hz), vec(0, hz + haze), [Skia.Color(hex), Skia.Color(`${hex}A0`), Skia.Color(`${hex}4D`), Skia.Color(`${hex}17`), Skia.Color(`${hex}00`)], [0, 0.12, 0.32, 0.62, 1], TileMode.Clamp);
  paint.setShader(fade(look.horizon));
  paint.setAlphaf(alpha);
  canvas.drawRect(Skia.XYWHRect(0, hz, w, haze), paint);
  const glow = look.glow;
  if (glow.strength > 0.01) {
    // The glow's spread along the horizon (as drawSky has it), faded down the field the same way.
    const wide = w * 1.15;
    const squash = Skia.Matrix().translate(glowX, hz).scale(1, Math.min(1, (hz * 0.8) / wide)).translate(-glowX, -hz);
    const across = Skia.Shader.MakeRadialGradient(vec(glowX, hz), wide, [Skia.Color(glow.color), Skia.Color(`${glow.color}99`), Skia.Color(`${glow.color}33`), Skia.Color(`${glow.color}00`)], [0, 0.3, 0.62, 1], TileMode.Clamp, squash);
    paint.setShader(Skia.Shader.MakeBlend(BlendMode.DstIn, across, fade('#000000')));
    paint.setAlphaf(alpha * glow.strength);
    canvas.drawRect(Skia.XYWHRect(0, hz, w, haze), paint);
  }
}

/**
 * Fog, rain or snow over the scene, fireflies at night, and the dark theme's dimming by day.
 * `falling: false` leaves out the rain and snow, for a scene that has them falling live
 * (Precipitation) or is too small for them: drawn into a still picture they only hang there.
 */
export function drawWeather(canvas: SkCanvas, rand: () => number, w: number, h: number, hz: number, look: SkyLook, c: Palette, { falling = true }: { falling?: boolean } = {}) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const groundH = Math.max(1, h - hz);
  if (look.fog) {
    color(paint, '#E9EDF2', 0.22);
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
  }
  if (look.rain && falling) {
    const drop = Skia.Paint();
    drop.setAntiAlias(true);
    drop.setStyle(PaintStyle.Stroke);
    drop.setStrokeCap(StrokeCap.Round);
    drop.setStrokeWidth(1.6);
    color(drop, '#E4ECFF', 0.42);
    for (let i = 0; i < Math.round(((w * h) / 1700) * [0.45, 1, 1.9][Math.max(1, look.fall) - 1]); i++) {
      const x = rand() * w;
      const y = rand() * h;
      canvas.drawLine(x, y, x - 3, y + 11, drop);
    }
  }
  if (look.snow && falling) {
    for (let i = 0; i < Math.round(((w * h) / 2500) * [0.45, 1, 2.1][Math.max(1, look.fall) - 1]); i++) {
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

function drawScene(w: number, h: number, horizon: number, look: SkyLook, c: Palette, density: number, seed: number, skyTop?: number) {
  return createPicture((canvas) => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const rand = rng(seed);
    const hz = Math.max(0, Math.min(h, horizon));
    const groundH = Math.max(1, h - hz);

    if (hz > 0) drawSky(canvas, rand, hz, w, 0, w, look, { top: skyTop });

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
    // Haze where the ground meets the sky (and a thicker one in fog), over the grass and under the
    // flowers, which fade into it a little instead (a band lying over them looked like a line drawn
    // across them). A field drawn on its own (its horizon at the top edge) meets a separately drawn
    // sky there, so its haze is fuller.
    const own = horizon <= 0;
    const hazeDepth = Math.min(groundH * (look.fog ? 0.45 : own ? 0.14 : 0.2), look.fog ? 400 : own ? 110 : 90);
    const hazeAlpha = look.fog ? 0.9 : own ? 0.8 : 1;
    drawHaze(canvas, w, hz, hazeDepth, hazeAlpha, look, look.glow.x * w);
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
    const paintSprig = sprigPainter(c, look, light, hazeFade(hz, hazeDepth, hazeAlpha));
    for (const sp of sprigs) paintSprig(canvas, sp);
    // This is a still strip above a page: rain or snow would only hang in it (Home has it falling).
    drawWeather(canvas, rand, w, h, hz, look, c, { falling: false });
    if (hz > 0) drawSunDisc(canvas, hz, 0, w, look, skyTop);
  }, Skia.XYWHRect(0, 0, w, h));
}

/**
 * The backdrop: a sky (the real time of day and weather where you play) above a field of grass and
 * flowers. Drawn once into a picture, so scrolling over it is cheap; redrawn when the sky changes.
 * `horizon` is where the ground starts, in points from the top: at the bottom edge it's only sky, at
 * the top edge only field. `skyTop` is the highest the sun and moon go (for a strip of sky under the
 * status bar, so they stay in sight). (Home draws its own, through a camera: CameraMeadow.)
 */
export function Meadow({ height, horizon, density = 1, seed: fixedSeed, width, skyTop }: { height: number; horizon: number; density?: number; seed?: number; width?: number; skyTop?: number }) {
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
  const picture = useMemo(() => drawScene(w, height, horizon, look, c, density * bloom, seed, skyTop), [w, height, horizon, sky, c, density, bloom, seed, skyTop]);
  return (
    <View pointerEvents="none" style={{ width: w, height }}>
      <Canvas __destroyWebGLContextAfterRender={STILL} style={{ width: w, height }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
