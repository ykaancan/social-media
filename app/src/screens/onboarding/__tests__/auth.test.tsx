import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '../../../api';
import { MockApi } from '../../../api/mock';
import { ToastHost } from '../../../components/patterns';
import { initI18n, t } from '../../../i18n';
import { RootNavigator } from '../../../navigation/RootNavigator';
import { clearTokens, SessionProvider, useSession, type SessionValue } from '../../../session';
import { ThemeProvider } from '../../../theme';
import { upper } from '../../../utils/text';

/**
 * Splash, sign up and log in, driven through the real navigator and `MockApi`.
 *
 * The navigator is mounted rather than the screens in isolation because the
 * screens deliberately do NOT navigate on success — the stack swaps itself off
 * the session — so "did registering work" can only be asked of the tree.
 */

initI18n();

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Reaches the session from outside the tree so a test can assert on it. */
function Driver({ into }: { into: { current: SessionValue | null } }) {
  into.current = useSession();
  return null;
}

async function mount(api: MockApi) {
  await clearTokens();
  const session: { current: SessionValue | null } = { current: null };

  // RNTL 14 renders concurrently: await the render so effects have flushed.
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

  await waitFor(() => expect(session.current?.phase).toBe('signedOut'));
  return session;
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

const type = async (testID: string, value: string) => {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId(testID), value);
  });
};

const goTo = async (route: 'signup' | 'login') => {
  await press(route === 'signup' ? 'splash-signup' : 'splash-login');
  await waitFor(() => expect(screen.getByTestId(`${route}-submit`)).toBeTruthy());
};

const EMAIL = 'deniz@example.com';
const PASSWORD = 'sekizkarakter';

test('the splash offers both ways in', async () => {
  await mount(new MockApi({ latencyMs: 0 }));

  expect(screen.getByText(upper(t('onboarding.splashTitle')))).toBeTruthy();
  expect(screen.getByText(t('onboarding.splashSub'))).toBeTruthy();
  expect(screen.getByTestId('splash-signup')).toBeTruthy();
  expect(screen.getByTestId('splash-login')).toBeTruthy();
});

test('sign up stays disabled until the email and password are both valid', async () => {
  await mount(new MockApi({ latencyMs: 0 }));
  await goTo('signup');

  const disabled = () =>
    screen.getByTestId('signup-submit').props.accessibilityState?.disabled === true;

  expect(disabled()).toBe(true);

  // A valid password is not enough on its own.
  await type('signup-password', PASSWORD);
  expect(disabled()).toBe(true);

  // Nor is an address that is not one.
  await type('signup-email', 'deniz@example');
  expect(disabled()).toBe(true);

  await type('signup-email', EMAIL);
  expect(disabled()).toBe(false);
});

test('the password hint shows only while the password is too short', async () => {
  await mount(new MockApi({ latencyMs: 0 }));
  await goTo('signup');

  const hint = t('onboarding.passwordHint');
  expect(screen.queryByText(hint)).toBeNull();

  await type('signup-password', 'kısa');
  expect(screen.getByText(hint)).toBeTruthy();

  await type('signup-password', PASSWORD);
  expect(screen.queryByText(hint)).toBeNull();
});

test('log in shows no password hint and no phone field', async () => {
  await mount(new MockApi({ latencyMs: 0 }));
  await goTo('login');

  await type('login-password', 'kısa');
  expect(screen.queryByText(t('onboarding.passwordHint'))).toBeNull();
  expect(screen.queryByTestId('signup-phone')).toBeNull();
  expect(screen.getByTestId('login-forgot')).toBeTruthy();
});

test('a duplicate email lands on the email field', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const session = await mount(api);

  // The address is taken before the screen is ever opened.
  await act(async () => {
    await (session.current as SessionValue).register({ email: EMAIL, password: PASSWORD });
    await (session.current as SessionValue).logout();
  });
  await waitFor(() => expect(screen.getByTestId('splash-signup')).toBeTruthy());

  await goTo('signup');
  await type('signup-email', EMAIL);
  await type('signup-password', PASSWORD);
  await press('signup-submit');

  await waitFor(() => expect(screen.getByText(t('onboarding.errorEmailInUse'))).toBeTruthy());
  // Still on the form, and the credentials error was not shown instead.
  expect(screen.getByTestId('signup-submit')).toBeTruthy();
  expect(screen.queryByText(t('onboarding.errorCredentials'))).toBeNull();

  // Editing the field clears the message it describes.
  await type('signup-email', `x${EMAIL}`);
  expect(screen.queryByText(t('onboarding.errorEmailInUse'))).toBeNull();
});

test('a wrong password lands on the password field', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const session = await mount(api);

  await act(async () => {
    await (session.current as SessionValue).register({ email: EMAIL, password: PASSWORD });
    await (session.current as SessionValue).logout();
  });
  await waitFor(() => expect(screen.getByTestId('splash-login')).toBeTruthy());

  await goTo('login');
  await type('login-email', EMAIL);
  await type('login-password', 'not-the-password');
  await press('login-submit');

  await waitFor(() => expect(screen.getByText(t('onboarding.errorCredentials'))).toBeTruthy());
  expect(session.current?.phase).toBe('signedOut');
});

test('registering signs in and the stack swaps to profile setup on its own', async () => {
  const session = await mount(new MockApi({ latencyMs: 0 }));

  await goTo('signup');
  await type('signup-email', EMAIL);
  await type('signup-password', PASSWORD);
  await type('signup-phone', '+90 555 000 00 00');
  await press('signup-submit');

  await waitFor(() => expect(session.current?.phase).toBe('signedIn'));
  expect(session.current?.me?.status).toBe('incomplete');
  // Nothing in the screen navigated; the route group did.
  await waitFor(() => expect(screen.queryByTestId('signup-submit')).toBeNull());
});

test('forgot password answers the same way whether or not the account exists', async () => {
  await mount(new MockApi({ latencyMs: 0 }));
  await goTo('login');

  const forgot = () => screen.getByTestId('login-forgot');
  expect(forgot().props.accessibilityState?.disabled).toBe(true);

  await type('login-email', 'nobody@example.com');
  expect(forgot().props.accessibilityState?.disabled).toBe(false);

  await press('login-forgot');
  await waitFor(() => expect(screen.getByText(t('onboarding.resetSent'))).toBeTruthy());
});
