import { Canvas, createPicture, Group, Image, PaintStyle, Picture, Skia, StrokeCap, TileMode, vec, type SkImage, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { lookKey, type SkyLook } from '@/engine/sky';
import { useSkyLook } from '@/store/sky';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { bladeColorOf, cloud, cloudShade, cloudsOf, color, drawBlade, drawHaze, drawShadows, drawSky, drawSunDisc, drawSunlight, drawWeather, fieldLight, shineOf } from './Meadow';
import { fallOf, Precipitation } from './Precipitation';
import { fieldSprig, geometry, type Sprig } from './sprigLayout';
import { sprigPainter } from './sprigPainter';
import { rng } from './shapes';
import { useBloomFactor } from '../bloom';
import { cameraMatrix, tiltAt, type CameraFrame } from '../camera';

/**
 * The nearest flowers are drawn live, upright on screen and swaying; the rest go into the still
 * picture. At most this many, whatever the level, so it stays light to run.
 */
const LIVE_MIN_R = 7;
const LIVE_MAX = 56;

interface Scene {
  /** Sky, grass and the far flowers, still. */
  picture: SkPicture;
  /** The near flowers, each drawn on its own about its base, to sway. */
  live: Array<{ s: Sprig; picture: SkPicture }>;
  /** The clouds, each drawn on its own, to drift across the sky. */
  clouds: Drifter[];
}

interface Drifter {
  picture: SkPicture;
  x: number;
  y: number;
  s: number;
  /** Points a second: the bigger (nearer) ones a little faster, all of them faster in a storm. */
  speed: number;
}

/**
 * Flowers planted across the field, back to front: a head about 20 points across nearby, smaller
 * toward the horizon. Each keeps clear of the heads already planted (a few tries for a spot, else
 * that one isn't planted), so the field reads as flowers, not a heap.
 */
function plant(f: CameraFrame, rand: () => number, colors: string[], many: (y0: number, perPoint: number, most: number) => number, near: (y0: number) => number, bloom: number): Sprig[] {
  const hz = f.cy;
  const depth = f.picH - hz;
  const sprigs: Sprig[] = [];
  const heads: Array<{ x: number; y: number; r: number }> = [];
  const clear = (h: { x: number; y: number; r: number }) => heads.every((o) => Math.abs(o.y - h.y) >= o.r + h.r || Math.hypot(o.x - h.x, o.y - h.y) >= (o.r + h.r) * 1.1);
  for (let y0 = 3; y0 < depth; y0 += 2) {
    const n = Math.floor(many(y0, 0.00011 * bloom, 0.0009 * bloom) * f.picW * 2 + rand());
    for (let i = 0; i < n; i++) {
      const r = Math.max(1, 20 * near(y0)) * (0.75 + rand() * 0.5);
      const col = colors[Math.floor(rand() * colors.length)];
      for (let attempt = 0; attempt < 6; attempt++) {
        const sp = fieldSprig(rand() * f.picW, hz + y0 + rand() * 2, r, col, rand);
        const top = geometry(sp).top;
        const head = { x: sp.x + top.x, y: sp.y + top.y, r };
        // Specks far off may crowd; flowers you can make out may not.
        if (r >= 2.4 && !clear(head)) continue;
        sprigs.push(sp);
        heads.push(head);
        break;
      }
    }
  }
  return sprigs.sort((a, b) => a.y - b.y);
}

/** `bloom`: how full of flowers, for the player's level (useBloomFactor). */
function drawCameraScene(f: CameraFrame, look: SkyLook, c: Palette, seed: number, bloom: number): Scene {
  const colors = [c.petalRed, c.petalYellow, c.petalWhite, c.petalBlue];
  // Lit from the sun (or moon) where it shows in the sky above the screen.
  const sky = look.sun ?? look.moon;
  const lightX = sky ? f.pad + sky.x * f.W : f.picW / 2;
  const light = fieldLight(look, f.picW, lightX);
  const paintSprig = sprigPainter(c, look, light);
  let live: Scene['live'] = [];
  const picture = createPicture((canvas) => {
    const rand = rng(seed);
    const hz = f.cy;
    const depth = f.picH - hz;
    // The field the level camera shows on screen; things there are the size the flat field draws them.
    const rest = f.H - f.cy;
    // The clouds aren't in this picture: they drift live over it.
    drawSky(canvas, rand, hz, f.picW, f.pad, f.W, look, { clouds: false });

    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, hz), vec(0, hz + rest), [Skia.Color(look.groundFar), Skia.Color(look.groundMid), Skia.Color(look.groundNear)], [0, 0.4, 1], TileMode.Clamp));
    canvas.drawRect(Skia.XYWHRect(0, hz, f.picW, depth), paint);
    paint.setShader(null);
    drawSunlight(canvas, f.picW, hz, depth, lightX, look);

    // Size grows with how far below the horizon a thing sits; so does the room between things,
    // though the far field is kept a little fuller than true perspective would leave it.
    const near = (y0: number) => y0 / rest;
    const many = (y0: number, perPoint: number, most: number) => Math.min(most, perPoint * Math.pow(rest / y0, 1.2));

    // Soft lighter patches, flatter toward the horizon, catching the light on its side of the field.
    for (let i = 0; i < 14; i++) {
      const y0 = 8 + Math.pow(rand(), 1.3) * (depth - 8);
      const pr = f.W * (0.16 + rand() * 0.26) * near(y0);
      const ph = pr * 2 * Math.min(0.5, 0.06 + (y0 / f.F) * 0.45);
      const shine = shineOf(look, rand, f.picW, lightX);
      color(paint, shine.color, shine.alpha);
      canvas.drawOval(Skia.XYWHRect(shine.x - pr, hz + y0 - ph / 2, pr * 2, ph), paint);
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

    // Fewer flowers than grass, and the setup screens' big stemmed ones. The nearest ones (the last,
    // back to front) sway, so they're drawn live; everything behind them stays in this picture.
    const sprigs = plant(f, rand, colors, many, near, bloom);
    // Every flower's shadow lies on the ground, the swaying ones' too.
    drawShadows(canvas, light, sprigs);
    let cut = sprigs.length;
    while (cut > 0 && sprigs.length - cut < LIVE_MAX && sprigs[cut - 1].r >= LIVE_MIN_R) cut--;
    for (const sp of sprigs.slice(0, cut)) paintSprig(canvas, sp);
    live = sprigs.slice(cut).map((sp) => ({
      s: sp,
      picture: createPicture((cv) => paintSprig(cv, { ...sp, x: 0, y: 0 }), Skia.XYWHRect(-sp.r * 6 - sp.len, -sp.len - sp.r * 3, (sp.r * 6 + sp.len) * 2, sp.len + sp.r * 4)),
    }));

    drawHaze(canvas, f.picW, hz, Math.min(rest * (look.fog ? 0.45 : 0.1), look.fog ? 400 : 60), look.fog ? 0.85 : 0.55, look);
    // Rain and snow fall live over the top (Precipitation), not frozen into this picture.
    drawWeather(canvas, rand, f.picW, f.picH, hz, look, c, { falling: false });
    // The sun last, bright over everything that dims the scene.
    drawSunDisc(canvas, hz, f.pad, f.W, look);
  }, Skia.XYWHRect(0, 0, f.picW, f.picH));
  // The clouds, from their own sequence so the field stays as it was.
  const cloudRand = rng(seed ^ 0x2545f491);
  const shade = cloudShade(look);
  const wind = look.weather === 'storm' ? 2.2 : look.rain ? 1.5 : 1;
  const clouds = cloudsOf(look, cloudRand, f.cy, f.picW, f.W).map((k): Drifter => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    return {
      picture: createPicture((cv) => cloud(cv, 0, 0, k.s, look.cloudColor, shade, paint, cloudRand), Skia.XYWHRect(-k.s * 1.3, -k.s * 1.3, k.s * 2.6, k.s * 2)),
      x: k.x,
      y: k.y,
      s: k.s,
      speed: (2 + (k.s / f.W) * 32) * wind,
    };
  });
  return { picture, live, clouds };
}

