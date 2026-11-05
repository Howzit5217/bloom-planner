import { BlendMode, Canvas, createPicture, PaintStyle, Picture, Skia, StrokeCap, TileMode, vec, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { mix, type SkyLook } from '@/engine/sky';
import { useSkyLook } from '@/store/sky';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { CENTRE_COLOR, CENTRE_R, flowerPath, rng, stemPath } from './shapes';
import { useAppWidth } from '@/ui/layout';

const color = (paint: SkPaint, hex: string, alpha = 1) => {
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

function drawScene(w: number, h: number, horizon: number, look: SkyLook, c: Palette, density: number, seed: number) {
  return createPicture((canvas) => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const rand = rng(seed);
    const hz = Math.max(0, Math.min(h, horizon));
    const groundH = Math.max(1, h - hz);

    // ── The sky ──
    if (hz > 0) {
      paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, hz), [Skia.Color(look.top), Skia.Color(look.mid), Skia.Color(look.horizon)], [0, 0.55, 1], TileMode.Clamp));
      canvas.drawRect(Skia.XYWHRect(0, 0, w, hz + 1), paint);
      paint.setShader(null);
      // Stars on a clear night, thicker up high.
      if (look.stars > 0) {
        const n = Math.round(((w * hz) / 1300) * look.stars);
        for (let i = 0; i < n; i++) {
          const sy = Math.pow(rand(), 1.6) * hz * 0.85;
          color(paint, '#FFFFFF', (0.35 + rand() * 0.6) * look.stars);
          canvas.drawCircle(rand() * w, sy, 0.6 + rand() * 1.2, paint);
        }
      }
      // The sun's arc, or the moon.
      const glow = Skia.Paint();
      glow.setAntiAlias(true);
      glow.setMaskFilter(Skia.MaskFilter.MakeBlur(0, 14, true));
      // High noon stays below the status bar and the top row of pills.
      const skyY = (height: number) => Math.max(40, hz - 18 - height * (hz - 44) * 0.7);
      if (look.sun) {
        const sx = look.sun.x * w;
        const sy = skyY(look.sun.height);
        color(glow, look.sun.color, 0.55);
        canvas.drawCircle(sx, sy, 30, glow);
        color(paint, look.sun.color);
        canvas.drawCircle(sx, sy, 15, paint);
      }
      if (look.moon) {
        const mx = look.moon.x * w;
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
      // Clouds drift along the upper sky.
      const count = Math.round(look.clouds * Math.max(0.6, w / 420));
      const shade = mix(look.cloudColor, look.mid, 0.35);
      for (let i = 0; i < count; i++) {
        const s = w * (0.07 + rand() * 0.07);
        const cy = hz * (0.18 + rand() * 0.62);
        cloud(canvas, rand() * (w + s) - s * 0.5, cy, s, look.cloudColor, shade, paint, rand);
      }
    }

    // ── The ground ──
    paint.setAlphaf(1);
    paint.setShader(
      Skia.Shader.MakeLinearGradient(vec(0, hz), vec(0, h), [Skia.Color(look.groundFar), Skia.Color(look.groundMid), Skia.Color(look.groundNear)], [0, 0.4, 1], TileMode.Clamp),
    );
    canvas.drawRect(Skia.XYWHRect(0, hz, w, groundH), paint);
    paint.setShader(null);
    // Soft lighter patches, flatter toward the horizon.
    for (let i = 0; i < 6; i++) {
      const t = rand();
      const py = hz + t * groundH;
      const pr = w * (0.18 + rand() * 0.3) * (0.5 + t);
      color(paint, '#FFFFFF', (0.05 + rand() * 0.06) * (1 - look.night * 0.7));
      canvas.drawOval(Skia.XYWHRect(rand() * w - pr, py - pr * 0.12 * (0.4 + t), pr * 2, pr * 0.24 * (0.4 + t)), paint);
    }
    // Grass blades, smaller in the distance.
    const blade = Skia.Paint();
    blade.setAntiAlias(true);
    blade.setStyle(PaintStyle.Stroke);
    blade.setStrokeCap(StrokeCap.Round);
    const bladeColor = mix(mix(c.grassBlade, look.groundNear, 0.35), '#1B2B44', look.night * 0.45);
    const blades = Math.round((w * groundH) / 850);
    for (let i = 0; i < blades; i++) {
      const t = Math.pow(rand(), 0.8);
      const x = rand() * w;
      const y = hz + 4 + t * (groundH - 4);
      const k = 0.35 + 0.75 * t;
      const len = (5 + rand() * 7) * k;
      const lean = (rand() - 0.5) * 6 * k;
      blade.setStrokeWidth(Math.max(1, 2 * k));
      color(blade, bladeColor, 0.5);
      canvas.drawPath(Skia.PathBuilder.Make().moveTo(x, y).quadTo(x + lean * 0.3, y - len * 0.6, x + lean, y - len).build(), blade);
    }
    // Flowers planted across the field, back to front: the game's red, yellow, white and blue.
    const colors = [c.petalRed, c.petalYellow, c.petalWhite, c.petalBlue];
    const n = Math.round(((w * groundH) / 1700) * density);
    const flowers = Array.from({ length: n }, () => {
      const t = Math.pow(rand(), 0.9);
      return { x: rand() * w, y: hz + 6 + t * (groundH - 6), k: 0.45 + 0.75 * t, r: 5 + rand() * 7, col: colors[Math.floor(rand() * colors.length)], rot: rand() * Math.PI };
    });
    flowers.sort((a, b) => a.y - b.y);
    const nightTint = (hex: string) => mix(hex, '#2A3466', look.night * 0.4);
    const stem = Skia.Paint();
    stem.setAntiAlias(true);
    color(stem, nightTint(mix(c.grassBlade, '#16361A', 0.25)), 0.85);
    const leafPaint = Skia.Paint();
    leafPaint.setAntiAlias(true);
    color(leafPaint, nightTint(c.leaf), 0.9);
    const petal = Skia.Paint();
    petal.setAntiAlias(true);
    for (const f of flowers) {
      const r = f.r * f.k;
      const sl = r * (1.4 + (f.rot % 1) * 0.8);
      canvas.drawPath(stemPath(f.x - r * 0.1, f.y + sl, f.x + r * 0.25, f.y + sl * 0.5, f.x, f.y, Math.max(1.2, r * 0.34), Math.max(1, r * 0.22)), stem);
      if (f.rot > 1.2 && r > 3) canvas.drawPath(Skia.PathBuilder.Make().moveTo(f.x + r * 0.1, f.y + sl * 0.55).quadTo(f.x + r * 0.9, f.y + sl * 0.3, f.x + r * 1.1, f.y + sl * 0.65).quadTo(f.x + r * 0.6, f.y + sl * 0.75, f.x + r * 0.1, f.y + sl * 0.55).close().build(), leafPaint);
      color(petal, '#000000', 0.12);
      canvas.drawPath(flowerPath(f.x + 0.8 * f.k, f.y + 1.2 * f.k, r, 1, 5, f.rot), petal);
      color(petal, nightTint(f.col));
      canvas.drawPath(flowerPath(f.x, f.y, r, 1, 5, f.rot), petal);
      color(petal, nightTint(CENTRE_COLOR));
      canvas.drawCircle(f.x, f.y, r * CENTRE_R, petal);
    }
    // Haze where the ground meets the sky (and a thicker one in fog).
    if (hz > 0) {
      const haze = Math.min(groundH * (look.fog ? 0.45 : 0.08), look.fog ? 400 : 70);
      paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, hz), vec(0, hz + haze), [Skia.Color(look.horizon), Skia.Color(`${look.horizon}00`)], [0, 1], TileMode.Clamp));
      paint.setAlphaf(look.fog ? 0.85 : 0.45);
      canvas.drawRect(Skia.XYWHRect(0, hz, w, haze), paint);
      paint.setShader(null);
      paint.setAlphaf(1);
    }
    if (look.fog) {
      color(paint, '#E9EDF2', 0.22);
      canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
    }
    // Rain or snow over everything.
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
    // Night: fireflies over the grass.
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
  }, Skia.XYWHRect(0, 0, w, h));
}

/**
 * The backdrop: a sky (the real time of day and weather where you play) above a field of grass and
 * flowers. Drawn once into a picture, so scrolling over it is cheap; redrawn when the sky changes.
 * `horizon` is where the ground starts, in points from the top.
 */
export function Meadow({ height, horizon, density = 1, seed: fixedSeed, width }: { height: number; horizon: number; density?: number; seed?: number; width?: number }) {
  const { c } = useTheme();
  const look = useSkyLook();
  const appWidth = useAppWidth();
  const w = width ?? appWidth;
  // A fresh field every visit unless a seed pins it.
  const [randomSeed] = useState(() => 1 + Math.floor(Math.random() * 2147483000));
  const seed = fixedSeed ?? randomSeed;
  const picture = useMemo(() => drawScene(w, height, horizon, look, c, density, seed), [w, height, horizon, look, c, density, seed]);
  return (
    <View pointerEvents="none" style={{ width: w, height }}>
      <Canvas style={{ width: w, height }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
