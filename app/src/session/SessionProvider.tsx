import { removePref } from '../prefs';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
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
  /**
   * `Date.now()` at the moment `register` succeeded in this app run, or null
   * when the session came from a login or from stored tokens. Not persisted.
   * The Confirm-email screen uses it: the sign-up mail has just gone out, and
   * the server sends no second link for 60 seconds (TENANT_PLAN.md P3).
   */
  registeredAt: number | null;
  /** Creates an `incomplete`, unconfirmed account [D18] and signs in. Resolves with the new `Me`. */
  register(req: RegisterRequest): Promise<Me>;
  login(req: LoginRequest): Promise<Me>;
  logout(): Promise<void>;
  /**
   * Runs `cb` before the tokens are cleared on sign-out, while the server still
   * accepts them — for work that needs the dying session (unregistering this
   * device's push token). Best effort: a callback that throws or takes longer
   * than two seconds does not stop the sign-out. Returns the unsubscribe.
   */
  onBeforeLogout(cb: () => Promise<void>): () => void;
  deleteAccount(): Promise<void>;
  /** Always resolves — the server answers the same whether the address exists or not. */
  forgotPassword(email: string): Promise<void>;
  /** Sends the profile. The resulting `Me` is `active` [D14]. */
  submitProfile(req: ProfileRequest): Promise<Me>;
  /**
   * Re-reads `GET /me` and resolves with the new `Me`, or `undefined` when the
   * session turned out to be gone (signed out). A network failure is swallowed
   * (also `undefined`) — a poll that missed is not an event — unless
   * `throwOnNetwork` is set: the Confirm-email button must tell the person [D18].
   */
  refreshMe(options?: { throwOnNetwork?: boolean }): Promise<Me | undefined>;
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
  /** When this app run signed the account up; see `SessionValue.registeredAt`. */
  const registeredAt = useRef<number | null>(null);
  /** Pre-logout work registered by hooks (see `onBeforeLogout`). */
  const beforeLogout = useRef(new Set<() => Promise<void>>());

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

      registeredAt: registeredAt.current,

      register: (req) =>
        api.register(req).then((result) => {
          // Set before the state change, so the screen that opens next reads it.
          registeredAt.current = Date.now();
          return authenticate(result);
        }),

      login: (req) =>
        api.login(req).then((result) => {
          registeredAt.current = null;
          return authenticate(result);
        }),

      async logout() {
        try {
          // Callbacks run while the tokens are still valid; none may delay the
          // sign-out by more than a moment or fail it.
          const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
          await Promise.race([
            Promise.allSettled([...beforeLogout.current].map((cb) => cb().catch(() => undefined))),
            timeout,
          ]);
          await api.logout();
        } finally {
          // Local sign-out is unconditional: a server that did not answer must
          // not leave the person looking signed in.
          api.setTokens(null);
          await clearTokens();
          dispatch({ type: 'signedOut' });
        }
      },

      onBeforeLogout(cb) {
        beforeLogout.current.add(cb);
        return () => {
          beforeLogout.current.delete(cb);
        };
      },

      async deleteAccount() {
        await api.deleteAccount();
        api.setTokens(null);
        await clearTokens();
        if(state.me)await removePref(`anonymity.${state.me.id}`);
        dispatch({type:'signedOut'});
      },

      forgotPassword: (email) => api.forgotPassword(email),

      async submitProfile(req) {
        const me = await api.submitProfile(req);
        dispatch({ type: 'me', me });
        return me;
      },

      async refreshMe(options) {
        try {
          const me = await api.me();
          dispatch({ type: 'me', me });
          return me;
        } catch (err) {
          if (isApiError(err, 'unauthorized')) {
            await clearTokens();
            api.setTokens(null);
            dispatch({ type: 'signedOut' });
            return undefined;
          }
          // A poll that missed the network is not an event: the caller keeps the
          // state it had. A caller that must tell the person reads `undefined`.
          if (isApiError(err, 'network') && !options?.throwOnNetwork) return undefined;
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