/**
 * A near flower, standing upright where its base meets the ground on screen. The camera's tilt
 * squashes the ground top to bottom up close; the flower takes only the tilt's scale across there
 * (the same both ways), so it keeps its shape, and sways from its base on its own slow rhythm.
 */
function SwaySprig({ s, picture, clock, matrix }: { s: Sprig; picture: SkPicture; clock: SharedValue<number>; matrix: SharedValue<number[]> }) {
  const period = 4200 + s.phase * 2600;
  const transform = useDerivedValue(() => {
    const m = matrix.value;
    // The camera's matrix has no x in its bottom row (m[6]) or in y's (m[3]).
    const w = m[7] * s.y + m[8];
    return [
      { translateX: (m[0] * s.x + m[1] * s.y + m[2]) / w },
      { translateY: (m[4] * s.y + m[5]) / w },
      { scale: 1 / w },
      { rotate: Math.sin((clock.value / period + s.phase) * Math.PI * 2) * 0.05 },
    ];
  });
  return (
    <Group transform={transform}>
      <Picture picture={picture} />
    </Group>
  );
}

/**
 * A cloud drifting slowly across the sky, in the scene (so it tilts with the camera), coming round
 * again off the far side.
 */
function DriftCloud({ k, clock, span }: { k: Drifter; clock: SharedValue<number>; span: number }) {
  const lap = span + k.s * 2.6;
  const transform = useDerivedValue(() => {
    const at = (((k.x + k.s * 1.3 + (clock.value / 1000) * k.speed) % lap) + lap) % lap;
    return [{ translateX: at - k.s * 1.3 }, { translateY: k.y }];
  });
  return (
    <Group transform={transform}>
      <Picture picture={k.picture} />
    </Group>
  );
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

/**
 * Home's sky and field, through the camera; `tilt` is how far down it looks, 0 (level) to 1. The
 * near flowers sway while `animate` is on (the page in view), at about 30 frames a second, and not
 * at all with reduced motion.
 */
export function CameraMeadow({ frame, tilt, animate = true }: { frame: CameraFrame; tilt: SharedValue<number>; animate?: boolean }) {
  const { c, reduceMotion } = useTheme();
  const look = useSkyLook();
  const bloom = useBloomFactor();
  // A fresh field every visit.
  const [seed] = useState(() => 1 + Math.floor(Math.random() * 2147483000));
  // Drawn again only when the sky visibly changes (lookKey), not at every few minutes' tick.
  const sky = lookKey(look);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => drawCameraScene(frame, look, c, seed, bloom), [frame, sky, c, seed, bloom]);
  const image = useMemo(() => snapshot(scene.picture, frame), [scene, frame]);
  const matrix = useDerivedValue(() => cameraMatrix(frame, tiltAt(frame, tilt.value)));
  // The scene's own time: how long it has been moving, so it carries on from where it was. (The
  // phone's clock instead made every flower, cloud and raindrop jump the moment it started.)
  const clock = useSharedValue(0);
  const since = useSharedValue(0);
  const ticker = useFrameCallback((info) => {
    since.value += Math.min(100, info.timeSincePreviousFrame ?? 0);
    if (since.value >= 33) {
      clock.value += since.value;
      since.value = 0;
    }
  }, false);
  // Rain or snow falls over the scene, and the clouds drift (held still with reduced motion).
  const fall = fallOf(look);
  const moving = animate && !reduceMotion && (scene.live.length > 0 || !!fall || scene.clouds.length > 0);
  useEffect(() => {
    ticker.setActive(moving);
  }, [moving, ticker]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: frame.W, height: frame.viewH }}>
      <Canvas style={{ width: frame.W, height: frame.viewH }}>
        <Group matrix={matrix}>
          {image ? <Image image={image} x={0} y={0} width={frame.picW} height={frame.picH} fit="fill" /> : <Picture picture={scene.picture} />}
          {scene.clouds.map((k, i) => (
            <DriftCloud key={i} k={k} clock={clock} span={frame.picW} />
          ))}
        </Group>
        {scene.live.map(({ s, picture }, i) => (
          <SwaySprig key={i} s={s} picture={picture} clock={clock} matrix={matrix} />
        ))}
        {fall ? <Precipitation kind={fall} width={frame.W} height={frame.H} clock={clock} /> : null}
      </Canvas>
    </View>
  );
}
