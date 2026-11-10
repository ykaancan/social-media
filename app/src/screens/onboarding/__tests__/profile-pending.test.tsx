import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ApiError, ApiProvider } from '../../../api';
import { MockApi } from '../../../api/mock';
import { ToastHost } from '../../../components';
import { initI18n, t } from '../../../i18n';
import { RootNavigator } from '../../../navigation/RootNavigator';
import { clearTokens, SessionProvider, useSession, type SessionValue } from '../../../session';
import { ThemeProvider } from '../../../theme';
import { upper } from '../../../utils/text';
import { RESEND_WAIT_MS } from '../ConfirmEmail';

/**
 * Confirm email [D18], Profile setup [D14]/[D15] and the restricted screen,
 * driven through the real navigator so the thing under test is the whole
 * route: the screen acts, the session changes, the group swaps.
 *
 * `MockApi` stands in for the server; nothing here mounts a screen in
 * isolation, because "did the navigator move" is half of what these screens
 * promise.
 */

initI18n();

configure({ defaultIncludeHiddenElements: true });

// expo-image-picker is a native module: the screen owns the permission prompt
// and the picker, and the tests only need it not to explode on import.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const CREDENTIALS = { email: 'zehra@example.com', password: 'sekizkarakter' };

/** Reaches the session from outside the tree so a test can register or submit. */
function Driver({ into }: { into: { current: SessionValue | null } }) {
  into.current = useSession();
  return null;
}

/** RNTL 14 renders concurrently: `render` is awaited, or the first commit
 *  never lands and the session sits in `booting`. */
async function mount(api: MockApi) {
  const session: { current: SessionValue | null } = { current: null };
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ApiProvider api={api}>
          <SessionProvider>
            <ToastHost>
              <Driver into={session} />
              <RootNavigator />
            </ToastHost>
          </SessionProvider>
        </ApiProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return () => session.current as SessionValue;
}

/** Registers, which lands an unconfirmed account on the Confirm-email screen. */
async function reachConfirmEmail(api: MockApi) {
  const s = await mount(api);
  await waitFor(() => expect(s().phase).toBe('signedOut'));
  await act(async () => {
    await s().register(CREDENTIALS);
  });
  await waitFor(() => expect(screen.getByTestId('confirm-email')).toBeTruthy());
  return s;
}

/**
 * An unconfirmed account that signs in later (not fresh from sign-up), so the
 * Resend button is not in its first-60-seconds rest.
 */
async function reachConfirmEmailByLogin(api: MockApi) {
  await api.register(CREDENTIALS);
  api.setTokens(null);
  const s = await mount(api);
  await waitFor(() => expect(s().phase).toBe('signedOut'));
  await act(async () => {
    await s().login(CREDENTIALS);
  });
  await waitFor(() => expect(screen.getByTestId('confirm-email')).toBeTruthy());
  return s;
}

/** Registers and opens the link, which lands an `incomplete` account on the profile form. */
async function reachProfileSetup(api: MockApi) {
  const s = await reachConfirmEmail(api);
  api.confirmEmail(CREDENTIALS.email);
  await act(async () => {
    await s().refreshMe();
  });
  await waitFor(() => expect(screen.getByTestId('profile-submit')).toBeTruthy());
  return s;
}

const disabled = (testID: string) =>
  Boolean(screen.getByTestId(testID).props.accessibilityState?.disabled);

beforeEach(async () => {
  await clearTokens();
});

/* ------------------------------------------------------------------ *
 * Confirm email [D18]
 * ------------------------------------------------------------------ */

test('names the person\'s own address and the 24-hour link, and offers only resend, check and log out', async () => {
  await reachConfirmEmail(new MockApi({ latencyMs: 0 }));

  expect(screen.getByText(upper(t('onboarding.confirmTitle')))).toBeTruthy();
  const sub = t('onboarding.confirmSub', { email: CREDENTIALS.email });
  expect(sub).toContain(CREDENTIALS.email);
  expect(sub).toContain('24');
  expect(screen.getByText(sub)).toBeTruthy();
  expect(screen.getByTestId('confirm-resend')).toBeTruthy();
  expect(screen.getByTestId('confirm-check')).toBeTruthy();
  expect(screen.getByTestId('confirm-logout')).toBeTruthy();
  // Nothing is said before anything was done.
  expect(screen.queryByTestId('confirm-sent')).toBeNull();
  expect(screen.queryByTestId('confirm-still')).toBeNull();
});

test('right after sign-up the resend button rests for the first 60 seconds and sends nothing', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const resend = jest.spyOn(api, 'resendConfirmation');
  const s = await mount(api);
  await waitFor(() => expect(s().phase).toBe('signedOut'));

  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  try {
    await act(async () => {
      await s().register(CREDENTIALS);
    });
    expect(screen.getByTestId('confirm-email')).toBeTruthy();
    expect(disabled('confirm-resend')).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-resend'));
    });
    expect(resend).not.toHaveBeenCalled();
    // Nothing was resent, so nothing is said.
    expect(screen.queryByTestId('confirm-sent')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(RESEND_WAIT_MS);
    });
    expect(disabled('confirm-resend')).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

