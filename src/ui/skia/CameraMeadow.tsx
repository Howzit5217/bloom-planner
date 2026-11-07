import { BlendMode, BlurStyle, Canvas, ClipOp, createPicture, FilterMode, Group, LinearGradient, MipmapMode, PaintStyle, Picture, Rect, Skia, StrokeCap, StrokeJoin, TileMode, vec, type SkCanvas, type SkImage, type SkPath, type SkPicture, type SkRect, type SkRSXform, type SkSurface } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LAPSE_STEP_MS } from '@/engine/skyClock';
import { lookKey, mix, multiply, type SkyLook } from '@/engine/sky';
import { useSkyClock, useSkyLook } from '@/store/sky';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { bladeColorOf, CLOUD_BOUNDS, cloud, cloudsOf, color, drawBlade, drawHaze, drawMistBank, drawShadows, drawSky, drawSunDisc, drawSunlight, drawWeather, fieldLight, hazeFade, mistBanks, shineOf, type MistBank } from './Meadow';
import { cloudLight } from './clouds';
import { fallOf, useFalling, type Fall } from './Precipitation';
import { fieldSprig, geometry, headOf, type Sprig } from './sprigLayout';
import { sprigPainter } from './sprigPainter';
import { leafPath, rng } from './shapes';
import { useBloomFactor } from '../bloom';
import { cameraMatrix, tiltAt, type CameraFrame } from '../camera';

/**
 * The nearest flowers are drawn live, upright on screen and swaying; the rest go into the still
 * picture. At most this many, whatever the level, so it stays light to run.
 */
const LIVE_MIN_R = 7;
const LIVE_MAX = 56;

/**
 * The scene's canvases draw at most two device pixels a point, scaled up to the screen: the still
 * picture and the clouds are no sharper than that anyway, and on a three-a-point phone screen it is
 * well under half the pixels to fill on every frame of a scroll.
 */
const UPSCALE = Math.max(1, PixelRatio.get() / 2);
const CANVAS_DENSITY = PixelRatio.get() / UPSCALE;

interface Scene {
  /** Just the sky's and the field's colours, while the scene itself is being drawn (the web). */
  placeholder?: true;
  /** Sky, grass and the far flowers, still. */
  picture: SkPicture;
  /** The near flowers, to sway: drawn once, side by side, into one image. */
  near: Near | null;
  /** The near flowers drawn in place and still, if they couldn't be drawn into an image. */
  nearStill: SkPicture | null;
  /** The clouds, each drawn on its own, to drift across the sky. */
  clouds: Drifter[];
  /** Banks of mist or fog, each the picture's width (and wrapping round), to drift over the field. */
  mists: Mist[];
  /** A storm's lightning bolts, one of them at each strike. */
  bolts: SkPath[];
  /** What floats over the field, if anything (petals, leaves, fireflies). */
  motes: Motes | null;
}

/** Petals on the breeze in spring and summer, leaves in autumn, fireflies on a summer night. */
type MoteKind = 'petal' | 'leaf' | 'firefly';

/**
 * The motes over the field, each somewhere above a spot on the ground: the camera places them as it
 * does the field, so as it tilts the near ones sweep past and the far ones barely move. One image of
 * a few shapes, drawn in one go a frame.
 */
interface Motes {
  kind: MoteKind;
  atlas: SkImage;
  /** Each mote's shape and colour in the image. */
  sprites: SkRect[];
  /** Seven numbers a mote: across, the ground row it's over (scene points), how high above it, how big, its phase, its pace, and how near it is (1 at the screen's foot). */
  data: number[];
  xforms: SkRSXform[];
  /** Points a second they drift with the wind, up close (0 for fireflies, which wander). */
  drift: number;
}

/** A mote's shape, drawn this many points across at this many pixels a point. */
const MOTE_SIZE = 12;
const MOTE_PX = 3;

interface Mist {
  b: MistBank;
  picture: SkPicture;
  image: SkImage | null;
  /** The whole image, and where it goes (about the bank's middle, before it drifts). */
  src: SkRect | null;
  dst: SkRect;
}

/**
 * The near flowers in one image (an atlas), so a frame is one draw of it that places, tilts and
 * sways every flower: drawing them as pictures took hundreds of shapes a frame, all at new angles.
 */
interface Near {
  atlas: SkImage;
  /** Each flower's spot in the image, in pixels. */
  sprites: SkRect[];
  /** Five numbers a flower: its base on the ground (scene points), its sway's phase, and its base in its spot (pixels). */
  spots: number[];
  /** Where each flower goes this frame: set afresh each frame on the UI thread (drawing copies them). */
  xforms: SkRSXform[];
  /** Image pixels a point. */
  scale: number;
}

interface Drifter {
  /**
   * Its look on its `round`th time across: a cloud of its own each time round, so no cloud is ever
   * seen twice. A picture, and the same drawn once into an image (a cloud costs too much to draw
   * afresh each frame). Made when first needed; only the one showing and the next are kept.
   */
  design: (round: number) => { picture: SkPicture; image: SkImage | null };
  x: number;
  y: number;
  s: number;
  /** Points a second: the bigger (nearer) ones a little faster, all of them faster in a storm. */
  speed: number;
  /** How far it reaches left of its middle, and how far it goes before it's back where it started. */
  reach: number;
  lap: number;
  /** Where its image goes, about its middle. */
  rect: SkRect;
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
  let live: Sprig[] = [];
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
    live = sprigs.slice(cut);

