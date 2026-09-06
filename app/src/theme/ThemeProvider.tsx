import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { palette, type Palette, type Scheme } from './palette';
import { radius, borderWidth, type Radius } from './radius';
import { shadows, type Shadows } from './shadows';
import { space, type Space } from './spacing';
import { typography, type Typography } from './typography';

export interface Theme {
  scheme: Scheme;
  colors: Palette;
  text: Typography;
  space: Space;
  radius: Radius;
  borderWidth: typeof borderWidth;
  shadows: Shadows;
}

function buildTheme(scheme: Scheme): Theme {
  return {
    scheme,
    colors: palette(scheme),
    text: typography,
    space,
    radius,
    borderWidth,
    shadows,
  };
}

const APP_THEME = buildTheme('app');

const ThemeContext = createContext<Theme>(APP_THEME);

export interface ThemeProviderProps {
  /** Defaults to 'app'. Nest a 'projector' provider to scope the dark palette. */
  scheme?: Scheme;
  children: ReactNode;
}

export function ThemeProvider({ scheme = 'app', children }: ThemeProviderProps) {
  const value = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
