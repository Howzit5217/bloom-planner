import { BlendMode, Canvas, createPicture, PaintStyle, Picture, Skia, StrokeCap, TileMode, vec } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { CENTRE_COLOR, CENTRE_R, flowerPath, mixHex, rng, stemPath } from './shapes';
import { useAppWidth } from '@/ui/layout';

function drawMeadow(w: number, h: number, c: Palette, density: number, seed: number, sky: boolean) {
  return createPicture((canvas) => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    // Ground gradient.
    paint.setShader(
      Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, h), [Skia.Color(sky ? c.meadowTop : c.meadowMid), Skia.Color(c.meadowMid), Skia.Color(c.meadowBottom)], [0, 0.45, 1], TileMode.Clamp),
    );
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
    paint.setShader(null);
    const rand = rng(seed);
    // Soft rolling humps for depth.
    for (let i = 0; i < 5; i++) {
      const hx = rand() * w;
      const hy = h * (0.25 + rand() * 0.7);
      const hr = w * (0.25 + rand() * 0.3);
      paint.setColor(Skia.Color(c.dark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.12)'));
      canvas.drawOval(Skia.XYWHRect(hx - hr, hy - hr * 0.35, hr * 2, hr * 0.7), paint);
    }
    // Grass blades.
    const blade = Skia.Paint();
    blade.setAntiAlias(true);
    blade.setStyle(PaintStyle.Stroke);
    blade.setStrokeCap(StrokeCap.Round);
    blade.setStrokeWidth(2);
    blade.setColor(Skia.Color(c.grassBlade));
    blade.setAlphaf(c.dark ? 0.5 : 0.45);
    const blades = Math.round((w * h) / 900);
    for (let i = 0; i < blades; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const len = 5 + rand() * 7;
      const lean = (rand() - 0.5) * 6;
      const p = Skia.PathBuilder.Make().moveTo(x, y).quadTo(x + lean * 0.3, y - len * 0.6, x + lean, y - len).build();
      canvas.drawPath(p, blade);
    }
    // Flowers, back to front so lower ones overlap. Pikmin Bloom's red, yellow, white and blue.
    const colors = [c.petalRed, c.petalYellow, c.petalWhite, c.petalBlue];
    const n = Math.round(((w * h) / 2400) * density);
    const flowers = Array.from({ length: n }, () => ({ x: rand() * w, y: rand() * h, r: 4 + rand() * 7, col: colors[Math.floor(rand() * colors.length)], rot: rand() * Math.PI }));
    flowers.sort((a, b) => a.y - b.y);
    const petal = Skia.Paint();
    petal.setAntiAlias(true);
    const stem = Skia.Paint();
    stem.setAntiAlias(true);
    stem.setColor(Skia.Color(mixHex(c.grassBlade, '#16361A', 0.25)));
    stem.setAlphaf(c.dark ? 0.7 : 0.85);
    const leafPaint = Skia.Paint();
    leafPaint.setAntiAlias(true);
    leafPaint.setColor(Skia.Color(c.leaf));
    leafPaint.setAlphaf(c.dark ? 0.6 : 0.9);
    const shade = Skia.Paint();
    shade.setAntiAlias(true);
    shade.setColor(Skia.Color('rgba(0,0,0,0.12)'));
    // Each one is a small copy of the welcome flower: darker back petals, front petals, golden centre.
    for (const f of flowers) {
      const scale = 0.7 + (f.y / h) * 0.5;
      const r = f.r * scale;
      const a = c.dark ? 0.55 : 1;
      // A short stem, with a leaf on some, so the field has a little depth.
      const sl = r * (1.4 + (f.rot % 1) * 0.8);
      canvas.drawPath(stemPath(f.x - r * 0.1, f.y + sl, f.x + r * 0.25, f.y + sl * 0.5, f.x, f.y, Math.max(1.6, r * 0.34), Math.max(1.2, r * 0.22)), stem);
      if (f.rot > 1.2) canvas.drawPath(Skia.PathBuilder.Make().moveTo(f.x + r * 0.1, f.y + sl * 0.55).quadTo(f.x + r * 0.9, f.y + sl * 0.3, f.x + r * 1.1, f.y + sl * 0.65).quadTo(f.x + r * 0.6, f.y + sl * 0.75, f.x + r * 0.1, f.y + sl * 0.55).close().build(), leafPaint);
      // Flat flowers, like the game's: round petals, a golden centre, a crisp soft shadow.
      canvas.drawPath(flowerPath(f.x + 0.8, f.y + 1.2, r, 1, 5, f.rot), shade);
      petal.setColor(Skia.Color(f.col));
      petal.setAlphaf(a);
      canvas.drawPath(flowerPath(f.x, f.y, r, 1, 5, f.rot), petal);
      petal.setColor(Skia.Color(CENTRE_COLOR));
      petal.setAlphaf(a);
      canvas.drawCircle(f.x, f.y, r * CENTRE_R, petal);
    }
    // Night: a few fireflies.
    if (c.dark) {
      const glow = Skia.Paint();
      glow.setAntiAlias(true);
      glow.setBlendMode(BlendMode.Screen);
      glow.setMaskFilter(Skia.MaskFilter.MakeBlur(0, 4, true));
      for (let i = 0; i < Math.round(w / 40); i++) {
        glow.setColor(Skia.Color('rgba(246,214,110,0.55)'));
        canvas.drawCircle(rand() * w, rand() * h * 0.8, 2 + rand() * 2, glow);
      }
    }
  }, Skia.XYWHRect(0, 0, w, h));
}

/** A static meadow drawn once into a picture (cheap to scroll over). */
export function Meadow({ height, density = 1, seed: fixedSeed, sky = true, width }: { height: number; density?: number; seed?: number; sky?: boolean; width?: number }) {
  const { c } = useTheme();
  const appWidth = useAppWidth();
  const w = width ?? appWidth;
  // A fresh field every visit unless a seed pins it.
  const [randomSeed] = useState(() => 1 + Math.floor(Math.random() * 2147483000));
  const seed = fixedSeed ?? randomSeed;
  const picture = useMemo(() => drawMeadow(w, height, c, density, seed, sky), [w, height, c, density, seed, sky]);
  return (
    <View pointerEvents="none" style={{ width: w, height }}>
      <Canvas style={{ width: w, height }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