    // Rain and snow fall live over the top (Precipitation), and the fog drifts: not frozen into this picture.
    drawWeather(canvas, rand, f.picW, f.picH, hz, look, c, { falling: false, banks: false, fireflies: false });
    // The sun last, bright over everything that dims the scene.
    drawSunDisc(canvas, hz, f.pad, f.W, look);
  }, Skia.XYWHRect(0, 0, f.picW, f.picH));
  // The near flowers' image, as sharp as the nearest of them is drawn on screen, the camera tilted or not.
  const tilts = [0, 0.5, 1].map((p) => cameraMatrix(f, tiltAt(f, p)));
  const nearest = live.reduce((most, sp) => Math.max(most, ...tilts.map((m) => 1 / Math.max(0.2, m[7] * sp.y + m[8]))), 1);
  const near = nearAtlas(live, paintNear, Math.min(3, CANVAS_DENSITY * nearest));
  const nearStill = near || !live.length ? null : createPicture((cv) => live.forEach((sp) => paintNear(cv, sp)), Skia.XYWHRect(0, 0, f.picW, f.picH));
  // The clouds, from their own sequence so the field stays as it was.
  const cloudRand = rng(seed ^ 0x2545f491);
  const cloudLit = cloudLight(look);
  // Faster in a storm or rain, and the windier it is.
  const wind = (look.weather === 'storm' ? 1.6 : look.rain ? 1.2 : 1) * (1 + Math.min(2.5, look.wind / 18));
  const clouds = cloudsOf(look, cloudRand, f.cy, f.picW, f.W).map((k, index): Drifter => {
    const bounds = Skia.XYWHRect(CLOUD_BOUNDS.left * k.s, CLOUD_BOUNDS.top * k.s, CLOUD_BOUNDS.width * k.s, CLOUD_BOUNDS.height * k.s);
    const scale = imageScale(bounds);
    const made = new Map<number, { picture: SkPicture; image: SkImage | null }>();
    // Each cloud, each time round, from its own numbers: the same one on both canvases and after a
    // redraw of the sky (in the sky's new colours), a different one from every other.
    const design = (round: number) => {
      const got = made.get(round);
      if (got) return got;
      const own = rng(Math.abs((seed ^ 0x9e3779b9) + index * 7919 + round * 104729) + 1);
      const picture = createPicture((cv) => cloud(cv, 0, 0, k.s, own, cloudLit), bounds);
      const out = { picture, image: pictureImage(picture, bounds, scale) };
      made.set(round, out);
      for (const r of made.keys()) if (r < round - 1 || r > round + 1) made.delete(r);
      return out;
    };
    return {
      design,
      x: k.x,
      y: k.y,
      s: k.s,
      // The bigger (nearer) ones a little faster.
      speed: (2 + Math.min(0.25, k.s / f.W) * 32) * wind,
      reach: -CLOUD_BOUNDS.left * k.s,
      lap: f.picW + CLOUD_BOUNDS.width * k.s,
      rect: bounds,
    };
  });
  const mists = mistBanks(look, rng(seed ^ 0x51ed2705), f.cy, f.picH).map((b) => {
    const r = Skia.XYWHRect(0, -b.h, f.picW, b.h * 2);
    const pic = createPicture((cv) => drawMistBank(cv, f.picW, b, look), r);
    // Soft as it is, a point a pixel is plenty.
    const image = pictureImage(pic, r, 1);
    return { b, picture: pic, image, src: image ? Skia.XYWHRect(0, 0, image.width(), image.height()) : null, dst: r };
  });
  const bolts = look.lightning ? [0, 1, 2, 3, 4].map((i) => bolt(rng(seed + i * 977), f)) : [];
  const motes = makeMotes(look, c, f, rng(seed ^ 0x6d2b79f5));
  return { picture, near, nearStill, clouds, mists, bolts, motes };
}

/** What floats over the field in this weather and season: nothing in rain, snow, fog or a storm, or in winter. */
function moteKind(look: SkyLook): MoteKind | null {
  if (look.rain || look.snow || look.weather === 'storm' || look.mist > 0.4) return null;
  if (look.night > 0.6) return look.turn < 0.35 ? 'firefly' : null;
  if (look.night > 0.25) return null;
  return look.turn < 0.35 ? 'petal' : look.turn < 0.8 ? 'leaf' : null;
}

