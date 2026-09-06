import React, { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Monetisation gates. Every one of these is a SERVER-side config flag in the
 * real product; this provider only mirrors what the server said so the UI can
 * render the right state.
 *
 * Stage 1: all gates OFF. With `lockedCards: false`, LockedCard must render as
 * an ordinary card — no hatch, no dashed border, no blurred bars, no lock
 * badge [D3]. The locked treatment is still built and tested so that it can
 * appear the day the flag flips.
 */
export interface Entitlements {
  lockedCards: boolean;
}

export const DEFAULT_ENTITLEMENTS: Entitlements = { lockedCards: false };

const EntitlementsContext = createContext<Entitlements>(DEFAULT_ENTITLEMENTS);

export interface EntitlementsProviderProps {
  value?: Partial<Entitlements>;
  children: ReactNode;
}

export function EntitlementsProvider({ value, children }: EntitlementsProviderProps) {
  const merged = useMemo(() => ({ ...DEFAULT_ENTITLEMENTS, ...value }), [value]);
  return <EntitlementsContext.Provider value={merged}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): Entitlements {
  return useContext(EntitlementsContext);
}
