/**
 * build-tokens.mjs
 *
 * Converts every oklch() value in the design bundle's token CSS to a 6-digit
 * sRGB hex string, using CSS Color 4 gamut mapping (culori's `toGamut('rgb',
 * 'oklch')` — chroma reduction in OKLCh with a deltaEOK JND of 0.02). This is
 * what Chrome does for out-of-gamut values such as the lime and magenta covers,
 * so the RN build matches the HTML prototypes.
 *
 * Run with: npm run tokens
 * Output:   src/theme/colors.generated.ts   (committed)
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatHex, parse, toGamut } from 'culori';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../src/theme/colors.generated.ts');

const toRgbGamut = toGamut('rgb', 'oklch');

function hex(css) {
  const parsed = parse(css);
  if (!parsed) throw new Error(`culori could not parse: ${css}`);
  const mapped = toRgbGamut(parsed);
  const out = formatHex(mapped);
  if (!/^#[0-9a-f]{6}$/.test(out)) throw new Error(`bad hex for ${css}: ${out}`);
  return out;
}

/** Canonical cover order — do not reorder, indexes are load-bearing. */
const COVER_NAMES = ['magenta', 'coral', 'tangerine', 'amber', 'lime', 'mint', 'azure', 'violet'];

/** Avatar hue ring — same hue order as the covers (Avatar.jsx HUES). */
const AVATAR_HUES = [350, 25, 60, 90, 130, 170, 240, 295];

const COVERS = {
  magenta: { cover: 'oklch(0.68 0.19 350)', soft: 'oklch(0.95 0.04 350)' },
  coral: { cover: 'oklch(0.68 0.19 25)', soft: 'oklch(0.95 0.04 25)' },
  tangerine: { cover: 'oklch(0.72 0.19 60)', soft: 'oklch(0.96 0.04 60)' },
  amber: { cover: 'oklch(0.8 0.17 90)', soft: 'oklch(0.97 0.05 90)' },
  lime: { cover: 'oklch(0.78 0.19 130)', soft: 'oklch(0.96 0.05 130)' },
  mint: { cover: 'oklch(0.76 0.15 170)', soft: 'oklch(0.96 0.04 170)' },
  azure: { cover: 'oklch(0.68 0.17 240)', soft: 'oklch(0.95 0.03 240)' },
  violet: { cover: 'oklch(0.64 0.19 295)', soft: 'oklch(0.95 0.04 295)' },
};

const STATUS = {
  live: 'oklch(0.72 0.19 145)',
  liveSoft: 'oklch(0.95 0.06 145)',
  danger: 'oklch(0.6 0.22 27)',
  dangerSoft: 'oklch(0.95 0.04 27)',
  warning: 'oklch(0.8 0.16 80)',
  warningSoft: 'oklch(0.97 0.05 80)',
};

const ANON = {
  hintApp: 'oklch(0.5 0.16 295)',
  hintBgApp: 'oklch(0.95 0.04 295)',
  hintProjector: 'oklch(0.82 0.1 295)',
  hintBgProjector: 'oklch(0.3 0.06 295)',
};

function line(key, css, indent = '  ') {
  return `${indent}${key}: '${hex(css)}', // ${css}`;
}

const body = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Produced by scripts/build-tokens.mjs from the design bundle's oklch() token
 * values, gamut-mapped to sRGB per CSS Color 4 (culori toGamut('rgb','oklch')).
 * Regenerate with: npm run tokens
 *
 * The oklch() source of each value is kept in a trailing comment.
 */

export type CoverName = ${COVER_NAMES.map((n) => `'${n}'`).join(' | ')};

/** Canonical cover order. Indexes are load-bearing (avatarTints shares them). */
export const coverNames: readonly CoverName[] = [
${COVER_NAMES.map((n) => `  '${n}',`).join('\n')}
] as const;

export const covers: Record<CoverName, { cover: string; soft: string }> = {
${COVER_NAMES.map(
  (n) =>
    `  ${n}: { cover: '${hex(COVERS[n].cover)}', soft: '${hex(COVERS[n].soft)}' }, // ${
      COVERS[n].cover
    } / ${COVERS[n].soft}`
).join('\n')}
};

/** Avatar initial tints: oklch(0.9 0.06 H), H in the cover hue order. */
export const avatarHues: readonly number[] = [${AVATAR_HUES.join(', ')}] as const;

export const avatarTints: readonly string[] = [
${AVATAR_HUES.map((h) => `  '${hex(`oklch(0.9 0.06 ${h})`)}', // oklch(0.9 0.06 ${h})`).join('\n')}
] as const;

/** Status colours (shared by both schemes). */
export const status = {
${Object.entries(STATUS)
  .map(([k, v]) => line(k, v))
  .join('\n')}
} as const;

/** Hint-level anonymity colours; the only anon colours that differ per scheme. */
export const anonHint = {
  app: { fg: '${hex(ANON.hintApp)}', bg: '${hex(ANON.hintBgApp)}' }, // ${ANON.hintApp} / ${
    ANON.hintBgApp
  }
  projector: { fg: '${hex(ANON.hintProjector)}', bg: '${hex(ANON.hintBgProjector)}' }, // ${
    ANON.hintProjector
  } / ${ANON.hintBgProjector}
} as const;
`;

writeFileSync(OUT, body, 'utf8');
console.log(`wrote ${OUT}`);