/** The motes: a few shapes in an image, and where each mote floats (see Motes). */
function makeMotes(look: SkyLook, c: Palette, f: CameraFrame, rand: () => number): Motes | null {
  const kind = moteKind(look);
  if (!kind) return null;
  // Lit as the field's flowers are: by a low sun, warmer.
  const lit = (hex: string) => mix(multiply(hex, look.light), hex, 0.45);
  const colors = kind === 'petal' ? [c.petalRed, c.petalYellow, c.petalWhite, c.petalBlue].map(lit) : kind === 'leaf' ? ['#D9822B', '#C4572E', '#E0B040', '#A8743A'].map(lit) : ['#F6D66E'];
  const cell = MOTE_SIZE * MOTE_PX;
  let atlas: SkImage | null = null;
  try {
    const w = cell * colors.length;
    const surface = Platform.OS === 'web' ? Skia.Surface.Make(w, cell) : Skia.Surface.MakeOffscreen(w, cell);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    colors.forEach((col, i) => {
      canvas.save();
      canvas.translate(i * cell + cell / 2, cell / 2);
      canvas.scale(MOTE_PX, MOTE_PX);
      if (kind === 'firefly') {
        // A warm point of light in a soft glow.
        paint.setShader(Skia.Shader.MakeRadialGradient(vec(0, 0), MOTE_SIZE / 2, [Skia.Color('#FFFBD8'), Skia.Color('#F6D66EB0'), Skia.Color('#F6D66E30'), Skia.Color('#F6D66E00')], [0, 0.14, 0.42, 1], TileMode.Clamp));
        canvas.drawCircle(0, 0, MOTE_SIZE / 2, paint);
        paint.setShader(null);
      } else if (kind === 'petal') {
        // A petal: rounder at its tip, a touch deeper at its base.
        paint.setColor(Skia.Color(col));
        canvas.drawOval(Skia.XYWHRect(-4, -2.5, 8, 5), paint);
        paint.setColor(Skia.Color(mix(col, '#6A5038', 0.22)));
        paint.setAlphaf(0.55);
        canvas.drawOval(Skia.XYWHRect(-4, -1.4, 3.4, 2.8), paint);
        paint.setAlphaf(1);
      } else {
        paint.setColor(Skia.Color(col));
        canvas.translate(-4.5, 0);
        canvas.drawPath(leafPath(9, 3.2), paint);
      }
      canvas.restore();
    });
    surface.flush();
    atlas = surface.makeImageSnapshot().makeNonTextureImage();
    surface.dispose();
  } catch {
    return null;
  }
  if (!atlas) return null;
  const fly = kind === 'firefly';
  const n = Math.round((fly ? 30 : kind === 'leaf' ? 22 : 30) * Math.max(0.7, f.picW / 520));
  const rest = f.H - f.cy;
  const depth = f.picH - f.cy;
  const data: number[] = [];
  const sprites: SkRect[] = [];
  for (let i = 0; i < n; i++) {
    // Over the whole field, more of them nearer (where there's more of the field on screen).
    const row = f.cy + (0.05 + Math.pow(rand(), 0.75) * 0.95) * depth;
    const near = (row - f.cy) / rest;
    const up = (fly ? 5 + rand() * 38 : 16 + rand() * 80) * near;
    const size = (fly ? 0.75 + rand() * 0.6 : 0.85 + rand() * 0.5) * near;
    data.push(rand() * f.picW, row, up, size, rand(), 0.6 + rand() * 0.8, near);
    sprites.push(Skia.XYWHRect((i % colors.length) * cell, 0, cell, cell));
  }
  return { kind, atlas, sprites, data, xforms: sprites.map(() => Skia.RSXform(1, 0, 0, 0)), drift: fly ? 0 : 5 + Math.min(40, look.wind) * 0.55 };
}

/**
 * How far the camera has pulled focus onto the flowers, 0 to 1, from how far it has tilted down (0
 * level, 1 all the way): the far field softening, and the camera easing in a little closer.
 */
function focusAt(tilt: number) {
  'worklet';
  const k = Math.min(1, Math.max(0, (tilt - 0.12) / 0.73));
  return k * k * (3 - 2 * k);
}

/**
 * The scene softly out of focus far off (the sky, the horizon and the far field) and sharp up close,
 * at half a pixel a point: drawn over the scene as the camera looks down, so the far field melts away
 * and the flowers up close stand out, as through a camera focused on them.
 */
function softImage(image: SkImage, f: CameraFrame): SkImage | null {
  const scale = 0.5;
  const w = Math.ceil(f.picW * scale);
  const h = Math.ceil(f.picH * scale);
  try {
    const surface = Platform.OS === 'web' ? Skia.Surface.Make(w, h) : Skia.Surface.MakeOffscreen(w, h);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    const blur = Skia.Paint();
    blur.setImageFilter(Skia.ImageFilter.MakeBlur(3.5, 3.5, TileMode.Clamp, null));
    canvas.drawImageRectOptions(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, w, h), FilterMode.Linear, MipmapMode.None, blur);
    // Kept far off only: none of it from half way down the field on.
    const keep = Skia.Paint();
    keep.setBlendMode(BlendMode.DstIn);
    const hz = f.cy * scale;
    const half = (f.cy + (f.picH - f.cy) * 0.55) * scale;
    keep.setShader(Skia.Shader.MakeLinearGradient(vec(0, hz), vec(0, half), [Skia.Color('#000000FF'), Skia.Color('#00000000')], [0, 1], TileMode.Clamp));
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), keep);
    surface.flush();
    const out = surface.makeImageSnapshot().makeNonTextureImage();
    surface.dispose();
    return out;
  } catch {
    return null;
  }
}

