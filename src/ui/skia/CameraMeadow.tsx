import { Canvas, createPicture, Group, Image, LinearGradient, Mask, PaintStyle, Picture, Rect, Skia, StrokeCap, TileMode, vec, type SkImage, type SkPicture, type SkRect } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LAPSE_STEP_MS } from '@/engine/skyClock';
import { lookKey, type SkyLook } from '@/engine/sky';
import { useSkyClock, useSkyLook } from '@/store/sky';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { bladeColorOf, CLOUD_BOUNDS, cloud, cloudShade, cloudsOf, color, drawBlade, drawHaze, drawShadows, drawSky, drawSunDisc, drawSunlight, drawWeather, fieldLight, hazeFade, shineOf } from './Meadow';
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
  /**
   * Its look on its `round`th time across: a cloud of its own each time round, so no cloud is ever
   * seen twice. A picture, and the same drawn once into an image (soft-edged clouds cost too much
   * to draw afresh each frame). Made when first needed and kept.
   */
  design: (round: number) => { picture: SkPicture; image: SkImage | null };
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
  let live: Scene['live'] = [];
  // The live (near, swaying) flowers are drawn without haze: it's all behind them.
  const paintNear = sprigPainter(c, look, light);
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

    // The air toward the horizon, over the grass and under the flowers: they fade into it a little
    // instead (a band lying over them looked like a line drawn across them).
    const hazeDepth = Math.min(rest * (look.fog ? 0.45 : 0.22), look.fog ? 400 : 110);
    const hazeAlpha = look.fog ? 0.9 : 1;
    drawHaze(canvas, f.picW, hz, hazeDepth, hazeAlpha, look, f.pad + look.glow.x * f.W);
    const paintSprig = sprigPainter(c, look, light, hazeFade(hz, hazeDepth, hazeAlpha));

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
      picture: createPicture((cv) => paintNear(cv, { ...sp, x: 0, y: 0 }), Skia.XYWHRect(-sp.r * 6 - sp.len, -sp.len - sp.r * 3, (sp.r * 6 + sp.len) * 2, sp.len + sp.r * 4)),
    }));

    // Rain and snow fall live over the top (Precipitation), not frozen into this picture.
    drawWeather(canvas, rand, f.picW, f.picH, hz, look, c, { falling: false });
    // The sun last, bright over everything that dims the scene.
    drawSunDisc(canvas, hz, f.pad, f.W, look);
  }, Skia.XYWHRect(0, 0, f.picW, f.picH));
  // The clouds, from their own sequence so the field stays as it was.
  const cloudRand = rng(seed ^ 0x2545f491);
  const shade = cloudShade(look);
  // The clouds lit from the sun's side (from above when it's down or hidden).
  const lean = look.sun && look.veil < 0.5 ? Math.max(-1, Math.min(1, (look.sun.x - 0.5) * 2.2)) : 0;
  const wind = look.weather === 'storm' ? 2.2 : look.rain ? 1.5 : 1;
  const clouds = cloudsOf(look, cloudRand, f.cy, f.picW, f.W).map((k, index): Drifter => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const bounds = Skia.XYWHRect(CLOUD_BOUNDS.left * k.s, CLOUD_BOUNDS.top * k.s, CLOUD_BOUNDS.width * k.s, CLOUD_BOUNDS.height * k.s);
    const made = new Map<number, { picture: SkPicture; image: SkImage | null }>();
    // Each cloud, each time round, from its own numbers: the same one on both canvases and after a
    // redraw of the sky (in the sky's new colours), a different one from every other.
    const design = (round: number) => {
      const got = made.get(round);
      if (got) return got;
      const own = rng(Math.abs((seed ^ 0x9e3779b9) + index * 7919 + round * 104729) + 1);
      const picture = createPicture((cv) => cloud(cv, 0, 0, k.s, look.cloudColor, shade, paint, own, lean), bounds);
      const out = { picture, image: pictureImage(picture, bounds) };
      made.set(round, out);
      return out;
    };
    return {
      design,
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
  const reach = -CLOUD_BOUNDS.left * k.s;
  const lap = span + CLOUD_BOUNDS.width * k.s;
  const roundAt = (t: number) => {
    'worklet';
    return Math.floor((k.x + reach + (t / 1000) * k.speed) / lap);
  };
  const transform = useDerivedValue(() => {
    const at = (((k.x + reach + (clock.value / 1000) * k.speed) % lap) + lap) % lap;
    return [{ translateX: at - reach }, { translateY: k.y }];
  });
  // Off past the far side it comes round again as another cloud (the change is out of sight).
  const [round, setRound] = useState(() => roundAt(clock.get()));
  useAnimatedReaction(
    () => roundAt(clock.value),
    (now, before) => {
      if (before != null && now !== before) scheduleOnRN(setRound, now);
    },
  );
  const { picture, image } = k.design(round);
  return (
    <Group transform={transform}>
      {image ? <Image image={image} x={CLOUD_BOUNDS.left * k.s} y={CLOUD_BOUNDS.top * k.s} width={CLOUD_BOUNDS.width * k.s} height={CLOUD_BOUNDS.height * k.s} fit="fill" /> : <Picture picture={picture} />}
    </Group>
  );
}

/** A small picture as an image (a cloud), sharp to two device pixels per point. */
function pictureImage(picture: SkPicture, r: SkRect): SkImage | null {
  const scale = Math.min(PixelRatio.get(), 2);
  try {
    const surface = Platform.OS === 'web' ? Skia.Surface.Make(Math.ceil(r.width * scale), Math.ceil(r.height * scale)) : Skia.Surface.MakeOffscreen(Math.ceil(r.width * scale), Math.ceil(r.height * scale));
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.scale(scale, scale);
    canvas.translate(-r.x, -r.y);
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
 * The scene as one image, so tilting it each frame is a single draw rather than a thousand flowers.
 * Sharp to two device pixels per point, within what a GPU texture (and a sensible amount of memory)
 * holds; or to `most` pixels per point (the frames of the sky's run-through, made quickly one after
 * another and each on screen for a moment).
 */
function snapshot(picture: SkPicture, f: CameraFrame, most = 2): SkImage | null {
  // A computer window's scene is big: kept within a texture's sides and about 8 megapixels.
  const scale = Math.min(PixelRatio.get(), most, 4096 / Math.max(f.picW, f.picH), Math.sqrt(8e6 / (f.picW * f.picH)));
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

/** Steps along the top fade's eased curve: enough that it reads as smooth, not banded. */
const FADE_STEPS = 8;

/** The top fade's mask: solid for `solid` points, then easing off (gently at both ends) to nothing at `height`. */
function fadeStops(height: number, solid: number) {
  const s = Math.min(0.9, solid / height);
  const colors = ['#000000FF'];
  const positions = [0];
  for (let k = 0; k <= FADE_STEPS; k++) {
    const t = k / FADE_STEPS;
    const a = Math.round((1 - t * t * (3 - 2 * t)) * 255);
    colors.push(`#000000${a.toString(16).padStart(2, '0')}`);
    positions.push(s + (1 - s) * t);
  }
  return { colors, positions };
}

/**
 * Home's sky and field, through the camera; `tilt` is how far down it looks, 0 (level) to 1. The
 * near flowers sway while `animate` is on (the page in view), at about 30 frames a second, and not
 * at all with reduced motion. `children` (the page) go over it; with `topFade`, the scene is drawn
 * once more over the page along the top, fading out downward, so cards scrolling up go behind the
 * sky itself (its colours, the sun's light, the clouds drifting by) rather than under a flat band.
 * It shows as much as `topFade.shown` (0..1).
 */
export function CameraMeadow({ frame, tilt, animate = true, children, topFade }: { frame: CameraFrame; tilt: SharedValue<number>; animate?: boolean; children?: ReactNode; topFade?: { height: number; solid: number; shown: SharedValue<number> } }) {
  const { c, reduceMotion } = useTheme();
  const look = useSkyLook();
  const bloom = useBloomFactor();
  // A fresh field every visit.
  const [seed] = useState(() => 1 + Math.floor(Math.random() * 2147483000));
  // Drawn again only when the sky visibly changes (lookKey), not at every few minutes' tick.
  const sky = lookKey(look);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => drawCameraScene(frame, look, c, seed, bloom), [frame, sky, c, seed, bloom]);
  // Running through the time away, each frame is made at a point a pixel: four times quicker, and it
  // sharpens again at the end.
  const lapsing = useSkyClock((s) => s.lapsing);
  const image = useMemo(() => snapshot(scene.picture, frame, lapsing ? 1 : 2), [scene, frame, lapsing]);
  // When the sky is drawn again (the clock moving on, or running through the time away), the new
  // scene fades in over the one before instead of replacing it at once, so the sky changes smoothly.
  const [layers, setLayers] = useState<{ cur: SkImage | null; prev: SkImage | null }>({ cur: image, prev: null });
  if (layers.cur !== image) setLayers({ cur: image, prev: reduceMotion ? null : layers.cur });
  const blend = useSharedValue(1);
  useEffect(() => {
    if (!layers.prev) {
      blend.set(1);
      return;
    }
    const done = () => setLayers((l) => (l.cur === layers.cur ? { cur: l.cur, prev: null } : l));
    blend.set(0);
    blend.set(
      withTiming(1, { duration: LAPSE_STEP_MS * 1.2, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(done);
      }),
    );
  }, [layers, blend]);
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
  const scenery = (
    <Group matrix={matrix}>
      {layers.prev ? <Image image={layers.prev} x={0} y={0} width={frame.picW} height={frame.picH} fit="fill" /> : null}
      {image ? (
        <Group opacity={blend}>
          <Image image={image} x={0} y={0} width={frame.picW} height={frame.picH} fit="fill" />
        </Group>
      ) : (
        <Picture picture={scene.picture} />
      )}
      {scene.clouds.map((k, i) => (
        <DriftCloud key={i} k={k} clock={clock} span={frame.picW} />
      ))}
    </Group>
  );
  const fadeH = (topFade?.height ?? 0) + 1;
  const fadeSolid = topFade?.solid ?? 0;
  const stops = useMemo(() => fadeStops(fadeH, fadeSolid), [fadeH, fadeSolid]);
  const fadeShown = topFade?.shown;
  const shown = useAnimatedStyle(() => ({ opacity: fadeShown ? fadeShown.value : 0 }));
  return (
    <>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: frame.W, height: frame.viewH }}>
        <Canvas style={{ width: frame.W, height: frame.viewH }}>
          {scenery}
          {scene.live.map(({ s, picture }, i) => (
            <SwaySprig key={i} s={s} picture={picture} clock={clock} matrix={matrix} />
          ))}
          {fall ? <Precipitation kind={fall} level={look.fall} width={frame.W} height={frame.H} clock={clock} /> : null}
        </Canvas>
      </View>
      {children}
      {topFade ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, width: frame.W, height: fadeH }, shown]}>
          <Canvas style={{ width: frame.W, height: fadeH }}>
            <Mask
              mode="alpha"
              mask={
                <Rect x={0} y={0} width={frame.W} height={fadeH}>
                  <LinearGradient start={vec(0, 0)} end={vec(0, fadeH)} colors={stops.colors} positions={stops.positions} />
                </Rect>
              }
            >
              {scenery}
              {fall ? <Precipitation kind={fall} level={look.fall} width={frame.W} height={frame.H} clock={clock} /> : null}
            </Mask>
          </Canvas>
        </Animated.View>
      ) : null}
    </>
  );
}
