import type { TextStyle } from 'react-native';
import { bodyFamily, displayFamily } from './fonts';

/**
 * tokens/typography.css → RN text styles.
 *
 * - `lineHeight` is Math.round(fontSize x ratio) in px (RN has no unitless
 *   line-height).
 * - `letterSpacing` is px, converted from the CSS `em` tracking with
 *   `tracking(em, size)`.
 * - Weight is carried by `fontFamily` only. NEVER add `fontWeight` here: the
 *   TTFs are static faces (see theme/fonts.ts).
 * - `includeFontPadding: false` on the display styles — Android adds font
 *   padding that clips ascenders when lineHeight < the face's natural height,
 *   which is the case for every display token (ratios 0.9-1.05).
 *   TODO: verify on a physical Android device once a screen exists.
 */

/** CSS `em` tracking → RN px letterSpacing at a given font size. */
export function tracking(em: number, size: number): number {
  return em * size;
}

/** --display-tracking: -0.01em */
export const displayTrackingEm = -0.01;
/** --display-caps-tracking: 0.02em (uppercase display runs) */
export const displayCapsTrackingEm = 0.02;
/** --caption-caps-tracking: 0.08em */
export const captionCapsTrackingEm = 0.08;

/**
 * --meta-nums: "tnum" 1, "cv11" 1
 * RN exposes tabular figures via fontVariant. There is no RN equivalent for
 * the `cv11` character variant (the disambiguated single-storey l/1); it is
 * dropped, and the numerals still line up because tnum is what matters.
 */
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

const display = (
  weight: 600 | 700 | 800,
  fontSize: number,
  ratio: number
): TextStyle => ({
  fontFamily: displayFamily(weight),
  fontSize,
  lineHeight: Math.round(fontSize * ratio),
  letterSpacing: tracking(displayTrackingEm, fontSize),
  includeFontPadding: false,
});

const bodyOf = (
  weight: 400 | 500 | 600 | 700,
  fontSize: number,
  ratio: number,
  letterSpacing?: number
): TextStyle => ({
  fontFamily: bodyFamily(weight),
  fontSize,
  lineHeight: Math.round(fontSize * ratio),
  ...(letterSpacing === undefined ? null : { letterSpacing }),
});

export const typography = {
  displayXl: display(800, 64, 0.92),
  displayLg: display(800, 44, 0.95),
  displayMd: display(700, 32, 1),
  displaySm: display(700, 24, 1.05),

  title: bodyOf(600, 20, 1.25),
  titleSm: bodyOf(600, 17, 1.3),
  body: bodyOf(400, 16, 1.45),
  bodyStrong: bodyOf(600, 16, 1.45),
  bodySm: bodyOf(400, 14, 1.4),
  bodySmStrong: bodyOf(600, 14, 1.4),
  caption: bodyOf(500, 12, 1.3),
  captionCaps: bodyOf(700, 11, 1.2, tracking(captionCapsTrackingEm, 11)),

  post: bodyOf(500, 18, 1.35),
  postLg: bodyOf(500, 22, 1.3),

  projectorPost: bodyOf(700, 72, 1.1),
  projectorPostShort: bodyOf(700, 96, 1.05),
  projectorMeta: display(700, 40, 1.1),
  projectorTitle: display(800, 120, 0.9),
} as const;

export type TypographyVariant = keyof typeof typography;
export type Typography = typeof typography;