/**
 * The near flowers drawn once into one image, each in its own spot (`scale` pixels a point), packed
 * in rows tallest first. Each is lit where it stands; its sway and the camera's tilt come later, as
 * it's drawn. Null if it can't be made (the flowers are then drawn still, in place).
 */
function nearAtlas(sprigs: Sprig[], paint: (cv: SkCanvas, s: Sprig) => void, scale: number): Near | null {
  if (!sprigs.length) return null;
  const ROW = 2048;
  const GAP = 2;
  // Each flower's box about its base: the head at the top of the stem, the leaves out to the sides.
  const boxes = sprigs.map((s) => {
    const g = geometry(s);
    const head = headOf(s) * 1.25 + 1;
    const side = Math.max(head, s.r * 2.4) + 1;
    const x0 = Math.min(0, g.ctrl.x, g.top.x) - side;
    const x1 = Math.max(0, g.ctrl.x, g.top.x) + side;
    const y0 = Math.min(g.ctrl.y, g.top.y) - head;
    const y1 = s.r * 0.6 + 1;
    return { x0, y0, w: Math.ceil((x1 - x0) * scale), h: Math.ceil((y1 - y0) * scale) };
  });
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[b].h - boxes[a].h);
  const at: Array<{ x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let row = 0;
  let width = 0;
  for (const i of order) {
    const b = boxes[i];
    if (x > 0 && x + b.w > ROW) {
      x = 0;
      y += row + GAP;
      row = 0;
    }
    at[i] = { x, y };
    x += b.w + GAP;
    width = Math.max(width, x);
    row = Math.max(row, b.h);
  }
  const height = y + row;
  if (width > 4096 || height > 4096) return null;
  try {
    const surface = Platform.OS === 'web' ? Skia.Surface.Make(width, height) : Skia.Surface.MakeOffscreen(width, height);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    const sprites = sprigs.map((s, i) => {
      const b = boxes[i];
      const spot = Skia.XYWHRect(at[i].x, at[i].y, b.w, b.h);
      canvas.save();
      canvas.clipRect(spot, ClipOp.Intersect, true);
      canvas.translate(at[i].x - b.x0 * scale, at[i].y - b.y0 * scale);
      canvas.scale(scale, scale);
      // Drawn where it stands, so it's lit as it is there.
      canvas.translate(-s.x, -s.y);
      paint(canvas, s);
      canvas.restore();
      return spot;
    });
    surface.flush();
    const atlas = surface.makeImageSnapshot().makeNonTextureImage();
    surface.dispose();
    if (!atlas) return null;
    return {
      atlas,
      sprites,
      spots: sprigs.flatMap((s, i) => [s.x, s.y, s.phase, -boxes[i].x0 * scale, -boxes[i].y0 * scale]),
      xforms: sprigs.map(() => Skia.RSXform(1, 0, 0, 0)),
      scale,
    };
  } catch {
    return null;
  }
}

/** A lightning bolt from the cloud down to the horizon, jagged, with a branch or two off it. */
function bolt(rand: () => number, f: CameraFrame): SkPath {
  const b = Skia.PathBuilder.Make();
  const fork = (x0: number, y0: number, to: number, step: number, branches: number) => {
    let x = x0;
    let y = y0;
    b.moveTo(x, y);
    while (y < to) {
      x += (rand() - 0.5) * step * 1.6;
      y += step * (0.6 + rand() * 0.8);
      b.lineTo(x, Math.min(y, to));
      if (branches > 0 && rand() < 0.18) {
        const keep = { x, y };
        fork(x, y, y + (to - y) * (0.3 + rand() * 0.3), step * 0.7, 0);
        b.moveTo(keep.x, keep.y);
        branches--;
      }
    }
  };
  fork(f.pad + f.W * (0.15 + rand() * 0.7), f.cy * (0.18 + rand() * 0.15), f.cy, 9 + rand() * 6, 2);
  return b.build();
}

/**
 * How bright a storm's lightning is at time `t` (ms), 0..1, and which bolt: now and then a strike, a
 * quick flash and a second, fainter one, then nothing for a while. Never more than two flashes a
 * strike and strikes seconds apart (gentle on the eyes), and none at all with reduced motion.
 */
function flashAt(t: number) {
  'worklet';
  const WINDOW = 8000;
  const k = Math.floor(t / WINDOW);
  const h = Math.abs(Math.sin(k * 12.9898 + 4.1414) * 43758.5453) % 1;
  // Some stretches have none.
  if (h > 0.7) return { strength: 0, which: -1 };
  const dt = t - k * WINDOW - (h / 0.7) * (WINDOW - 1500);
  const first = dt >= 0 && dt < 110 ? 1 - dt / 110 : 0;
  const second = dt >= 220 && dt < 700 ? 0.55 * (1 - (dt - 220) / 480) : 0;
  return { strength: Math.max(first, second), which: k % 5 };
}

