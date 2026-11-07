import { Skia, type SkCanvas, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { mix, type SkyLook } from '@/engine/sky';

/** The most billows a cloud is built from. */
const MAX_BLOBS = 20;
/** Where a cloud's flat base sits, in its sizes below its middle. */
const BASE = 0.12;

/**
 * A cloud worked out a pixel at a time: its billows (`blob`, each x, y, radius and how far forward it
 * stands) merged into one heap on a flat base, the outline bent by noise so no billow is a circle,
 * with smaller round bulges on the big ones down to a pixel or two; its base curves up into its
 * sides at the ends. Each pixel is lit by how its
 * billow faces the light and by how much cloud lies between it and the light, darker in the creases
 * where billows meet and toward the base, and a little see-through at the thin edges.
 */
const SKSL = `
uniform float3 at;
uniform float4 blob[${MAX_BLOBS}];
uniform float4 body;
uniform float3 light;
uniform float4 seed;
uniform float base;
uniform float px;
uniform float ragged;
uniform float under;
uniform float flatness;
uniform float4 cLit;
uniform float4 cFill;
uniform float4 cShade;
uniform float4 cDark;

float2 hash2(float2 p) {
  float3 p3 = fract(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}
float gnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 w = f * f * (3.0 - 2.0 * f);
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + float2(1.0, 0.0)), f - float2(1.0, 0.0));
  float c = dot(hash2(i + float2(0.0, 1.0)), f - float2(0.0, 1.0));
  float d = dot(hash2(i + float2(1.0, 1.0)), f - float2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
float smax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}

float bulk(float2 p) {
  float2 bq = float2(p.x - clamp(p.x, body.x, body.y), p.y - body.z) / body.w;
  float c = body.w * (1.0 - dot(bq, bq));
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    float4 b = blob[i];
    float2 q = (p - b.xy) / b.z;
    c = smax(c, b.z * (1.0 - dot(q, q)), 0.04);
  }
  return c;
}

float domes(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float m = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float2 g = float2(float(x), float(y));
      float2 h = hash2(i + g);
      float2 r = g + 0.5 + 0.42 * h - f;
      float rr = 0.38 + 0.25 * fract(h.x * 7.7 + h.y * 3.3);
      m = smax(m, sqrt(max(0.0, rr * rr - dot(r, r))) / rr, 0.3);
    }
  }
  return m - 0.5;
}
float fine(float2 p) {
  float f = 7.0;
  float v = smoothstep(px * 3.0, px * 8.0, 1.0 / f) * domes(p * f + seed.yx);
  f *= 2.4;
  v += 0.4 * smoothstep(px * 3.0, px * 8.0, 1.0 / f) * domes(p * f + seed.xy + 7.31);
  return v;
}

float2 bend(float2 u) {
  float2 warp = float2(gnoise(u * 1.6 + seed.zw), gnoise(u * 1.6 + seed.wz + 5.2));
  float2 crinkle = float2(gnoise(u * 5.0 + seed.yz), gnoise(u * 5.0 + seed.xw + 2.9));
  return u + warp * (0.15 + 0.1 * ragged) + crinkle * (0.025 + 0.03 * ragged);
}

half4 main(float2 pos) {
  float2 u = (pos - at.xy) / at.z;
  float2 uw = bend(u);
  float top = 0.3 + 0.7 * smoothstep(base, base - 0.3, u.y);
  float detail = fine(uw);
  float d = bulk(uw) + detail * 0.065 * top;
  float mid = (body.x + body.y) * 0.5;
  float span = max(0.1, (body.y - body.x) * 0.5 + body.w);
  float bl = base + gnoise(float2(u.x * 3.0, 1.3) + seed.xy) * 0.05 - 0.12 * smoothstep(0.55, 1.15, abs(u.x - mid) / span);
  float cut = 1.0 - smoothstep(bl - 0.03, bl + 0.04, u.y);
  float soft = max(px * 1.5, 0.008);
  float a = smoothstep(-soft, soft * 1.5, d) * cut;
  if (a <= 0.0) { return half4(0.0); }
  float best = -9.0;
  float second = -9.0;
  float3 nb = float3(0.0, 0.0, 1.0);
  float3 ns = nb;
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    float4 b = blob[i];
    float2 q = (uw - b.xy) / (b.z * 1.08);
    float dd = dot(q, q);
    if (dd < 1.0) {
      float sd = sqrt(1.0 - dd);
      float h = b.w + b.z * sd;
      float3 n = float3(q, sd);
      if (h > best) { second = best; ns = nb; best = h; nb = n; }
      else if (h > second) { second = h; ns = n; }
    }
  }
  float crease = second > -9.0 ? 1.0 - smoothstep(0.0, 0.07, best - second) : 0.0;
  float3 n = normalize(mix(nb, normalize(nb + ns), crease * 0.5));
  float hh = max(px * 1.5, 0.006);
  float2 slope = float2(fine(uw + float2(hh, 0.0)) - detail, fine(uw + float2(0.0, hh)) - detail) / hh;
  n = normalize(n + float3(-slope * 0.012 * top, 0.0));
  float3 L = normalize(light);
  float2 toward = L.xy * 0.22 / max(0.3, length(L.xy));
  float thick = max(0.0, bulk(uw + toward * 0.4)) + max(0.0, bulk(uw + toward * 0.9)) + max(0.0, bulk(uw + toward * 1.6));
  float through = exp(-thick * 8.0 * (1.0 - 0.5 * max(0.0, L.z)));
  float diff = clamp((dot(n, L) + 0.35) / 1.35, 0.0, 1.0);
  float lit = diff * (0.2 + 0.8 * through) * (1.0 - 0.45 * crease) + 0.08 * clamp(-n.y, 0.0, 1.0);
  lit = clamp(mix(lit, 0.55, flatness), 0.0, 1.0);
  float3 col = lit > 0.62 ? mix(cFill.rgb, cLit.rgb, (lit - 0.62) / 0.38) : mix(cShade.rgb, cFill.rgb, smoothstep(0.0, 0.62, lit));
  float low = clamp((u.y - (bl - 0.4)) / 0.4, 0.0, 1.0);
  col = mix(col, cDark.rgb, low * low * under);
  a *= 0.7 + 0.3 * smoothstep(0.0, 0.1, d);
  return half4(half3(col) * half(a), half(a));
}
`;

let effect: SkRuntimeEffect | null | undefined;

/** The cloud shader, made the first time a cloud is drawn; null where it can't be (the plain clouds then). */
export function cloudEffect(): SkRuntimeEffect | null {
  if (effect === undefined) {
    try {
      effect = Skia.RuntimeEffect.Make(SKSL);
    } catch {
      effect = null;
    }
  }
  return effect;
}

interface Billow {
  x: number;
  y: number;
  r: number;
  /** How high up the heap it is: the high middle builds most. */
  dome: number;
}

/** A cloud's build, in its sizes round its middle: the billows and the body along its base. */
export interface CloudShape {
  blobs: Array<{ x: number; y: number; r: number; z: number }>;
  body: { x0: number; x1: number; y: number; r: number };
}

/**
 * How one cloud is built, from `rand`: some long and flat, some heaped, some tall towers; a row of
 * billows along its base, the biggest where it's highest, and smaller ones heaped on those, most on
 * the high middle. Under a covered sky (`veil`) they're wider and flatter.
 */
export function cloudShape(rand: () => number, veil = 0): CloudShape {
  const kind = rand();
  const wide = 0.7 + rand() * 0.7 + veil * 0.35;
  const tall = (kind < 0.35 ? 0.35 + rand() * 0.3 : kind < 0.8 ? 0.6 + rand() * 0.4 : 0.95 + rand() * 0.35) * (1 - veil * 0.45);
  const peak = (rand() - 0.5) * 0.9;
  const half = 0.72 * wide;
  const out: Billow[] = [];
  const n = 3 + Math.floor(rand() * 3) + (wide > 1.05 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const t = -1 + (2 * (i + 0.5 + (rand() - 0.5) * 0.7)) / n;
    // Tapering to its ends: low, small billows there, so it never stands like a box.
    const dome = Math.max(0, 1 - ((t - peak) / 1.15) ** 2) ** 1.4;
    const r = 0.07 + 0.23 * dome * tall + rand() * 0.06;
    out.push({ x: t * half, y: BASE - r * (0.05 + 0.5 * dome) - dome * tall * 0.15, r, dome });
  }
  const grow = Math.min(MAX_BLOBS, n + 3 + Math.floor(tall * 9));
  for (let tries = 0; out.length < grow && tries < 150; tries++) {
    const weights = out.map((b) => (b.dome + 0.1) * b.r * b.r);
    let pick = rand() * weights.reduce((a, b) => a + b, 0);
    let p = out[0];
    for (let i = 0; i < out.length; i++) {
      pick -= weights[i];
      if (pick <= 0) {
        p = out[i];
        break;
      }
    }
    if (p.r < 0.08) continue;
    // Up and out to the sides: it bulges there as well.
    const ang = -Math.PI / 2 + (rand() - 0.5) * 2.7;
    const dist = p.r * (0.45 + rand() * 0.4);
    const r = p.r * (0.45 + rand() * 0.35);
    const c = { x: p.x + Math.cos(ang) * dist, y: p.y + Math.sin(ang) * dist, r, dome: p.dome * 0.92 };
    // Within its picture, and not lost inside another.
    if (c.y - c.r < -1.05 || Math.abs(c.x) + c.r > 1.5 || c.y + c.r * 0.3 > BASE || c.y > BASE - 0.06) continue;
    if (out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) + c.r < o.r * 0.95)) continue;
    out.push(c);
  }
  const xs = out.map((b) => b.x);
  return {
    // The lower billows stand in front of the higher ones.
    blobs: out.map((b) => ({ x: b.x, y: b.y, r: b.r, z: 0.35 * (b.y - BASE) + (rand() - 0.5) * 0.04 })),
    body: { x0: Math.min(...xs) * 0.9, x1: Math.max(...xs) * 0.9, y: BASE - 0.04, r: 0.1 + 0.07 * tall },
  };
}

