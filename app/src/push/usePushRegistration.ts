import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useApi, type DeviceRegistration } from '../api';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../i18n';
import i18n from '../i18n';
import { useSession } from '../session';

/**
 * Tells the server where to send this account's notifications, and nothing else.
 *
 * No push copy is rendered in the app — the OS draws the notification and the
 * server writes the words, in the language this call reports. So this hook has
 * exactly one job: while an approved session is on screen, make sure the current
 * Expo push token is registered to it; when that session ends, try to take it
 * back.
 *
 * Three things it deliberately does NOT do:
 *
 * - It never blocks or delays anything. Every failure is swallowed: no
 *   permission, no Google services on the emulator, a server that is down. A
 *   person who never grants notifications uses the whole app exactly as before.
 * - It never asks twice for the same (account, language). Re-renders are free;
 *   a language change re-registers, because the copy follows the device.
 * - It renders nothing and returns nothing. Mount it once, high in the tree.
 *
 * Every call into the expo modules is inside one try/catch, because all of them
 * reach for native capabilities that a simulator, the web bundle and a test
 * environment do not have.
 */
export function usePushRegistration(): void {
  const api = useApi();
  const { phase, me, onBeforeLogout } = useSession();
  const approved = phase === 'signedIn' && me?.status === 'approved';
  const accountId = me?.id;

  /** The token we last registered, so sign-out has something to unregister. */
  const registered = useRef<string | null>(null);
  /** `${accountId}:${locale}` — what `registered` was registered for. */
  const registeredFor = useRef<string | null>(null);

  const locale = currentLocale();

  // Sign-out: take the token back while the session can still authenticate.
  // Runs before `SessionProvider.logout()` clears the tokens; best effort, and
  // the server covers the rest — the next account to register this token takes
  // it over, and a token the push provider reports as gone is deleted.
  useEffect(
    () =>
      onBeforeLogout(async () => {
        const token = registered.current;
        registered.current = null;
        registeredFor.current = null;
        if (token) await api.unregisterDevice(token).catch(() => undefined);
      }),
    [api, onBeforeLogout],
  );

  useEffect(() => {
    if (!approved) {
      // A session that ended without `logout()` (a 401 the client could not
      // refresh) has nothing to unregister with; forget the token and move on.
      registered.current = null;
      registeredFor.current = null;
      return;
    }

    const key = `${accountId}:${locale}`;
    if (registeredFor.current === key) return;

    let cancelled = false;
    void (async () => {
      const token = await expoPushToken();
      if (!token || cancelled) return;
      try {
        await api.registerDevice({ token, platform: platform(), locale });
        registered.current = token;
        registeredFor.current = key;
      } catch {
        // A registration that failed is retried the next time this effect runs
        // (a new session, a language change, a relaunch). Nothing is shown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, approved, accountId, locale]);
}

/** The app's current language, narrowed to the two the product has. */
function currentLocale(): Locale {
  const language = (i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LOCALE) as string;
  return (LOCALES as readonly string[]).includes(language) ? (language as Locale) : DEFAULT_LOCALE;
}

function platform(): DeviceRegistration['platform'] {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/**
 * The Expo push token for this phone, or null for every reason there is not one.
 *
 * Permission is asked for once, and only when it has not already been answered —
 * `requestPermissionsAsync` on a phone that already said no is a no-op on iOS and
 * a second prompt nowhere, so asking only when the status is not `granted` is
 * both the polite and the accurate version.
 *
 * `getExpoPushTokenAsync` fails on a simulator, on an Android emulator without
 * Google Play services, and in Expo Go on Android — where remote push has been
 * unavailable since SDK 53 and a development build is required. All of those are
 * ordinary states for a development machine, so they are caught here and mean "no
 * token", never an error anybody sees.
 *
 * Expo needs the EAS `projectId` once the app is built outside Expo Go. It
 * defaults to `expoConfig.extra.eas.projectId`, which this reads explicitly so
 * that a config without one calls with no options at all rather than
 * `{ projectId: undefined }`.
 */
async function expoPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;

    // Android 13+ wants a channel to exist before a token is asked for; without
    // one, notifications arrive and are silently dropped.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const current = await Notifications.getPermissionsAsync();
    const status =
      current.status === 'granted'
        ? current.status
        : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token?.data ?? null;
  } catch (err) {
    if (__DEV__) console.log('[push] no token on this device:', err);
    return null;
  }
}