/** The web's one GPU surface the clouds are drawn on in turn (a new one each would soon run out). */
const WEB_W = 1024;
const WEB_H = 640;
let shared: SkSurface | null | undefined;
function webSurface(): SkSurface | null {
  if (shared === undefined) {
    shared = null;
    try {
      // Without OffscreenCanvas it would be a CPU surface, far too slow for the cloud shader.
      if (typeof OffscreenCanvas !== 'undefined') shared = Skia.Surface.MakeOffscreen(WEB_W, WEB_H);
    } catch {
      shared = null;
    }
  }
  return shared;
}

/** How sharp a cloud's image is: two device pixels a point, less for a huge one (to keep it small). */
function imageScale(r: SkRect) {
  return Math.min(PixelRatio.get(), 2, WEB_W / r.width, WEB_H / r.height);
}

/** A small picture as an image (a cloud), `scale` device pixels per point. */
function pictureImage(picture: SkPicture, r: SkRect, scale: number): SkImage | null {
  const w = Math.ceil(r.width * scale);
  const h = Math.ceil(r.height * scale);
  try {
    const web = Platform.OS === 'web' ? webSurface() : null;
    const surface = web ?? (Platform.OS === 'web' ? Skia.Surface.Make(w, h) : Skia.Surface.MakeOffscreen(w, h));
    if (!surface) return null;
    const canvas = surface.getCanvas();
    if (web) canvas.clear(Skia.Color('transparent'));
    canvas.save();
    canvas.scale(scale, scale);
    canvas.translate(-r.x, -r.y);
    canvas.drawPicture(picture);
    canvas.restore();
    surface.flush();
    const image = surface.makeImageSnapshot(web ? Skia.XYWHRect(0, 0, w, h) : undefined).makeNonTextureImage();
    if (!web) surface.dispose();
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

/** A cloud's time round (its lap across the sky) at time `t`, ms: it's another cloud each time round. */
function roundOf(k: Pick<Drifter, 'x' | 'reach' | 'speed' | 'lap'>, t: number) {
  'worklet';
  return Math.floor((k.x + k.reach + (t / 1000) * k.speed) / k.lap);
}

const roundsAt = (scene: Scene, t: number) => scene.clouds.map((k) => roundOf(k, t));

/** What's drawn of a cloud just now: the cloud of its current time round. */
interface Shown {
  image: SkImage | null;
  src: SkRect | null;
  picture: SkPicture;
}

/**
 * The sky and field as they are at this moment, as the level camera sees them (the tilt is applied
 * as it's drawn): the still picture (fading in over the one before while it changes), the fog and
 * the clouds drifting, a storm's lightning. One picture a frame, drawn on both canvases: a part for
 * each cloud and bank of fog, on each canvas, was dozens of pieces of work a frame.
 */
function useSkyPicture(scene: Scene, f: CameraFrame, cur: SkImage | null, prev: SkImage | null, blend: SharedValue<number>, clock: SharedValue<number>, shown: Shown[], storm: boolean, soft: SkImage | null, tilt: SharedValue<number>): SharedValue<SkPicture> {
  const full = useMemo(() => Skia.XYWHRect(0, 0, f.picW, f.picH), [f]);
  const softSrc = useMemo(() => (soft ? Skia.XYWHRect(0, 0, soft.width(), soft.height()) : null), [soft]);
  const curSrc = useMemo(() => (cur ? Skia.XYWHRect(0, 0, cur.width(), cur.height()) : null), [cur]);
  const prevSrc = useMemo(() => (prev ? Skia.XYWHRect(0, 0, prev.width(), prev.height()) : null), [prev]);
  const clouds = useMemo(() => scene.clouds.map(({ x, y, reach, speed, lap, rect }) => ({ x, y, reach, speed, lap, rect })), [scene]);
  const { picture, nearStill, mists, bolts } = scene;
  const span = f.picW;
  const skyH = f.cy;
  return useDerivedValue(() => {
    const t = clock.value;
    const fade = blend.value;
    const focus = soft ? focusAt(tilt.value) : 0;
    return createPicture((cv) => {
      const paint = Skia.Paint();
      if (prev && prevSrc) cv.drawImageRectOptions(prev, prevSrc, full, FilterMode.Linear, MipmapMode.None, paint);
      if (cur && curSrc) {
        paint.setAlphaf(fade);
        cv.drawImageRectOptions(cur, curSrc, full, FilterMode.Linear, MipmapMode.None, paint);
        paint.setAlphaf(1);
      } else cv.drawPicture(picture);
      // Looking down at the flowers, the far field goes softly out of focus.
      if (soft && softSrc && focus > 0.01) {
        paint.setAlphaf(0.92 * focus * fade);
        cv.drawImageRectOptions(soft, softSrc, full, FilterMode.Linear, MipmapMode.None, paint);
        paint.setAlphaf(1);
      }
      // Banks of fog drifting across, each coming round again (it tiles across the picture's width).
      for (let i = 0; i < mists.length; i++) {
        const m = mists[i];
        const off = -(((((t / 1000) * m.b.speed) % span) + span) % span);
        for (let piece = 0; piece < 2; piece++) {
          cv.save();
          cv.translate(off + piece * span, m.b.y);
          if (m.image && m.src) cv.drawImageRectOptions(m.image, m.src, m.dst, FilterMode.Linear, MipmapMode.None, paint);
          else cv.drawPicture(m.picture);
          cv.restore();
        }
      }
      // The clouds drifting slowly across, each coming round again off the far side (as another cloud).
      for (let i = 0; i < clouds.length; i++) {
        const k = clouds[i];
        const d = shown[i];
        if (!d) continue;
        const at = (((k.x + k.reach + (t / 1000) * k.speed) % k.lap) + k.lap) % k.lap;
        cv.save();
        cv.translate(at - k.reach, k.y);
        if (d.image && d.src) cv.drawImageRectOptions(d.image, d.src, k.rect, FilterMode.Linear, MipmapMode.None, paint);
        else cv.drawPicture(d.picture);
        cv.restore();
      }
      // A storm's lightning: the sky flashing, and the bolt itself while it does.
      if (storm) {
        const flash = flashAt(t);
        if (flash.strength > 0) {
          const lit = Skia.Paint();
          lit.setColor(Skia.Color('#E8ECFF'));
          lit.setAlphaf(flash.strength * 0.28);
          cv.drawRect(Skia.XYWHRect(0, 0, span, skyH), lit);
          const path = bolts[flash.which];
          if (path) {
            const shine = Math.min(1, flash.strength * 1.4);
            const stroke = (color: string, width: number, alpha: number) => {
              const line = Skia.Paint();
              line.setAntiAlias(true);
              line.setStyle(PaintStyle.Stroke);
              line.setStrokeWidth(width);
              line.setStrokeCap(StrokeCap.Round);
              line.setStrokeJoin(StrokeJoin.Round);
              line.setColor(Skia.Color(color));
              line.setAlphaf(alpha);
              return line;
            };
            const glow = stroke('#B8C4FF', 5, 0.5 * shine);
            glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 5, true));
            cv.drawPath(path, glow);
            cv.drawPath(path, stroke('#FFFFFF', 1.6, shine));
          }
        }
      }
      if (nearStill) cv.drawPicture(nearStill);
    });
  });
}

