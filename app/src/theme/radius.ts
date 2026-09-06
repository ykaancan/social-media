/** tokens/spacing.css radii. `pill` is 999 (RN clamps to half the height). */
export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
  /** aliases from the CSS */
  card: 14, // --r-card: r-lg
  input: 10, // --r-input: r-md
  button: 999, // --r-button: pill
  chip: 999, // --r-chip: pill
  /** --r-sheet: 20 20 0 0 */
  sheetTop: 20,
} as const;

export const borderWidth = {
  base: 1, // --border-w
  strong: 2, // --border-w-strong
} as const;

export type Radius = typeof radius;
