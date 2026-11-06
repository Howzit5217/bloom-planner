/**
 * Design tokens. Soft, warm, papery, alive: a meadow under paper cut-out cards,
 * with the game's chunky yellow-and-brown numbers and deep green panels.
 *
 * Contrast notes (WCAG): body text pairs are >= 4.5:1 in both themes.
 * `inkSoft` is a touch darker than the brief's #7D7366 so it passes on the canvas.
 * White button labels sit on `button` (#43853F, 4.5:1) rather than `leaf`.
 */
export interface Palette {
  dark: boolean;
  canvas: string;
  canvasDeep: string;
  card: string;
  cardHighlight: string;
  ink: string;
  inkSoft: string;
  leaf: string;
  leafDeep: string;
  leafPale: string;
  button: string;
  buttonPressed: string;
  onButton: string;
  petalRed: string;
  petalYellow: string;
  petalBlue: string;
  petalWhite: string;
  petalPurple: string;
  /** The extreme plan's flower: deep purple, like a Purple Pikmin. */
  petalExtreme: string;
  nectar: string;
  alert: string;
  alertPale: string;
  shadow: string;
  meadowTop: string;
  meadowMid: string;
  meadowBottom: string;
  grassBlade: string;
  panel: string;
  onPanel: string;
  onPanelSoft: string;
  panelTrack: string;
  gameYellow: string;
  gameOutline: string;
  goldLight: string;
  gold: string;
  goldDeep: string;
  teal: string;
  scrim: string;
  divider: string;
  /** Quiet grey tiles, like the intro's back button. */
  tile: string;
  tilePressed: string;
}

export const light: Palette = {
  dark: false,
  canvas: '#FBF7EC',
  canvasDeep: '#F2EADA',
  card: '#FFFDF8',
  cardHighlight: 'rgba(255,255,255,0.95)',
  ink: '#3A3226',
  inkSoft: '#6E6455',
  leaf: '#5BA85A',
  leafDeep: '#3C7A3E',
  leafPale: '#DCEEDA',
  button: '#43853F',
  buttonPressed: '#336B31',
  onButton: '#FFFFFF',
  petalRed: '#E8614D',
  petalYellow: '#F2C14E',
  petalBlue: '#5B9BD5',
  petalWhite: '#FFFFFF',
  petalPurple: '#9B7CC4',
  petalExtreme: '#5B2D8E',
  nectar: '#F6A623',
  alert: '#D9644A',
  alertPale: '#FBE3DA',
  shadow: 'rgba(120,100,70,0.12)',
  meadowTop: '#D8F0B8',
  meadowMid: '#A9DB7E',
  meadowBottom: '#78BE55',
  grassBlade: '#5FA845',
  panel: 'rgba(52,110,54,0.94)',
  onPanel: '#FFFFFF',
  onPanelSoft: 'rgba(255,255,255,0.86)',
  panelTrack: 'rgba(16,52,20,0.45)',
  gameYellow: '#FFD84D',
  gameOutline: '#8A5200',
  goldLight: '#FFE07A',
  gold: '#F2B530',
  goldDeep: '#B8740C',
  teal: '#22A88E',
  scrim: 'rgba(36,31,24,0.45)',
  divider: 'rgba(58,50,38,0.08)',
  tile: '#E7E2D9',
  tilePressed: '#DAD4C9',
};

export const dark: Palette = {
  dark: true,
  canvas: '#241F18',
  canvasDeep: '#1B1712',
  card: '#30291F',
  cardHighlight: 'rgba(255,240,210,0.07)',
  ink: '#F2EADA',
  inkSoft: '#BCB1A0',
  leaf: '#6CB36A',
  leafDeep: '#9CD597',
  leafPale: '#34432F',
  button: '#43853F',
  buttonPressed: '#336B31',
  onButton: '#FFFFFF',
  // Petals desaturated ~15% for the dark theme.
  petalRed: '#D46B5A',
  petalYellow: '#E1BE64',
  petalBlue: '#6A99C6',
  petalWhite: '#EDE8DF',
  petalPurple: '#988AB6',
  petalExtreme: '#7148A6',
  nectar: '#E3A440',
  alert: '#E58067',
  alertPale: '#4A2C22',
  shadow: 'rgba(0,0,0,0.35)',
  meadowTop: '#20301E',
  meadowMid: '#1A2817',
  meadowBottom: '#132011',
  grassBlade: '#2C4A25',
  panel: 'rgba(38,78,40,0.95)',
  onPanel: '#FFFFFF',
  onPanelSoft: 'rgba(255,255,255,0.8)',
  panelTrack: 'rgba(0,0,0,0.35)',
  gameYellow: '#F6D157',
  gameOutline: '#5E3A00',
  goldLight: '#F7D772',
  gold: '#E0A72E',
  goldDeep: '#93600E',
  teal: '#3DB79D',
  scrim: 'rgba(0,0,0,0.55)',
  divider: 'rgba(242,234,218,0.08)',
  tile: '#3A342C',
  tilePressed: '#474037',
};

export const PETALS = (p: Palette) => [p.petalRed, p.petalYellow, p.petalBlue, p.petalWhite, p.petalPurple];

export const radius = { card: 24, cardLg: 28, pill: 999, field: 18 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Default spring for everything that moves. */
export const SPRING = { damping: 14, stiffness: 120, mass: 1 } as const;

export const font = {
  heading: 'Baloo2_800ExtraBold',
  headingBold: 'Baloo2_700Bold',
  body: 'Nunito_400Regular',
  bodySemi: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyHeavy: 'Nunito_800ExtraBold',
} as const;