/**
 * The near flowers, each standing upright where its base meets the ground on screen. The camera's
 * tilt squashes the ground top to bottom up close; a flower takes only the tilt's scale across there
 * (the same both ways), so it keeps its shape, and sways from its base on its own slow rhythm,
 * further and quicker in the wind (`gust`). All of them in one draw of their image a frame.
 */
function useNearPicture(near: Near | null, matrix: SharedValue<number[]>, clock: SharedValue<number>, gust: number, empty: SkPicture): SharedValue<SkPicture> {
  const quick = 1 + Math.min(1, gust / 2);
  const reach = 0.05 * (1 + gust);
  return useDerivedValue(() => {
    if (!near) return empty;
    const m = matrix.value;
    const t = clock.value;
    const { spots, xforms, scale } = near;
    for (let i = 0; i < xforms.length; i++) {
      const x = spots[i * 5];
      const y = spots[i * 5 + 1];
      const phase = spots[i * 5 + 2];
      const ox = spots[i * 5 + 3];
      const oy = spots[i * 5 + 4];
      // The camera's matrix has no x in its bottom row (m[6]) or in y's (m[3]).
      const w = m[7] * y + m[8];
      const period = (4200 + phase * 2600) / quick;
      const a = Math.sin((t / period + phase) * Math.PI * 2) * reach;
      const k = 1 / (w * scale);
      const sc = k * Math.cos(a);
      const ss = k * Math.sin(a);
      // Turned and scaled about its base, which lands where the ground is on screen.
      xforms[i].set(sc, ss, (m[0] * x + m[1] * y + m[2]) / w - (sc * ox - ss * oy), (m[4] * y + m[5]) / w - (ss * ox + sc * oy));
    }
    return createPicture((cv) => cv.drawAtlas(near.atlas, near.sprites, xforms, Skia.Paint()));
  });
}

/**
 * The motes as they float this moment: petals and leaves drifting on the breeze, turning over and
 * bobbing; fireflies wandering and glowing on and off. Placed by the camera like the ground under them.
 */