test('a resend is shown as sent and the button rests for 60 seconds', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await reachConfirmEmailByLogin(api);
  const resend = jest.spyOn(api, 'resendConfirmation');

  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  try {
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-resend'));
    });
    expect(resend).toHaveBeenCalledTimes(1);
    expect(screen.getByText(t('onboarding.confirmSent'))).toBeTruthy();
    expect(disabled('confirm-resend')).toBe(true);

    // A press while resting sends nothing.
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-resend'));
    });
    expect(resend).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(RESEND_WAIT_MS - 1);
    });
    expect(disabled('confirm-resend')).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(disabled('confirm-resend')).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

test('a resend that failed is never shown as sent', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await reachConfirmEmailByLogin(api);
  jest.spyOn(api, 'resendConfirmation').mockRejectedValueOnce(new ApiError('network', 'offline'));

  await act(async () => {
    fireEvent.press(screen.getByTestId('confirm-resend'));
  });

  expect(screen.getByText(t('onboarding.errorNetwork'))).toBeTruthy();
  expect(screen.queryByText(t('onboarding.confirmSent'))).toBeNull();
  // Nothing was sent, so there is nothing to wait for.
  expect(disabled('confirm-resend')).toBe(false);
});

test('"I\'ve confirmed" says so plainly while the email is still unconfirmed', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await reachConfirmEmail(api);

  await act(async () => {
    fireEvent.press(screen.getByTestId('confirm-check'));
  });

  expect(screen.getByText(t('onboarding.confirmStill'))).toBeTruthy();
  expect(screen.getByTestId('confirm-email')).toBeTruthy();
});

test('"I\'ve confirmed" on a network failure shows the network error, not "still unconfirmed"', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await reachConfirmEmail(api);
  jest.spyOn(api, 'me').mockRejectedValueOnce(new ApiError('network', 'offline'));

  await act(async () => {
    fireEvent.press(screen.getByTestId('confirm-check'));
  });

  expect(screen.getByText(t('onboarding.errorNetwork'))).toBeTruthy();
  expect(screen.queryByText(t('onboarding.confirmStill'))).toBeNull();
});

test('"I\'ve confirmed" after the link was opened moves on to profile setup', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await reachConfirmEmail(api);
  api.confirmEmail(CREDENTIALS.email);

  await act(async () => {
    fireEvent.press(screen.getByTestId('confirm-check'));
  });

  await waitFor(() => expect(screen.getByTestId('profile-setup')).toBeTruthy());
  expect(screen.queryByTestId('confirm-email')).toBeNull();
});

test('coming back to the foreground re-reads the account', async () => {
  // react-native's jest setup makes `AppState.addEventListener` a mock; its
  // calls are the listeners the mounted screens registered.
  const addListener = AppState.addEventListener as unknown as jest.Mock;
  const before = addListener.mock.calls.length;
  const api = new MockApi({ latencyMs: 0 });
  await reachConfirmEmail(api);
  api.confirmEmail(CREDENTIALS.email);
  const listeners = addListener.mock.calls.slice(before)
    .filter(([type]) => type === 'change').map(([, listener]) => listener as (state: string) => void);
  expect(listeners.length).toBeGreaterThan(0);

  await act(async () => {
    listeners.forEach((listener) => listener('active'));
  });

  await waitFor(() => expect(screen.getByTestId('profile-setup')).toBeTruthy());
});

test('log out from the confirm screen signs out', async () => {
  const s = await reachConfirmEmail(new MockApi({ latencyMs: 0 }));
  await act(async () => {
    fireEvent.press(screen.getByTestId('confirm-logout'));
  });
  await waitFor(() => expect(screen.getByTestId('splash')).toBeTruthy());
  expect(s().phase).toBe('signedOut');
});

/* ------------------------------------------------------------------ *
 * Profile setup — no section [D15]
 * ------------------------------------------------------------------ */

test('[28] the form is photo, name and bio: no section picker and no country row', async () => {
  await reachProfileSetup(new MockApi({ latencyMs: 0 }));

  expect(screen.getByTestId('profile-name')).toBeTruthy();
  expect(screen.getByTestId('profile-bio')).toBeTruthy();
  expect(screen.getByTestId('profile-photo-button')).toBeTruthy();
  expect(screen.queryByTestId('profile-section-field')).toBeNull();
  expect(screen.queryByTestId('profile-country-field')).toBeNull();
  expect(screen.queryByText(t('onboarding.pickSection'))).toBeNull();
});

