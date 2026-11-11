import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '../../api';
import { ToastHost } from '../../components/patterns';
import { MockApi } from '../../api/mock';
import { initI18n, t } from '../../i18n';
import { clearTokens, SessionProvider, useSession, type SessionValue } from '../../session';
import { ThemeProvider } from '../../theme';
import { RootNavigator } from '../RootNavigator';

/**
 * Acceptance test 28 (TENANT_PLAN.md §9): the route groups follow the account
 * through onboarding — unconfirmed → the Confirm-email screen only;
 * `incomplete` → Profile setup with no section field; `active` with no
 * membership → the four tabs with an empty Events tab.
 *
 * This mounts the real navigator (real screens) because the thing worth
 * testing is the SWAP: two groups own a route called `ProfileSetup`, and
 * without the `navigationKey` on each group the navigator would keep the
 * current route across the change and leave a person on the form they just sent.
 */

initI18n();

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Reaches the session from outside the tree so the test can drive it. */
function Driver({ into }: { into: { current: SessionValue | null } }) {
  into.current = useSession();
  return null;
}

test('[28] the root stack follows the account: splash -> confirm email -> profile -> shell', async () => {
  await clearTokens();
  const session: { current: SessionValue | null } = { current: null };
  const api = new MockApi({ latencyMs: 0 });

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

  const s = () => session.current as SessionValue;

  await waitFor(() => expect(s().phase).toBe('signedOut'));
  expect(screen.getByTestId('splash')).toBeTruthy();

  // Unconfirmed: the confirm screen and nothing else — not the profile form.
  await act(async () => {
    await s().register({ email: 'zehra@example.com', password: 'sekizkarakter' });
  });
  await waitFor(() => expect(screen.getByTestId('confirm-email')).toBeTruthy());
  expect(s().me?.emailConfirmed).toBe(false);
  expect(screen.queryByTestId('profile-setup')).toBeNull();
  expect(screen.queryByTestId('tab-events')).toBeNull();

  // Confirmed + incomplete: profile setup, with no section and no country row.
  api.confirmEmail('zehra@example.com');
  await act(async () => {
    await s().refreshMe();
  });
  await waitFor(() => expect(screen.getByTestId('profile-setup')).toBeTruthy());
  expect(screen.queryByTestId('confirm-email')).toBeNull();
  expect(screen.queryByTestId('profile-section-field')).toBeNull();
  expect(screen.queryByTestId('profile-country-field')).toBeNull();

  // Active with no membership at all: the four-tab shell [D2], Events empty.
  await act(async () => {
    await s().submitProfile({ name: 'Zehra Ak' });
  });
  await waitFor(() => expect(screen.getByTestId('events-avatar')).toBeTruthy());
  expect(s().me).toMatchObject({ status: 'active', memberships: [] });
  expect(screen.getByTestId('tab-inbox')).toBeTruthy();
  expect(screen.getByTestId('tab-threads')).toBeTruthy();
  expect(screen.getByTestId('tab-profile')).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId('events-empty')).toBeTruthy());
  expect(screen.getByText(t('events.empty'))).toBeTruthy();
  expect(screen.queryByTestId('profile-setup')).toBeNull();

  // and back out again.
  await act(async () => {
    await s().logout();
  });
  await waitFor(() => expect(screen.getByTestId('splash')).toBeTruthy());
});

test('[28] logging in to an unconfirmed account lands on the confirm screen, not the shell', async () => {
  await clearTokens();
  const session: { current: SessionValue | null } = { current: null };
  const api = new MockApi({ latencyMs: 0 });
  // An account that finished nothing but sign-up, signed out.
  await api.register({ email: 'later@example.com', password: 'sekizkarakter' });
  await api.logout();

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
  const s = () => session.current as SessionValue;
  await waitFor(() => expect(s().phase).toBe('signedOut'));
  await act(async () => {
    await s().login({ email: 'later@example.com', password: 'sekizkarakter' });
  });
  await waitFor(() => expect(screen.getByTestId('confirm-email')).toBeTruthy());
  expect(screen.queryByTestId('tab-events')).toBeNull();
});