/** How the clouds are lit in a sky: the same for all of them. */
export interface CloudLight {
  lit: string;
  fill: string;
  shade: string;
  dark: string;
  /** Toward the light: across (right +), down the screen (+) and out of it toward you. */
  light: [number, number, number];
  /** How dark the base is, in its own shadow (little with the sun low, lighting it from below). */
  under: number;
  /** How flat the light is: under a covered sky it comes from everywhere. */
  flatness: number;
  /** How ragged the clouds are: torn in a storm or rain, neat on a fine day. */
  ragged: number;
  /** Where the light comes from across (-1 left to 1 right), for the plain clouds. */
  lean: number;
  /** How covered the sky is: wider, flatter clouds the more it is. */
  veil: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The light on the clouds: from the sun where it is (from low down it lights their undersides), the
 * moon by night, from everywhere under a covered sky. Lit white by day, gold to pink round sunrise
 * and sunset (the sky's cloud colour), slate at night, with blue-grey shade from the sky.
 */
export function cloudLight(look: SkyLook): CloudLight {
  const sun = look.sun && look.veil < 0.6 ? look.sun : null;
  const moon = !sun && look.moon && look.moon.altitude > 0 && look.veil < 0.6 ? look.moon : null;
  const from = sun ?? moon;
  const lean = from ? clamp((from.x - 0.5) * 2.2, -1, 1) : 0;
  const elev = (clamp(from ? from.altitude : 50, -2, 60) * Math.PI) / 180;
  const night = look.night;
  const shade = mix(mix(look.cloudColor, mix('#7E8CA0', '#1E2440', night), 0.55), look.mid, 0.25);
  const moonlit = moon ? 0.25 * moon.fraction : 0;
  return {
    lit: mix(mix(look.cloudColor, '#AEB6CC', moonlit * night), '#FFFFFF', 0.7 * (1 - night) * (1 - 0.6 * look.veil)),
    fill: mix(look.cloudColor, shade, 0.12),
    shade,
    dark: mix(shade, mix('#5A6478', '#141A30', night), 0.4),
    light: [lean * Math.cos(elev) * 0.9, -Math.sin(elev) * 1.1 + 0.12, 0.3],
    under: (sun ? 0.15 + 0.45 * clamp(sun.altitude / 12, 0, 1) : 0.45) * (1 - 0.25 * look.veil),
    flatness: Math.min(0.8, look.veil * 0.75 + night * 0.25 + (from ? 0 : 0.15)),
    ragged: look.weather === 'storm' ? 0.6 : look.fog ? 0.5 : look.rain || look.snow ? 0.45 : look.weather === 'cloudy' ? 0.3 : 0.1,
    lean: sun && look.veil < 0.5 ? lean : 0,
    veil: look.veil,
  };
}

const rgba = (hex: string) => {
  const c = Skia.Color(hex);
  return [c[0], c[1], c[2], 1];
};

/**
 * Draws one cloud with the shader, its middle at (`x`, `y`) and `s` its size, `scale` device pixels
 * to a point (to know how fine its smallest bulges can be). Its build and its noise come from `rand`.
 */
export function drawShaderCloud(canvas: SkCanvas, fx: SkRuntimeEffect, x: number, y: number, s: number, rand: () => number, light: CloudLight, scale: number, bounds: { left: number; top: number; width: number; height: number }) {
  const shape = cloudShape(rand, light.veil);
  const u: number[] = [x, y, s];
  for (let i = 0; i < MAX_BLOBS; i++) {
    const b = shape.blobs[i];
    // Unused billows far off, where they add nothing.
    if (b) u.push(b.x, b.y, b.r, b.z);
    else u.push(100, 100, 1, -9);
  }
  u.push(shape.body.x0, shape.body.x1, shape.body.y, shape.body.r);
  u.push(...light.light, rand() * 60, rand() * 60, rand() * 60, rand() * 60);
  u.push(BASE, 1 / (s * scale), clamp(light.ragged + (rand() - 0.5) * 0.3, 0, 1), light.under, light.flatness);
  u.push(...rgba(light.lit), ...rgba(light.fill), ...rgba(light.shade), ...rgba(light.dark));
  const paint = Skia.Paint();
  paint.setShader(fx.makeShader(u));
  canvas.drawRect(Skia.XYWHRect(x + bounds.left * s, y + bounds.top * s, bounds.width * s, bounds.height * s), paint);
}
