import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '../../api';
import { ToastHost } from '../../components/patterns';
import { MockApi } from '../../api/mock';
import { initI18n } from '../../i18n';
import { clearTokens, SessionProvider, useSession, type SessionValue } from '../../session';
import { ThemeProvider } from '../../theme';
import { RootNavigator } from '../RootNavigator';

/**
 * The route groups follow the account through onboarding. This mounts the real
 * navigator (real screens) because the thing worth testing is the SWAP: two
 * groups own a route called `ProfileSetup`, and without the `navigationKey` on
 * each group the navigator would keep the current route across the change and
 * leave a person on the form they just sent.
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

test('the root stack follows the account: splash -> profile -> pending -> shell', async () => {
  await clearTokens();
  const session: { current: SessionValue | null } = { current: null };
  const api = new MockApi({ latencyMs: 0, approveAfterMs: 5 });

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

  // incomplete: profile setup and nothing else.
  await act(async () => {
    await s().register({ email: 'zehra@example.com', password: 'sekizkarakter' });
  });
  await waitFor(() => expect(screen.getByTestId('profile-setup')).toBeTruthy());

  // pending: the form is gone, whatever route it was on.
  await act(async () => {
    await s().submitProfile({ name: 'Zehra Ak', sectionId: 'ankara' });
  });
  await waitFor(() => expect(screen.getByTestId('pending')).toBeTruthy());

  // approved: the four-tab shell [D2].
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await s().refreshMe();
  });
  await waitFor(() => expect(screen.getByTestId('events-avatar')).toBeTruthy());
  expect(screen.getByTestId('tab-inbox')).toBeTruthy();
  expect(screen.getByTestId('tab-threads')).toBeTruthy();
  expect(screen.getByTestId('tab-profile')).toBeTruthy();

  // and back out again.
  await act(async () => {
    await s().logout();
  });
  await waitFor(() => expect(screen.getByTestId('splash')).toBeTruthy());
});
