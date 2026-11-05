import { Canvas, createPicture, Group, Image, PaintStyle, Picture, Skia, StrokeCap, TileMode, vec, type SkImage, type SkPicture } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { SkyLook } from '@/engine/sky';
import { useSkyLook } from '@/store/sky';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { bladeColorOf, color, drawBlade, drawHaze, drawSky, drawWeather, flowerPainter, type FieldFlower } from './Meadow';
import { rng } from './shapes';
import { cameraMatrix, tiltAt, type CameraFrame } from '../camera';

function drawCameraScene(f: CameraFrame, look: SkyLook, c: Palette, seed: number): SkPicture {
  return createPicture((canvas) => {
    const rand = rng(seed);
    const hz = f.cy;
    const depth = f.picH - hz;
    // The field the level camera shows on screen; things there are the size the flat field draws them.
    const rest = f.H - f.cy;
    drawSky(canvas, rand, hz, f.picW, f.pad, f.W, look);

    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, hz), vec(0, hz + rest), [Skia.Color(look.groundFar), Skia.Color(look.groundMid), Skia.Color(look.groundNear)], [0, 0.4, 1], TileMode.Clamp));
    canvas.drawRect(Skia.XYWHRect(0, hz, f.picW, depth), paint);
    paint.setShader(null);

    // Size grows with how far below the horizon a thing sits; so does the room between things,
    // though the far field is kept a little fuller than true perspective would leave it.
    const near = (y0: number) => y0 / rest;
    const many = (y0: number, perPoint: number, most: number) => Math.min(most, perPoint * Math.pow(rest / y0, 1.2));

    // Soft lighter patches, flatter toward the horizon.
    for (let i = 0; i < 14; i++) {
      const y0 = 8 + Math.pow(rand(), 1.3) * (depth - 8);
      const pr = f.W * (0.16 + rand() * 0.26) * near(y0);
      const ph = pr * 2 * Math.min(0.5, 0.06 + (y0 / f.F) * 0.45);
      color(paint, '#FFFFFF', (0.05 + rand() * 0.06) * (1 - look.night * 0.7));
      canvas.drawOval(Skia.XYWHRect(rand() * f.picW - pr, hz + y0 - ph / 2, pr * 2, ph), paint);
    }

    const blade = Skia.Paint();
    blade.setAntiAlias(true);
    blade.setStyle(PaintStyle.Stroke);
    blade.setStrokeCap(StrokeCap.Round);
    color(blade, bladeColorOf(c, look), 0.5);
    for (let y0 = 3; y0 < depth; y0 += 2) {
      const n = Math.floor(many(y0, 0.0011, 0.006) * f.picW * 2 + rand());
      const k = near(y0);
      for (let i = 0; i < n; i++) drawBlade(canvas, blade, rand() * f.picW, hz + y0 + rand() * 2, Math.max(1.2, (5 + rand() * 7) * k), (rand() - 0.5) * 6 * k, 2 * k);
    }

    const colors = [c.petalRed, c.petalYellow, c.petalWhite, c.petalBlue];
    const flowers: FieldFlower[] = [];
    for (let y0 = 3; y0 < depth; y0 += 2) {
      const n = Math.floor(many(y0, 0.0004, 0.003) * f.picW * 2 + rand());
      for (let i = 0; i < n; i++) {
        flowers.push({ x: rand() * f.picW, y: hz + y0 + rand() * 2, r: Math.max(1, 12 * near(y0)) * (0.7 + rand() * 0.6), col: colors[Math.floor(rand() * colors.length)], rot: rand() * Math.PI });
      }
    }
    flowers.sort((a, b) => a.y - b.y);
    const paintFlower = flowerPainter(c, look);
    for (const fl of flowers) paintFlower(canvas, fl);

    drawHaze(canvas, f.picW, hz, Math.min(rest * (look.fog ? 0.45 : 0.1), look.fog ? 400 : 60), look.fog ? 0.85 : 0.55, look);
    drawWeather(canvas, rand, f.picW, f.picH, hz, look, c);
  }, Skia.XYWHRect(0, 0, f.picW, f.picH));
}

/**
 * The scene as one image, so tilting it each frame is a single draw rather than a thousand flowers.
 * Sharp to two device pixels per point, within what a GPU texture (and a sensible amount of memory) holds.
 */
function snapshot(picture: SkPicture, f: CameraFrame): SkImage | null {
  // A computer window's scene is big: kept within a texture's sides and about 8 megapixels.
  const scale = Math.min(PixelRatio.get(), 2, 4096 / Math.max(f.picW, f.picH), Math.sqrt(8e6 / (f.picW * f.picH)));
  try {
    const w = Math.ceil(f.picW * scale);
    const h = Math.ceil(f.picH * scale);
    // On the web a plain raster surface: an offscreen GPU one would take up a browser graphics context.
    const surface = Platform.OS === 'web' ? Skia.Surface.Make(w, h) : Skia.Surface.MakeOffscreen(w, h);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.scale(scale, scale);
    canvas.drawPicture(picture);
    surface.flush();
    const image = surface.makeImageSnapshot().makeNonTextureImage();
    surface.dispose();
    return image;
  } catch {
    return null;
  }
}

/** Home's sky and field, through the camera; `tilt` is how far down it looks, 0 (level) to 1. */
export function CameraMeadow({ frame, tilt }: { frame: CameraFrame; tilt: SharedValue<number> }) {
  const { c } = useTheme();
  const look = useSkyLook();
  // A fresh field every visit.
  const [seed] = useState(() => 1 + Math.floor(Math.random() * 2147483000));
  const picture = useMemo(() => drawCameraScene(frame, look, c, seed), [frame, look, c, seed]);
  const image = useMemo(() => snapshot(picture, frame), [picture, frame]);
  const matrix = useDerivedValue(() => cameraMatrix(frame, tiltAt(frame, tilt.value)));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: frame.W, height: frame.H }}>
      <Canvas style={{ width: frame.W, height: frame.H }}>
        <Group matrix={matrix}>{image ? <Image image={image} x={0} y={0} width={frame.picW} height={frame.picH} fit="fill" /> : <Picture picture={picture} />}</Group>
      </Canvas>
    </View>
  );
}
