import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { covers, type CoverName } from './colors.generated';
import { palette } from './palette';

export interface EventColor {
  /** null when an explicit {cover, soft} pair was supplied rather than a name. */
  name: CoverName | null;
  cover: string;
  soft: string;
  onCover: string;
}

/**
 * Replaces the CSS `--event` / `--event-soft` custom properties. Wrap an event
 * board (or an event card) in this and every child reads the event's cover
 * colour from `useEventColor()`.
 */
function resolve(value: CoverName | { cover: string; soft: string }): EventColor {
  const onCover = palette('app').onCover;
  if (typeof value === 'string') {
    return { name: value, ...covers[value], onCover };
  }
  return { name: null, cover: value.cover, soft: value.soft, onCover };
}

/** tokens/colors.css: the default event colour is magenta. */
export const DEFAULT_COVER: CoverName = 'magenta';

const EventColorContext = createContext<EventColor>(resolve(DEFAULT_COVER));

export interface EventColorProviderProps {
  cover?: CoverName | { cover: string; soft: string };
  children: ReactNode;
}

export function EventColorProvider({ cover = DEFAULT_COVER, children }: EventColorProviderProps) {
  const value = useMemo(() => resolve(cover), [cover]);
  return <EventColorContext.Provider value={value}>{children}</EventColorContext.Provider>;
}

export function useEventColor(): EventColor {
  return useContext(EventColorContext);
}
