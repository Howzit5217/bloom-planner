import { Canvas, PaintStyle, Picture, Skia, StrokeJoin, TileMode, vec, createPicture, type SkCanvas, type SkFont } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Image, PixelRatio, Platform, Text, View } from 'react-native';
import { badgeTier, type BadgeTier } from '@/engine/badge';
import { font as fonts } from '@/theme/tokens';
import { useGameFont } from './gameFont';
import { hexPath } from './shapes';
import { t } from '@/i18n';

export interface Metal {
  /** The rim, light to dark. */
  rim: [string, string, string];
  /** The centre, top to bottom. */
  face: [string, string];
  /** Behind the rim, and the outline round the lettering. */
  deep: string;
}

export const METALS: Record<BadgeTier, Metal> = {
  bronze: { rim: ['#F6C79A', '#D08A52', '#9A5A2B'], face: ['#D9925A', '#F3BE8C'], deep: '#7E4720' },
  silver: { rim: ['#FBFCFD', '#C9D0D7', '#8C969F'], face: ['#C3CBD3', '#EEF2F5'], deep: '#66707A' },
  gold: { rim: ['#FFE07A', '#F2B530', '#B8740C'], face: ['#F2B530', '#FFE07A'], deep: '#9A5F08' },
  top: { rim: ['#FFE07A', '#F2B530', '#B8740C'], face: ['#D8413A', '#F26E5B'], deep: '#8E2A1F' },
};

/** The badge: a hexagon in its metal, "Lv" over the number, white lettering outlined in the deep colour. */
function drawBadge(canvas: SkCanvas, level: number, size: number, big: SkFont | null, small: SkFont | null) {
  const m = METALS[badgeTier(level)];
  const cx = size / 2;
  const outer = hexPath(cx, cx, size * 0.48, size * 0.08);
  const inner = hexPath(cx, cx, size * 0.4, size * 0.065);
  const sw = size * 0.035;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(m.deep));
  canvas.drawPath(outer, paint);
  canvas.save();
  canvas.translate(0, -size * 0.025);
  paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, size), m.rim.map((h) => Skia.Color(h)), null, TileMode.Clamp));
  canvas.drawPath(outer, paint);
  paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, size * 0.1), vec(0, size * 0.9), m.face.map((h) => Skia.Color(h)), null, TileMode.Clamp));
  canvas.drawPath(inner, paint);
  paint.setShader(null);
  const letter = (text: string, font: SkFont, y: number, outline: number) => {
    const x = cx - font.measureText(text).width / 2;
    const stroke = Skia.Paint();
    stroke.setAntiAlias(true);
    stroke.setStyle(PaintStyle.Stroke);
    stroke.setStrokeWidth(outline);
    stroke.setStrokeJoin(StrokeJoin.Round);
    stroke.setColor(Skia.Color(m.deep));
    canvas.drawText(text, x, y, stroke, font);
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    fill.setColor(Skia.Color('#FFFFFF'));
    canvas.drawText(text, x, y, fill, font);
  };
  if (small) letter('Lv', small, size * 0.37, sw * 2);
  if (big) letter(String(level), big, size * 0.7, sw * 2.4);
  canvas.restore();
}

/**
 * On the web each Skia canvas takes one of the browser's graphics contexts, and a browser keeps only
 * about sixteen: a list of badges would lose them and go blank. So the web draws each badge once into
 * a plain image (kept for the session) and shows that.
 */
const webImages = new Map<string, string>();
function webBadge(level: number, size: number, big: SkFont | null, small: SkFont | null): string | null {
  const scale = Math.min(3, Math.max(1, PixelRatio.get()));
  const key = `${level}|${size}|${scale}|${big && small ? 'text' : 'plain'}`;
  const known = webImages.get(key);
  if (known) return known;
  try {
    const px = Math.ceil(size * scale);
    const surface = Skia.Surface.Make(px, px);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.scale(scale, scale);
    drawBadge(canvas, level, size, big, small);
    surface.flush();
    const uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`;
    surface.dispose();
    webImages.set(key, uri);
    return uri;
  } catch {
    return null;
  }
}

/** The hexagon level badge ("Lv 110"), in the metal of its level. */
export function LevelBadge({ level, size = 96 }: { level: number; size?: number }) {
  const big = useGameFont(size * (level >= 100 ? 0.36 : 0.42));
  const small = useGameFont(size * 0.2);
  const web = Platform.OS === 'web';
  const uri = useMemo(() => (web ? webBadge(level, size, big, small) : null), [web, level, size, big, small]);
  const picture = useMemo(() => (web ? null : createPicture((canvas) => drawBadge(canvas, level, size, big, small), Skia.XYWHRect(0, 0, size, size))), [web, level, size, big, small]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t('Level {level}', { level })} style={{ width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : picture ? (
        <Canvas style={{ width: size, height: size }}>
          <Picture picture={picture} />
        </Canvas>
      ) : null}
      {/* Until the drawn lettering has its face (or if it can't load), the number shows as text. */}
      {big && small ? null : (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: size * 0.05, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.heading, fontSize: size * (level >= 100 ? 0.32 : 0.38), lineHeight: size * 0.46, color: '#FFFFFF', textShadowColor: METALS[badgeTier(level)].deep, textShadowRadius: Math.max(2, size * 0.05) }}>{level}</Text>
        </View>
      )}
    </View>
  );
}
