import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { HttpApi } from './http';
import { mockApi } from './mock';
import type { ApiClient } from './types';

/**
 * Picks the client from the environment.
 *
 * - `EXPO_PUBLIC_API_URL` set → the real `HttpApi` against that origin, in dev
 *   and in production alike. Point it at a laptop's LAN address to run the app
 *   against a local Spring Boot.
 * - unset, in dev → the in-memory `MockApi`, so the whole onboarding flow can be
 *   walked before the backend exists (step 3).
 * - unset, in production → throws. A shipped build silently talking to a fake
 *   backend would be the worst of the three, and the brief forbids fake data
 *   anywhere near a user.
 */
export function createApi(): ApiClient {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (baseUrl) return new HttpApi(baseUrl);
  if (__DEV__) return mockApi();
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. A production build must point at a real backend; ' +
      'see .env.example.',
  );
}

const ApiContext = createContext<ApiClient | null>(null);

export interface ApiProviderProps {
  /** Injected in tests and in the gallery. Defaults to `createApi()`. */
  api?: ApiClient;
  children: ReactNode;
}

export function ApiProvider({ api, children }: ApiProviderProps) {
  // Lazy, and created once: a client owns the bearer token, so re-creating it
  // on a re-render would drop the session.
  const [client] = useState<ApiClient>(() => api ?? createApi());
  return <ApiContext.Provider value={api ?? client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi() must be used inside <ApiProvider>.');
  return api;
}
