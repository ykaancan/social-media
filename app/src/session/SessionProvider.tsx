import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import {
  ApiError,
  isApiError,
  useApi,
  type AuthResult,
  type LoginRequest,
  type Me,
  type ProfileRequest,
  type RegisterRequest,
} from '../api';
import { clearTokens, loadTokens, saveTokens } from './storage';

/**
 * Who is signed in, and the four verbs that change that.
 *
 * This is the only place tokens, storage and `Me` meet. Screens ask for
 * `useSession()`; they never touch `ApiClient.setTokens` or the keychain.
 */

export type SessionPhase = 'booting' | 'signedOut' | 'signedIn';

export interface SessionState {
  phase: SessionPhase;
  /** Non-null exactly when `phase === 'signedIn'`. */
  me: Me | null;
  /**
   * Set when the boot could not reach the server. The tokens are KEPT and the
   * phase stays `booting`, because "the wifi is bad" must never look like
   * "you were signed out" — the UI offers `retryBoot` instead.
   */
  bootError: ApiError | null;
}

type Action =
  | { type: 'boot/retry' }
  | { type: 'boot/error'; error: ApiError }
  | { type: 'signedIn'; me: Me }
  | { type: 'signedOut' }
  | { type: 'me'; me: Me };

const INITIAL: SessionState = { phase: 'booting', me: null, bootError: null };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'boot/retry':
      return { ...state, phase: 'booting', bootError: null };
    case 'boot/error':
      return { ...state, phase: 'booting', bootError: action.error };
    case 'signedIn':
      return { phase: 'signedIn', me: action.me, bootError: null };
    case 'signedOut':
      return { phase: 'signedOut', me: null, bootError: null };
    case 'me':
      // A `me` refresh that arrives after a sign-out must not resurrect it.
      return state.phase === 'signedIn' ? { ...state, me: action.me } : state;
    default:
      return state;
  }
}

export interface SessionValue extends SessionState {
  /** Creates an `incomplete` account and signs in. Resolves with the new `Me`. */
  register(req: RegisterRequest): Promise<Me>;
  login(req: LoginRequest): Promise<Me>;
  logout(): Promise<void>;
  /** Always resolves — the server answers the same whether the address exists or not. */
  forgotPassword(email: string): Promise<void>;
  /** Sends the profile for review. The resulting `Me` is `pending`. */
  submitProfile(req: ProfileRequest): Promise<Me>;
  /** Re-reads `GET /me`. This is what the Pending screen polls. */
  refreshMe(): Promise<void>;
  /** Retries a boot that failed with `bootError`. */
  retryBoot(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const api = useApi();
  const [state, dispatch] = useReducer(reducer, INITIAL);

  /**
   * Boot: stored tokens → `GET /me`. No tokens, or a session the server no
   * longer honours, means signed out. Anything else is kept for a retry.
   */
  const boot = useCallback(async () => {
    const tokens = await loadTokens();
    if (!tokens) {
      dispatch({ type: 'signedOut' });
      return;
    }
    api.setTokens(tokens);
    try {
      dispatch({ type: 'signedIn', me: await api.me() });
    } catch (err) {
      if (isApiError(err, 'unauthorized')) {
        await clearTokens();
        api.setTokens(null);
        dispatch({ type: 'signedOut' });
        return;
      }
      dispatch({
        type: 'boot/error',
        error: isApiError(err) ? err : new ApiError('unknown', String(err)),
      });
    }
  }, [api]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // A 401 the client could not refresh means the session is gone for good.
  useEffect(() => {
    api.onUnauthorized?.(() => {
      void clearTokens();
      dispatch({ type: 'signedOut' });
    });
  }, [api]);

  const value = useMemo<SessionValue>(() => {
    const authenticate = async (result: AuthResult) => {
      await saveTokens(result.tokens);
      api.setTokens(result.tokens);
      dispatch({ type: 'signedIn', me: result.me });
      return result.me;
    };

    return {
      ...state,

      register: (req) => api.register(req).then(authenticate),

      login: (req) => api.login(req).then(authenticate),

      async logout() {
        try {
          await api.logout();
        } finally {
          // Local sign-out is unconditional: a server that did not answer must
          // not leave the person looking signed in.
          api.setTokens(null);
          await clearTokens();
          dispatch({ type: 'signedOut' });
        }
      },

      forgotPassword: (email) => api.forgotPassword(email),

      async submitProfile(req) {
        const me = await api.submitProfile(req);
        dispatch({ type: 'me', me });
        return me;
      },

      async refreshMe() {
        try {
          dispatch({ type: 'me', me: await api.me() });
        } catch (err) {
          if (isApiError(err, 'unauthorized')) {
            await clearTokens();
            api.setTokens(null);
            dispatch({ type: 'signedOut' });
            return;
          }
          // A poll that missed the network is not an event: the Pending screen
          // simply keeps the state it had and tries again on its own interval.
          if (isApiError(err, 'network')) return;
          throw err;
        }
      },

      retryBoot() {
        dispatch({ type: 'boot/retry' });
        return boot();
      },
    };
  }, [api, boot, state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession() must be used inside <SessionProvider>.');
  return session;
}
