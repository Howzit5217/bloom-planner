// Home's camera over the meadow: the geometry, kept apart from the drawing so it can be tested.

/**
 * Home's backdrop seen through a camera. The scene (sky and field, the flowers sized and spaced by
 * how far off they are) is drawn once as a level camera sees it; scrolling tilts the camera down
 * through it. A camera turning about itself maps the level view to the tilted one by a perspective
 * transform, so the horizon climbs, the far field rises slowly and the near field sweeps up faster
 * and closer, until the field fills the screen.
 */
export interface CameraFrame {
  W: number;
  H: number;
  /** The horizon on screen with the camera level: about half way down, as in the game. */
  cy: number;
  /** Focal length, in points: the screen height a little under 1:1, a natural phone-camera view. */
  F: number;
  /** The most the camera tilts down (radians): until the horizon has just left the top of the screen. */
  tiltMax: number;
  /** The scene as the level camera sees it, wider and deeper than the screen for the tilt to reach. */
  pad: number;
  picW: number;
  picH: number;
  /**
   * How tall the drawing is on screen: the frame's height plus whatever lies below it under the
   * system's navigation bar (Android draws the app there too, past the window's height).
   */
  viewH: number;
}

export function cameraFrame(W: number, H: number, cy: number, below = 0): CameraFrame {
  const F = H * 0.9;
  const tiltMax = Math.atan((cy + 36) / F);
  // The bottom of the drawing (the screen's, and anything under the navigation bar below it) at the
  // full tilt looks this far below the horizon in the level view, and that far down the view has to
  // be this much wider than the screen.
  const groundMax = F * Math.tan(Math.atan((H + below - cy) / F) + tiltMax) + 24;
  const widen = (Math.sin(tiltMax) / F) * groundMax + Math.cos(tiltMax);
  const pad = Math.ceil((W / 2) * (widen - 1) + 16);
  return { W, H, cy, F, tiltMax, pad, picW: W + pad * 2, picH: Math.ceil(cy + groundMax), viewH: H + below };
}

/** The tilt at a share of the way down (0 to 1), easing into its last stop like a camera settling. */
export function tiltAt(f: CameraFrame, p: number): number {
  'worklet';
  const t = Math.min(1, Math.max(0, p));
  return (t + t * t - t * t * t) * f.tiltMax;
}

/** Where the horizon is on screen at a share of the tilt. */
export function horizonAt(f: CameraFrame, p: number): number {
  'worklet';
  return f.cy - f.F * Math.tan(tiltAt(f, p));
}

/** The camera tilted down by `phi`: the matrix (row by row) from the level scene to the screen. */
export function cameraMatrix(f: CameraFrame, phi: number): number[] {
  'worklet';
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const q = s / f.F;
  const half = f.W / 2;
  return [1, half * q, -(f.pad + half) - half * q * f.cy + half * c, 0, c + f.cy * q, -f.F * s - f.cy * f.cy * q, 0, q, c - f.cy * q];
}
