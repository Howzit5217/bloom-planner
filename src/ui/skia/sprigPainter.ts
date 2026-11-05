import { Skia, type SkCanvas } from '@shopify/react-native-skia';
import { mix, type SkyLook } from '@/engine/sky';
import type { Palette } from '@/theme/tokens';
import { CENTRE_COLOR, CENTRE_R, flowerPath, leafPath, mixHex, stemPath } from './shapes';
import { geometry, leafAngle, type Sprig } from './sprigLayout';

const isWhite = (color: string) => ['#FFFFFF', '#EDE8DF'].includes(color.toUpperCase());

/**
 * Draws the setup screens' stemmed flowers into a picture (still, for a backdrop): the stem, its
 * leaf or two, and the five-petal head, tinted toward blue at night. Far off, where a flower would
 * be a few points across, it's just a speck of its colour.
 */
export function sprigPainter(c: Palette, look: SkyLook) {
  const night = (hex: string) => mix(hex, '#2A3466', look.night * 0.4);
  const stem = Skia.Paint();
  stem.setAntiAlias(true);
  stem.setColor(Skia.Color(night(mixHex(c.leaf, '#1E4A22', c.dark ? 0.12 : 0.22))));
  const leaf = Skia.Paint();
  leaf.setAntiAlias(true);
  leaf.setColor(Skia.Color(night(c.leaf)));
  const petal = Skia.Paint();
  petal.setAntiAlias(true);
  const centre = Skia.Paint();
  centre.setAntiAlias(true);
  centre.setColor(Skia.Color(night(CENTRE_COLOR)));
  return (canvas: SkCanvas, s: Sprig) => {
    if (s.r < 2.4) {
      petal.setColor(Skia.Color(night(s.color)));
      canvas.drawCircle(s.x, s.y - s.r * 2, Math.max(0.8, s.r * 0.9), petal);
      return;
    }
    const g = geometry(s);
    canvas.save();
    canvas.translate(s.x, s.y);
    canvas.drawPath(stemPath(0, 0, g.ctrl.x, g.ctrl.y, g.top.x, g.top.y, Math.max(1, s.r * s.stemW), Math.max(0.8, s.r * s.stemW * 0.62)), stem);
    // Small flowers skip their leaves: too little to see, and a lot to draw.
    if (s.r >= 5) {
      const shape = leafPath(s.r * s.leafLen, s.r * s.leafLen * s.leafWid);
      for (const l of s.leaves) {
        const p = g.pointAt(l.at);
        canvas.save();
        canvas.translate(p.x, p.y);
        canvas.rotate((leafAngle(p.along, l.side) * 180) / Math.PI, 0, 0);
        canvas.scale(l.size, l.size * l.side);
        canvas.drawPath(shape, leaf);
        canvas.restore();
      }
    }
    const head = flowerPath(g.top.x, g.top.y, s.r, 1, 5, s.rot);
    if (isWhite(s.color)) {
      petal.setColor(Skia.Color(night(mixHex(s.color, '#8A7A5C', 0.35))));
      canvas.drawPath(flowerPath(g.top.x, g.top.y + Math.max(0.8, s.r * 0.07), s.r, 1, 5, s.rot), petal);
    }
    petal.setColor(Skia.Color(night(s.color)));
    canvas.drawPath(head, petal);
    canvas.drawCircle(g.top.x, g.top.y, s.r * CENTRE_R, centre);
    canvas.restore();
  };
}
