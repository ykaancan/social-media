/** The 12-step neutral scale (tokens/colors.css). Every semantic colour in
 *  palette.ts resolves to one of these or to a generated oklch value. */
export const ink = {
  0: '#ffffff',
  50: '#f4f4f4',
  100: '#e9e9e9',
  200: '#d4d4d4',
  300: '#b3b3b3',
  400: '#8a8a8a',
  500: '#6b6b6b',
  600: '#505050',
  700: '#383838',
  800: '#262626',
  900: '#171717',
  950: '#0b0b0b',
} as const;

export type InkStep = keyof typeof ink;
