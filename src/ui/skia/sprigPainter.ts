import { Skia, type SkCanvas } from '@shopify/react-native-skia';
import { mix, multiply, type SkyLook } from '@/engine/sky';
import type { Palette } from '@/theme/tokens';
import { CENTRE_COLOR, CENTRE_R, flowerPath, leafPath, mixHex, stemPath } from './shapes';
import type { FieldLight } from './Meadow';
import { geometry, leafAngle, type Sprig } from './sprigLayout';

const isWhite = (color: string) => ['#FFFFFF', '#EDE8DF'].includes(color.toUpperCase());

/**
 * Draws the setup screens' stemmed flowers into a picture (still, for a backdrop): the stem, its
 * leaf or two, and the five-petal head, tinted toward blue at night. Far off, where a flower would
 * be a few points across, it's just a speck of its colour. With `light`, a flower facing the sun
 * (or moon) takes on a little of its colour and one away from it falls a little into shade.
 */
export function sprigPainter(c: Palette, look: SkyLook, light?: FieldLight, fade?: (y: number) => number) {
  // Lit as the field is (warm by a low sun, blue at dusk) but keeping much of their own colour, so
  // they still show at night, tinted toward blue.
  const night = (hex: string) => mix(mix(multiply(hex, look.light), hex, 0.45), '#2A3466', look.night * 0.25);
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
  const stemBase = night(mixHex(c.leaf, '#1E4A22', c.dark ? 0.12 : 0.22));
  const leafBase = night(c.leaf);
  // Lit toward the light's colour, shaded toward a cool dark: a touch either way.
  const lightAt = (hex: string, lit: number) => (lit > 0 ? mixHex(hex, light!.tint, 0.22 * lit) : lit < 0 ? mixHex(hex, '#1B2A3A', 0.08 * -lit) : hex);
  const centreBase = night(CENTRE_COLOR);
  return (canvas: SkCanvas, s: Sprig) => {
    const lit = light ? light.lit(s.x) : 0;
    // Far off, a flower takes on the colour of the air in between, as the field does under it.
    const far = fade ? fade(s.y) : 0;
    const tone = (hex: string) => (far > 0 ? mixHex(hex, look.horizon, far) : hex);
    stem.setColor(Skia.Color(tone(lightAt(stemBase, lit))));
    leaf.setColor(Skia.Color(tone(lightAt(leafBase, lit))));
    centre.setColor(Skia.Color(tone(centreBase)));
    if (s.r < 2.4) {
      petal.setColor(Skia.Color(tone(lightAt(night(s.color), lit))));
      canvas.drawCircle(s.x, s.y - s.r * 2, Math.max(0.8, s.r * 0.9), petal);
      return;
    }
    const g = geometry(s);
    canvas.save();
    canvas.translate(s.x, s.y);
    // Each shape is let go of once drawn (the picture keeps its own copy): see built().
    const stemShape = stemPath(0, 0, g.ctrl.x, g.ctrl.y, g.top.x, g.top.y, Math.max(1, s.r * s.stemW), Math.max(0.8, s.r * s.stemW * 0.62));
    canvas.drawPath(stemShape, stem);
    stemShape.dispose();
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
      shape.dispose();
    }
    const head = flowerPath(g.top.x, g.top.y, s.r, 1, 5, s.rot);
    if (isWhite(s.color)) {
      petal.setColor(Skia.Color(tone(lightAt(night(mixHex(s.color, '#8A7A5C', 0.35)), lit))));
      const under = flowerPath(g.top.x, g.top.y + Math.max(0.8, s.r * 0.07), s.r, 1, 5, s.rot);
      canvas.drawPath(under, petal);
      under.dispose();
    }
    petal.setColor(Skia.Color(tone(lightAt(night(s.color), lit))));
    canvas.drawPath(head, petal);
    head.dispose();
    canvas.drawCircle(g.top.x, g.top.y, s.r * CENTRE_R, centre);
    canvas.restore();
  };
}
