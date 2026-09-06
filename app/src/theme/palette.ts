import { anonHint, status } from './colors.generated';
import { ink } from './ink';

/**
 * Two colour schemes only. `projector` is the single dark scope in the design
 * bundle (tokens/themes.css `[data-theme="projector"]`); it is not a user
 * setting and there is no OS dark mode in stage 1.
 */
export type Scheme = 'app' | 'projector';

export interface Palette {
  bg: string;
  bgSunken: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  text2: string;
  text3: string;
  textInverse: string;
  primary: string;
  primaryHover: string;
  primaryPress: string;
  onPrimary: string;
  /** rgba string; the CSS token is a 3px outer ring of this colour. */
  focusRing: string;
  live: string;
  liveSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  anonAnonymous: string;
  anonAnonymousBg: string;
  anonHint: string;
  anonHintBg: string;
  anonNamed: string;
  anonNamedBg: string;
  lockedBg: string;
  lockedBorder: string;
  /** rgba of the 135deg hatch line (the gradient itself is drawn in SVG). */
  lockedHatchStroke: string;
  lockedBlur: number;
  onCover: string;
}

const app: Palette = {
  bg: ink[0],
  bgSunken: ink[50],
  surface: ink[0],
  surfaceRaised: ink[0],
  surfaceMuted: ink[50],
  border: ink[100],
  borderStrong: ink[200],
  text: ink[900],
  text2: ink[500],
  text3: ink[400],
  textInverse: ink[0],
  primary: ink[900],
  primaryHover: ink[800],
  primaryPress: ink[950],
  onPrimary: ink[0],
  focusRing: 'rgba(23, 23, 23, 0.18)',
  live: status.live,
  liveSoft: status.liveSoft,
  danger: status.danger,
  dangerSoft: status.dangerSoft,
  warning: status.warning,
  warningSoft: status.warningSoft,
  success: status.live, // --success: live
  anonAnonymous: ink[900],
  anonAnonymousBg: ink[100],
  anonHint: anonHint.app.fg,
  anonHintBg: anonHint.app.bg,
  anonNamed: ink[900],
  anonNamedBg: 'transparent',
  lockedBg: ink[50],
  lockedBorder: ink[300],
  lockedHatchStroke: 'rgba(23, 23, 23, 0.04)',
  lockedBlur: 7,
  onCover: ink[950],
};

const projector: Palette = {
  ...app,
  bg: ink[950],
  bgSunken: '#000000',
  surface: ink[900],
  surfaceRaised: ink[800],
  surfaceMuted: ink[900],
  border: ink[800],
  borderStrong: ink[700],
  text: '#fafafa',
  text2: ink[300],
  text3: ink[500],
  textInverse: ink[950],
  primary: '#fafafa',
  primaryHover: ink[100],
  primaryPress: ink[200],
  onPrimary: ink[950],
  anonAnonymous: '#fafafa',
  anonAnonymousBg: ink[800],
  anonHint: anonHint.projector.fg,
  anonHintBg: anonHint.projector.bg,
  // tokens/themes.css does not override --anon-named in the projector scope
  // (a bundle omission: it would inherit ink-900 on an ink-950 canvas). The
  // web AnonymityBadge renders the name with --text anyway, so `text` is the
  // value that is actually used; keep anonNamed in step with it.
  anonNamed: '#fafafa',
  lockedBg: ink[900],
  lockedBorder: ink[600],
  lockedHatchStroke: 'rgba(250, 250, 250, 0.05)',
};

const PALETTES: Record<Scheme, Palette> = { app, projector };

export function palette(scheme: Scheme = 'app'): Palette {
  return PALETTES[scheme];
}

/**
 * `#rrggbb` + alpha → `rgba(r, g, b, a)`. Used for the live-pulse ring, which
 * needs the live (or warning) colour at 55% (tokens/motion.css live-pulse).
 */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`withAlpha expects #rrggbb, got: ${hex}`);
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