function useMotePicture(motes: Motes | null, matrix: SharedValue<number[]>, clock: SharedValue<number>, span: number, empty: SkPicture): SharedValue<SkPicture> {
  return useDerivedValue(() => {
    if (!motes) return empty;
    const m = matrix.value;
    const t = clock.value / 1000;
    const { data, xforms, drift, kind, atlas, sprites } = motes;
    const fly = kind === 'firefly';
    const half = (MOTE_SIZE * MOTE_PX) / 2;
    const glow: Float32Array[] = [];
    for (let i = 0; i < xforms.length; i++) {
      const j = i * 7;
      const row = data[j + 1];
      const size = data[j + 3];
      const phase = data[j + 4] * Math.PI * 2;
      const pace = data[j + 5];
      const near = data[j + 6];
      let x = data[j];
      let up = data[j + 2];
      let turn = 0;
      if (fly) {
        x += Math.sin(t * 0.25 * pace + phase) * 18 * near;
        up += Math.sin(t * 0.4 * pace + phase * 1.7) * 8 * near;
        // On for a moment now and then, fading in and out.
        const on = Math.min(1, Math.max(0, (Math.sin(t * (0.7 + pace * 0.5) + phase * 2) - 0.3) / 0.7));
        glow.push(Float32Array.of(1, 1, 1, on * on));
      } else {
        x += t * drift * near * (0.7 + 0.6 * pace) + Math.sin(t * 1.1 * pace + phase) * 6 * near;
        up *= 1 + Math.sin(t * 0.7 * pace + phase) * 0.25;
        turn = t * (0.5 + pace) + phase;
      }
      x = ((x % span) + span) % span;
      const w = m[7] * row + m[8];
      const k = size / (w * MOTE_PX);
      const sc = k * Math.cos(turn);
      const ss = k * Math.sin(turn);
      // About the shape's middle, over its spot on the ground on screen.
      const cx = (m[0] * x + m[1] * row + m[2]) / w;
      const cy = (m[4] * row + m[5]) / w - up / w;
      xforms[i].set(sc, ss, cx - (sc * half - ss * half), cy - (ss * half + sc * half));
    }
    return createPicture((cv) => {
      const paint = Skia.Paint();
      if (fly) {
        // Light adds to what's behind it; each one only as bright as it glows just now.
        paint.setBlendMode(BlendMode.Plus);
        cv.drawAtlas(atlas, sprites, xforms, paint, BlendMode.DstIn, glow);
      } else cv.drawAtlas(atlas, sprites, xforms, paint);
    });
  });
}

/**
 * One field for the whole time the app is open: the same one each time Home comes back (on the web a
 * page out of sight is put away, and Home planted a new field, and drew it all again, every visit).
 */
const FIELD_SEED = 1 + Math.floor(Math.random() * 2147483000);

/** The last scene drawn and its images, kept for when Home comes back under the same sky. */
let kept: { key: string; scene: Scene; images: Map<number, SkImage | null>; soft?: SkImage | null } | null = null;

function keep(key: string, scene: Scene): Scene {
  kept = { key, scene, images: new Map() };
  return scene;
}

/** The scene as an image (snapshot), kept with the scene. */
function keptSnapshot(scene: Scene, f: CameraFrame, most: number): SkImage | null {
  const own = kept?.scene === scene ? kept : null;
  if (own?.images.has(most)) return own.images.get(most) ?? null;
  const image = snapshot(scene.picture, f, most);
  own?.images.set(most, image);
  return image;
}

/** The far field out of focus (softImage), kept with the scene. */
function keptSoft(scene: Scene, image: SkImage, f: CameraFrame): SkImage | null {
  const own = kept?.scene === scene ? kept : null;
  if (own && own.soft !== undefined) return own.soft;
  const soft = softImage(image, f);
  if (own) own.soft = soft;
  return soft;
}

/** The sky's and the field's colours alone: what shows for a moment while the scene is drawn. */
function placeholderScene(f: CameraFrame, look: SkyLook): Scene {
  const picture = createPicture((canvas) => {
    const paint = Skia.Paint();
    paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, f.cy), [Skia.Color(look.top), Skia.Color(look.mid), Skia.Color(look.horizon)], [0, 0.55, 1], TileMode.Clamp));
    canvas.drawRect(Skia.XYWHRect(0, 0, f.picW, f.cy + 1), paint);
    paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, f.cy), vec(0, f.H), [Skia.Color(look.groundFar), Skia.Color(look.groundMid), Skia.Color(look.groundNear)], [0, 0.4, 1], TileMode.Clamp));
    canvas.drawRect(Skia.XYWHRect(0, f.cy, f.picW, f.picH - f.cy), paint);
  }, Skia.XYWHRect(0, 0, f.picW, f.picH));
  return { placeholder: true, picture, near: null, nearStill: null, clouds: [], mists: [], bolts: [], motes: null };
}

