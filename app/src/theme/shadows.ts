/**
 * tokens/colors.css shadow tokens, as CSS `boxShadow` strings.
 * React Native >= 0.76 supports the `boxShadow` style prop directly, so these
 * are the exact CSS values with no elevation/shadowOffset translation.
 */
export const shadows = {
  sheet: '0 -12px 40px rgba(11, 11, 11, 0.16)',
  toast: '0 8px 24px rgba(11, 11, 11, 0.22)',
  fab: '0 6px 18px rgba(11, 11, 11, 0.24)',
} as const;

export type Shadows = typeof shadows;
