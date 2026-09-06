/**
 * Self-hosted fonts. The TTFs live in /assets/fonts and are committed; the
 * @expo-google-fonts packages are NOT a dependency.
 *
 * IMPORTANT RN TRAP: these are static (non-variable) TTFs, so weight is
 * selected by FAMILY NAME. Never emit `fontWeight` in a style — on Android it
 * makes the platform synthesise a fake bold on top of an already-bold face, and
 * on iOS it silently picks the wrong member of the family. Use
 * `displayFamily()` / `bodyFamily()` (or the constants) instead.
 */

export const BarlowCondensed_600SemiBold = 'BarlowCondensed_600SemiBold';
export const BarlowCondensed_700Bold = 'BarlowCondensed_700Bold';
export const BarlowCondensed_800ExtraBold = 'BarlowCondensed_800ExtraBold';
export const Figtree_400Regular = 'Figtree_400Regular';
export const Figtree_500Medium = 'Figtree_500Medium';
export const Figtree_600SemiBold = 'Figtree_600SemiBold';
export const Figtree_700Bold = 'Figtree_700Bold';
export const Figtree_800ExtraBold = 'Figtree_800ExtraBold';

/** Weights available in the display (Barlow Condensed) family. */
export type DisplayWeight = 600 | 700 | 800;
/** Weights available in the body (Figtree) family. */
export type BodyWeight = 400 | 500 | 600 | 700 | 800;

export type FontFamilyName =
  | typeof BarlowCondensed_600SemiBold
  | typeof BarlowCondensed_700Bold
  | typeof BarlowCondensed_800ExtraBold
  | typeof Figtree_400Regular
  | typeof Figtree_500Medium
  | typeof Figtree_600SemiBold
  | typeof Figtree_700Bold
  | typeof Figtree_800ExtraBold;

const DISPLAY: Record<DisplayWeight, FontFamilyName> = {
  600: BarlowCondensed_600SemiBold,
  700: BarlowCondensed_700Bold,
  800: BarlowCondensed_800ExtraBold,
};

const BODY: Record<BodyWeight, FontFamilyName> = {
  400: Figtree_400Regular,
  500: Figtree_500Medium,
  600: Figtree_600SemiBold,
  700: Figtree_700Bold,
  800: Figtree_800ExtraBold,
};

/** Display family (Barlow Condensed) at the given weight. */
export function displayFamily(weight: DisplayWeight): FontFamilyName {
  return DISPLAY[weight];
}

/** Body family (Figtree) at the given weight. */
export function bodyFamily(weight: BodyWeight): FontFamilyName {
  return BODY[weight];
}

/**
 * Map passed to `useFonts()` in App.tsx. The keys are the family names above —
 * they must match what every style references.
 */
export const fontAssets = {
  [BarlowCondensed_600SemiBold]: require('../../assets/fonts/BarlowCondensed_600SemiBold.ttf'),
  [BarlowCondensed_700Bold]: require('../../assets/fonts/BarlowCondensed_700Bold.ttf'),
  [BarlowCondensed_800ExtraBold]: require('../../assets/fonts/BarlowCondensed_800ExtraBold.ttf'),
  [Figtree_400Regular]: require('../../assets/fonts/Figtree_400Regular.ttf'),
  [Figtree_500Medium]: require('../../assets/fonts/Figtree_500Medium.ttf'),
  [Figtree_600SemiBold]: require('../../assets/fonts/Figtree_600SemiBold.ttf'),
  [Figtree_700Bold]: require('../../assets/fonts/Figtree_700Bold.ttf'),
  [Figtree_800ExtraBold]: require('../../assets/fonts/Figtree_800ExtraBold.ttf'),
};