/** A canvas drawn at CANVAS_DENSITY and scaled up to fill `width` x `height` on screen. */
const upscaled = (width: number, height: number) => ({ width: Math.ceil(width / UPSCALE), height: Math.ceil(height / UPSCALE), transform: [{ scale: UPSCALE }], transformOrigin: 'top left' }) as const;
const DOWN = [{ scale: 1 / UPSCALE }];

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
  // Drawn again only when the sky visibly changes (lookKey), not at every few minutes' tick, and
  // kept for when Home comes back to the same sky.
  const sky = lookKey(look);
  const sceneKey = `${frame.W}|${frame.H}|${frame.viewH}|${frame.cy}|${c.dark ? 1 : 0}|${bloom}|${sky}`;
  // On the web the page shows first, with just the sky's and field's colours, and the scene fades
  // in a moment later: drawn there on the CPU, it held the whole page back while it was.
  const later = Platform.OS === 'web';
  const [drawn, setDrawn] = useState(0);
  const scene = useMemo(
    () => (kept?.key === sceneKey ? kept.scene : later ? placeholderScene(frame, look) : keep(sceneKey, drawCameraScene(frame, look, c, FIELD_SEED, bloom))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sceneKey, drawn],
  );
  useEffect(() => {
    if (!later || kept?.key === sceneKey) return;
    const id = setTimeout(() => {
      keep(sceneKey, drawCameraScene(frame, look, c, FIELD_SEED, bloom));
      setDrawn((n) => n + 1);
    }, 30);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, later]);
  // Running through the time away, each frame is made at a point a pixel: four times quicker, and it
  // sharpens again at the end.
  const lapsing = useSkyClock((s) => s.lapsing);
  // (The placeholder as a small image too, so the scene fades in over it.)
  const image = useMemo(() => keptSnapshot(scene, frame, scene.placeholder ? 0.25 : lapsing ? 1 : 2), [scene, frame, lapsing]);
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
  // Off past the far side a cloud comes round again as another one (the change is out of sight):
  // which time round each is on, kept up to date from the UI thread as they come round.
  const [cloudRounds, setCloudRounds] = useState(() => ({ scene, at: roundsAt(scene, clock.get()) }));
  const rounds = cloudRounds.scene === scene ? cloudRounds.at : roundsAt(scene, clock.get());
  if (cloudRounds.scene !== scene) setCloudRounds({ scene, at: rounds });
  const drift = useMemo(() => scene.clouds.map(({ x, reach, speed, lap }) => ({ x, reach, speed, lap })), [scene]);
  const nextRounds = () => setCloudRounds({ scene, at: roundsAt(scene, clock.get()) });
  useAnimatedReaction(
    () => {
      let sum = 0;
      for (let i = 0; i < drift.length; i++) sum += roundOf(drift[i], clock.value);
      return sum;
    },
    (now, before) => {
      if (before != null && now !== before) scheduleOnRN(nextRounds);
    },
  );
  const cloudsShown = useMemo<Shown[]>(
    () =>
      scene.clouds.map((k, i) => {
        const d = k.design(rounds[i]);
        return { image: d.image, src: d.image ? Skia.XYWHRect(0, 0, d.image.width(), d.image.height()) : null, picture: d.picture };
      }),
    [scene, rounds],
  );
  // Rain, snow or hail falls over the scene, and the clouds drift (held still with reduced motion).
  const fall = fallOf(look);
  const falls = useMemo<Fall[]>(() => [...(fall ? [fall] : []), ...(look.hail ? (['hail'] as const) : [])], [fall, look.hail]);
  const rain = useFalling(falls, look.fall, frame.W, frame.H, clock, look.wind);
  const moving = animate && !reduceMotion && (!!scene.near || falls.length > 0 || scene.clouds.length > 0 || scene.mists.length > 0 || !!scene.motes);
  // Lightning only while the scene moves (held still, a flash could stay lit), never with reduced motion.
  const storm = moving && scene.bolts.length > 0;
  const gust = Math.min(2, look.wind / 20);
  useEffect(() => {
    ticker.setActive(moving);
  }, [moving, ticker]);
  const empty = useMemo(() => createPicture(() => {}), []);
  // The far field out of focus, for when the camera looks down (not while running through the time
  // away, each frame of which is on screen only a moment).
  const soft = useMemo(() => (image && !lapsing && !scene.placeholder ? keptSoft(scene, image, frame) : null), [scene, image, frame, lapsing]);
  const skyNow = useSkyPicture(scene, frame, layers.cur, layers.prev, blend, clock, cloudsShown, storm, soft, tilt);
  const nearNow = useNearPicture(scene.near, matrix, clock, gust, empty);
  const motesNow = useMotePicture(moving ? scene.motes : null, matrix, clock, frame.picW, empty);
  // As it looks down, the camera eases in a little closer, toward the foot of the screen.
  const closer = useDerivedValue(() => {
    const s = 1 + 0.05 * focusAt(tilt.value);
    return [{ translateX: frame.W / 2 }, { translateY: frame.H }, { scale: s }, { translateX: -frame.W / 2 }, { translateY: -frame.H }];
  });
  const scenery = (
    <Group matrix={matrix}>
      <Picture picture={skyNow} />
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
        <View style={upscaled(frame.W, frame.viewH)}>
          <Canvas style={{ flex: 1 }}>
            <Group transform={DOWN}>
              <Group transform={closer}>
                {scenery}
                {scene.near ? <Picture picture={nearNow} /> : null}
                {moving && scene.motes ? <Picture picture={motesNow} /> : null}
              </Group>
              {falls.length ? <Picture picture={rain} /> : null}
            </Group>
          </Canvas>
        </View>
      </View>
      {children}
      {topFade ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, width: frame.W, height: fadeH }, shown]}>
          <View style={upscaled(frame.W, fadeH)}>
            <Canvas style={{ flex: 1 }}>
              <Group transform={DOWN}>
                <Group transform={closer}>{scenery}</Group>
                {falls.length ? <Picture picture={rain} /> : null}
                {/* Fading out downward: what's drawn is kept only as much as this is opaque. It covers
                    the whole canvas (a sliver taller than the fade, rounded up to whole pixels), clear
                    past the fade's end, or that sliver showed as a line across the cards. */}
                <Rect x={0} y={0} width={frame.W + UPSCALE * 2} height={fadeH + UPSCALE * 2} blendMode="dstIn">
                  <LinearGradient start={vec(0, 0)} end={vec(0, fadeH)} colors={stops.colors} positions={stops.positions} />
                </Rect>
              </Group>
            </Canvas>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
}
