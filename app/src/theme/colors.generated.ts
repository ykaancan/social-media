/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Produced by scripts/build-tokens.mjs from the design bundle's oklch() token
 * values, gamut-mapped to sRGB per CSS Color 4 (culori toGamut('rgb','oklch')).
 * Regenerate with: npm run tokens
 *
 * The oklch() source of each value is kept in a trailing comment.
 */

export type CoverName = 'magenta' | 'coral' | 'tangerine' | 'amber' | 'lime' | 'mint' | 'azure' | 'violet';

/** Canonical cover order. Indexes are load-bearing (avatarTints shares them). */
export const coverNames: readonly CoverName[] = [
  'magenta',
  'coral',
  'tangerine',
  'amber',
  'lime',
  'mint',
  'azure',
  'violet',
] as const;

export const covers: Record<CoverName, { cover: string; soft: string }> = {
  magenta: { cover: '#ea5da9', soft: '#ffe4f2' }, // oklch(0.68 0.19 350) / oklch(0.95 0.04 350)
  coral: { cover: '#f75d59', soft: '#ffe5e1' }, // oklch(0.68 0.19 25) / oklch(0.95 0.04 25)
  tangerine: { cover: '#f78100', soft: '#ffecd8' }, // oklch(0.72 0.19 60) / oklch(0.96 0.04 60)
  amber: { cover: '#e8b700', soft: '#fff4d0' }, // oklch(0.8 0.17 90) / oklch(0.97 0.05 90)
  lime: { cover: '#8ece34', soft: '#e7f9d6' }, // oklch(0.78 0.19 130) / oklch(0.96 0.05 130)
  mint: { cover: '#04cfa2', soft: '#d9fbee' }, // oklch(0.76 0.15 170) / oklch(0.96 0.04 170)
  azure: { cover: '#00a2f5', soft: '#ddf2ff' }, // oklch(0.68 0.17 240) / oklch(0.95 0.03 240)
  violet: { cover: '#976ef1', soft: '#f0eaff' }, // oklch(0.64 0.19 295) / oklch(0.95 0.04 295)
};

/** Avatar initial tints: oklch(0.9 0.06 H), H in the cover hue order. */
export const avatarHues: readonly number[] = [350, 25, 60, 90, 130, 170, 240, 295] as const;

export const avatarTints: readonly string[] = [
  '#fecee4', // oklch(0.9 0.06 350)
  '#ffcfca', // oklch(0.9 0.06 25)
  '#fdd5b7', // oklch(0.9 0.06 60)
  '#edddb1', // oklch(0.9 0.06 90)
  '#d1e7bd', // oklch(0.9 0.06 130)
  '#b7ecd8', // oklch(0.9 0.06 170)
  '#bbe4ff', // oklch(0.9 0.06 240)
  '#e0d7ff', // oklch(0.9 0.06 295)
] as const;

/** Status colours (shared by both schemes). */
export const status = {
  live: '#43c251', // oklch(0.72 0.19 145)
  liveSoft: '#d6fad6', // oklch(0.95 0.06 145)
  danger: '#e62c2c', // oklch(0.6 0.22 27)
  dangerSoft: '#ffe5e0', // oklch(0.95 0.04 27)
  warning: '#f3b01d', // oklch(0.8 0.16 80)
  warningSoft: '#fff2d0', // oklch(0.97 0.05 80)
} as const;

/** Hint-level anonymity colours; the only anon colours that differ per scheme. */
export const anonHint = {
  app: { fg: '#6c4ab3', bg: '#f0eaff' }, // oklch(0.5 0.16 295) / oklch(0.95 0.04 295)
  projector: { fg: '#c8b7ff', bg: '#302749' }, // oklch(0.82 0.1 295) / oklch(0.3 0.06 295)
} as const;
