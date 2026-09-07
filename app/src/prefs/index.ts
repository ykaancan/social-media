import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Device-local preferences: the handful of "has this person seen it yet"
 * booleans the UI keeps between launches.
 *
 * NOT the session. Tokens live in the keychain (`src/session/storage.ts`);
 * anything the server owns lives on the server. Nothing here is ever content,
 * a count or an identity — losing this file must cost a person nothing worse
 * than seeing one coach mark a second time.
 *
 * Every call swallows its own failure. AsyncStorage can be full, corrupt or —
 * on a first run under jest without the mock — simply absent, and none of that
 * is worth an error boundary over a tooltip. A read that fails reads as "not
 * set", which is the safe default in both directions.
 */

/** Every key the app stores, in one place, so nothing invents a string. */
export const PREF_KEYS = {
  /** Set once the Events coach mark has been dismissed by hand. */
  coachMarkDismissed: 'coachMark.dismissed',
} as const;

export type PrefKey = (typeof PREF_KEYS)[keyof typeof PREF_KEYS];

/** Namespaced so a future library sharing AsyncStorage cannot collide. */
const NAMESPACE = 'brand.pref.';

const storageKey = (key: PrefKey) => `${NAMESPACE}${key}`;

/** The stored string, or null when it was never set (or could not be read). */
export async function getPref(key: PrefKey): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(storageKey(key));
  } catch {
    return null;
  }
}

export async function setPref(key: PrefKey, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(key), value);
  } catch {
    // The preference is lost, the screen is not. See the note above.
  }
}

export async function removePref(key: PrefKey): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(key));
  } catch {
    // Already gone as far as any reader is concerned.
  }
}

/* ------------------------------------------------------------------ *
 * The one preference with a hook of its own
 * ------------------------------------------------------------------ */

export interface CoachMarkState {
  /**
   * `null` while the preference is still being read. Screens render the mark
   * only on `true`, so a dismissed mark never flashes on launch.
   */
  visible: boolean | null;
  /** Hides it now and remembers it. Never shown again on this device. */
  dismiss: () => void;
}

/**
 * The one-time coach mark on the empty Events screen (HANDOFF §6.1). It is
 * dismissed by hand — never on a timer, never twice — so "seen" has to outlive
 * the process.
 *
 * It lives here rather than next to the screen because the pref, not the
 * screen, is the state: a second surface that ever needs the same "seen once"
 * behaviour asks for its own key and gets the same three lines.
 */
export function useCoachMark(key: PrefKey = PREF_KEYS.coachMarkDismissed): CoachMarkState {
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void getPref(key).then((stored) => {
      // A dismiss that lands while the read is in flight must win, so only an
      // unresolved state is filled in here.
      if (alive) setVisible((current) => current ?? stored === null);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const dismiss = useCallback(() => {
    setVisible(false);
    void setPref(key, '1');
  }, [key]);

  return { visible, dismiss };
}