test('send stays disabled until there is a name, and nothing else is required', async () => {
  await reachProfileSetup(new MockApi({ latencyMs: 0 }));

  expect(disabled('profile-submit')).toBe(true);

  // Whitespace is not a name.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), '   ');
  });
  expect(disabled('profile-submit')).toBe(true);

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), 'Zehra Ak');
  });
  expect(disabled('profile-submit')).toBe(false);
  expect(screen.getByText(t('onboarding.continue'))).toBeTruthy();
});

test('the avatar: a refusal is explained, and a picked photo reaches the server', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const s = await reachProfileSetup(api);

  const permission = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
  const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;

  // Refused: say what to do next, and change nothing.
  permission.mockResolvedValueOnce({ granted: false });
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-photo-button'));
  });
  expect(screen.getByText(t('onboarding.photoPermission'))).toBeTruthy();
  expect(launch).not.toHaveBeenCalled();

  launch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///tmp/zehra.jpg' }] });
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-photo-button'));
  });

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), 'Zehra Ak');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-submit'));
  });

  await waitFor(() => expect(screen.getByTestId('events-avatar')).toBeTruthy());
  // The local URI is what the client sends; the mock hands it straight back
  // where the real server would return a resized URL.
  expect(s().me?.avatarUrl).toBe('file:///tmp/zehra.jpg');
});

test('[D14] sending the profile makes the account active and opens the shell, with no membership', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const s = await reachProfileSetup(api);

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), 'Zehra Ak');
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-bio'), 'Ankara, coffee, night trains');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-submit'));
  });

  await waitFor(() => expect(screen.getByTestId('events-avatar')).toBeTruthy());
  expect(s().me).toMatchObject({ status: 'active', name: 'Zehra Ak', bio: 'Ankara, coffee, night trains', memberships: [] });
  expect(screen.queryByTestId('profile-setup')).toBeNull();
  expect(screen.queryByTestId('pending')).toBeNull();
});

test('a failed send stays on the form and says why', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await reachProfileSetup(api);
  jest.spyOn(api, 'submitProfile').mockRejectedValueOnce(new ApiError('network', 'offline'));

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), 'Zehra Ak');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-submit'));
  });

  expect(screen.getByText(t('onboarding.errorNetwork'))).toBeTruthy();
  expect(screen.getByTestId('profile-setup')).toBeTruthy();
});

/* ------------------------------------------------------------------ *
 * The restricted screen — a banned account
 * ------------------------------------------------------------------ */

test('the restricted screen re-reads the account and moves on when the ban is lifted', async () => {
  // Fake timers, and deliberately no `waitFor`: RNTL's waitFor advances the
  // clock itself. `flush` moves the clock by a millisecond at a time instead.
  const flush = async (rounds = 10) => {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
    }
  };

  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  try {
    const api = new MockApi({ latencyMs: 0 });
    const s = await mount(api);
    await flush();
    expect(s().phase).toBe('signedOut');

    await act(async () => {
      await s().register(CREDENTIALS);
      api.confirmEmail(CREDENTIALS.email);
      await s().submitProfile({ name: 'Zehra Ak' });
    });
    api.banAccount(CREDENTIALS.email);
    await act(async () => {
      await s().refreshMe();
    });
    await flush();

    expect(screen.getByTestId('pending')).toBeTruthy();
    expect(screen.getByText(upper(t('reviewFlow.bannedTitle')))).toBeTruthy();
    expect(screen.getByText(t('reviewFlow.bannedBody'))).toBeTruthy();
    // No queue copy and no edit path: there is no account review any more.
    expect(screen.queryByTestId('pending-step-0-dot')).toBeNull();
    expect(screen.queryByTestId('pending-edit')).toBeNull();

    api['accounts'].get(CREDENTIALS.email)!.status = 'active';
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await flush();

    expect(s().me?.status).toBe('active');
    expect(screen.queryByTestId('pending')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

/* ------------------------------------------------------------------ *
 * Editing an active profile (from Settings)
 * ------------------------------------------------------------------ */

test('an active account edits a prefilled form and saves without any review', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const s = await reachProfileSetup(api);
  await act(async () => {
    await s().submitProfile({ name: 'Zehra Ak', bio: 'Ankara, coffee, night trains' });
  });
  await waitFor(() => expect(screen.getByTestId('events-avatar')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('tab-profile'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-settings'));
  });
  await waitFor(() => expect(screen.getByText(t('onboarding.editProfile'))).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByText(t('onboarding.editProfile')));
  });

  await waitFor(() => expect(screen.getByTestId('profile-submit')).toBeTruthy());
  expect(screen.getByTestId('profile-name').props.value).toBe('Zehra Ak');
  expect(screen.getByTestId('profile-bio').props.value).toBe('Ankara, coffee, night trains');
  expect(screen.getByText(t('common.save'))).toBeTruthy();
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), 'Zehra Akın');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-submit'));
  });
  await waitFor(() => expect(s().me?.name).toBe('Zehra Akın'));
  expect(s().me?.status).toBe('active');
});
