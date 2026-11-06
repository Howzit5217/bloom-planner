import { Canvas, PaintStyle, Picture, Skia, StrokeJoin, TileMode, vec, createPicture, type SkCanvas, type SkFont } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Image, PixelRatio, Platform, Text, View } from 'react-native';
import { badgeTier, type BadgeTier } from '@/engine/badge';
import { font as fonts } from '@/theme/tokens';
import { useGameFont } from './gameFont';
import { hexPath } from './shapes';
import { t } from '@/i18n';

export interface Metal {
  /** The rim, top to bottom: bright, a little deeper, then bright again along the bottom edge. */
  rim: [string, string, string];
  /** The face inside it, top to bottom: deeper under the rim, lighter lower down. */
  face: [string, string];
  /** The outline round the number, and "Lv" itself; the edge underneath too, unless `edge`. */
  deep: string;
  /** The edge underneath, where it isn't the deep colour (a gold rim round another face). */
  edge?: string;
  /** The light edge round "Lv". */
  shine: string;
}

const GOLD_RIM: Metal['rim'] = ['#FFF86A', '#FCEB3C', '#FBEA2A'];

/** The game's badge metals: bronze, a cool blue-tinted silver, lemon gold, and orange-red in a gold rim. */
export const METALS: Record<BadgeTier, Metal> = {
  bronze: { rim: ['#FCC77E', '#F3A469', '#F6AE74'], face: ['#D2732F', '#D3925A'], deep: '#87451F', shine: '#FFE6C6' },
  silver: { rim: ['#E9F4FD', '#C3D6EE', '#CFDEFA'], face: ['#869BB6', '#B3C3D3'], deep: '#566F86', shine: '#FFFFFF' },
  gold: { rim: GOLD_RIM, face: ['#F2BE12', '#FBDE3A'], deep: '#A56E12', shine: '#FFFBD2' },
  top: { rim: GOLD_RIM, face: ['#DC5426', '#EC6631'], deep: '#9A361A', edge: '#A56E12', shine: '#FFDCC0' },
};

/** The badge: the hexagon's rim in its metal round a face, standing on a darker edge; "Lv" and the number. */
function drawBadge(canvas: SkCanvas, level: number, size: number, big: SkFont | null, small: SkFont | null) {
  const m = METALS[badgeTier(level)];
  const cx = size / 2;
  const outer = hexPath(cx, cx, size * 0.48, size * 0.08);
  const inner = hexPath(cx, cx, size * 0.39, size * 0.062);
  const sw = size * 0.035;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  // The edge it stands on.
  paint.setColor(Skia.Color(m.edge ?? m.deep));
  canvas.drawPath(outer, paint);
  canvas.save();
  canvas.translate(0, -size * 0.025);
  paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, size * 0.02), vec(0, size * 0.98), m.rim.map((h) => Skia.Color(h)), null, TileMode.Clamp));
  canvas.drawPath(outer, paint);
  paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, size * 0.12), vec(0, size * 0.88), m.face.map((h) => Skia.Color(h)), null, TileMode.Clamp));
  canvas.drawPath(inner, paint);
  paint.setShader(null);
  const letter = (text: string, font: SkFont, y: number, fill: string, edge: string, outline: number, drop: boolean) => {
    const x = cx - font.measureText(text).width / 2;
    const stroke = Skia.Paint();
    stroke.setAntiAlias(true);
    stroke.setStyle(PaintStyle.Stroke);
    stroke.setStrokeWidth(outline);
    stroke.setStrokeJoin(StrokeJoin.Round);
    if (drop) {
      // A soft drop under the number, so it stands off the face.
      stroke.setColor(Skia.Color('rgba(0,0,0,0.2)'));
      canvas.drawText(text, x, y + outline * 0.28, stroke, font);
    }
    stroke.setColor(Skia.Color(edge));
    canvas.drawText(text, x, y, stroke, font);
    const paintFill = Skia.Paint();
    paintFill.setAntiAlias(true);
    paintFill.setColor(Skia.Color(fill));
    canvas.drawText(text, x, y, paintFill, font);
  };
  if (small) letter('Lv', small, size * 0.37, m.deep, m.shine, sw * 1.8, false);
  if (big) letter(String(level), big, size * 0.7, '#FFFFFF', m.deep, sw * 2.4, true);
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
