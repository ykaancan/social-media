import * as SecureStore from 'expo-secure-store';
import type { Tokens } from '../api';

/**
 * Where the bearer credentials live between launches.
 *
 * The device keychain (iOS) / Keystore-backed store (Android) via
 * expo-secure-store. Where that does not exist — jest, react-native-web — the
 * module falls back to a module-scoped variable, so the app still works for a
 * session but forgets on reload. That is the right trade: a token in
 * localStorage is a token in every script on the page, and stage 1 has no web
 * client for members anyway.
 */

const KEY = 'brand.tokens.v1';

/**
 * Write-through cache of the store, and IS the store when there is none. It is
 * authoritative once warm: a keychain that accepted a write but hands back
 * nothing (a jest environment, a locked device) must not look like a sign-out.
 */
let memory: Tokens | null = null;

/** null = not probed yet. */
let secureAvailable: boolean | null = null;

async function secureStore(): Promise<typeof SecureStore | null> {
  if (secureAvailable === false) return null;
  if (secureAvailable === null) {
    try {
      secureAvailable =
        typeof SecureStore.getItemAsync === 'function' &&
        typeof SecureStore.setItemAsync === 'function' &&
        (typeof SecureStore.isAvailableAsync !== 'function' || (await SecureStore.isAvailableAsync()));
    } catch {
      secureAvailable = false;
    }
  }
  return secureAvailable ? SecureStore : null;
}

function parse(raw: string | null): Tokens | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Tokens>;
    return value.accessToken && value.refreshToken
      ? { accessToken: value.accessToken, refreshToken: value.refreshToken }
      : null;
  } catch {
    // A corrupt entry is treated as "signed out" rather than crashing the boot.
    return null;
  }
}

export async function loadTokens(): Promise<Tokens | null> {
  // Only the first read after launch touches the keychain; after that the cache
  // is the truth, because every write went through it.
  if (memory) return memory;
  const store = await secureStore();
  if (!store) return null;
  try {
    memory = parse(await store.getItemAsync(KEY));
    return memory;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: Tokens): Promise<void> {
  memory = tokens;
  const store = await secureStore();
  if (!store) return;
  try {
    await store.setItemAsync(KEY, JSON.stringify(tokens));
  } catch {
    // Keychain write failed (locked device, no biometrics enrolled). The
    // session still works; it just will not survive a relaunch.
  }
}

export async function clearTokens(): Promise<void> {
  memory = null;
  const store = await secureStore();
  if (!store) return;
  try {
    await store.deleteItemAsync(KEY);
  } catch {
    // Nothing to do: the in-memory copy is already gone.
  }
}
