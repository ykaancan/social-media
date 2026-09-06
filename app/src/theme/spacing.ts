/** tokens/spacing.css. Numbers, not strings — RN styles take numbers. */
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64,
  /** horizontal screen gutter */
  screenX: 16,
  /** padding inside a card */
  cardPad: 16,
  /** default gap between stacked cards */
  stackGap: 12,
  /** minimum tap target (accessibility floor) */
  tapMin: 44,
  /** reserved bottom band for one-handed reach */
  thumbZone: 96,
} as const;

export type Space = typeof space;
