import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { ApiProvider } from '../../api';
import { MockApi } from '../../api/mock';
import { SessionProvider, useSession } from '../SessionProvider';
import { clearTokens, loadTokens } from '../storage';

/**
 * The session, driven through `MockApi`. No navigator is mounted: routing is a
 * pure function of `phase` + `me.status`, so testing the state is testing the
 * routing.
 */

async function mount(api: MockApi) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <SessionProvider>{children}</SessionProvider>
    </ApiProvider>
  );
  // RNTL 14 renders concurrently: renderHook is async.
  return renderHook(() => useSession(), { wrapper });
}

const credentials = { email: 'Deniz@Example.com', password: 'sekizkarakter' };

beforeEach(async () => {
  await clearTokens();
});

test('boots signed out when there are no stored tokens', async () => {
  const { result } = await mount(new MockApi({ latencyMs: 0 }));

  await waitFor(() => expect(result.current.phase).toBe('signedOut'));
  expect(result.current.me).toBeNull();
  expect(result.current.bootError).toBeNull();
});

test('register signs in with an incomplete account and stores the tokens', async () => {
  const { result } = await mount(new MockApi({ latencyMs: 0 }));
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  await act(async () => {
    await result.current.register(credentials);
  });

  expect(result.current.phase).toBe('signedIn');
  expect(result.current.me?.status).toBe('incomplete');
  // Nothing is known about the person yet, and no country was invented [D11].
  expect(result.current.me?.name).toBeUndefined();
  expect(result.current.me?.section).toBeUndefined();
  expect(await loadTokens()).not.toBeNull();
});

test('a second account on the same email is refused, case-insensitively', async () => {
  const { result } = await mount(new MockApi({ latencyMs: 0 }));
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  await act(async () => {
    await result.current.register(credentials);
  });

  await expect(
    result.current.register({ ...credentials, email: credentials.email.toUpperCase() }),
  ).rejects.toMatchObject({ code: 'email_in_use' });
});

test('login rejects a wrong password with invalid_credentials', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { result } = await mount(api);
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  await act(async () => {
    await result.current.register(credentials);
  });

  await expect(
    result.current.login({ email: credentials.email, password: 'not-the-password' }),
  ).rejects.toMatchObject({ code: 'invalid_credentials' });
});

test('submitProfile moves the account to pending and fills the section', async () => {
  const { result } = await mount(new MockApi({ latencyMs: 0 }));
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  await act(async () => {
    await result.current.register(credentials);
    await result.current.submitProfile({ name: 'Deniz Aksoy', sectionId: 'ankara', bio: 'ESN Ankara' });
  });

  expect(result.current.me?.status).toBe('pending');
  expect(result.current.me?.name).toBe('Deniz Aksoy');
  // [D11] the country is only reachable through the section.
  expect(result.current.me?.section).toEqual({ id: 'ankara', name: 'ESN Ankara', country: 'Türkiye' });
});

test('refreshMe sees the approval once the demo admin has acted', async () => {
  const { result } = await mount(new MockApi({ latencyMs: 0, approveAfterMs: 10 }));
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  await act(async () => {
    await result.current.register(credentials);
    await result.current.submitProfile({ name: 'Deniz Aksoy', sectionId: 'ankara' });
  });
  expect(result.current.me?.status).toBe('pending');

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await result.current.refreshMe();
  });

  expect(result.current.me?.status).toBe('approved');
});

test('logout clears the stored tokens', async () => {
  const { result } = await mount(new MockApi({ latencyMs: 0 }));
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  await act(async () => {
    await result.current.register(credentials);
  });
  expect(await loadTokens()).not.toBeNull();

  await act(async () => {
    await result.current.logout();
  });

  expect(result.current.phase).toBe('signedOut');
  expect(result.current.me).toBeNull();
  expect(await loadTokens()).toBeNull();
});

test('a stored session boots straight back in', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const first = await mount(api);
  await waitFor(() => expect(first.result.current.phase).toBe('signedOut'));
  await act(async () => {
    await first.result.current.register(credentials);
  });
  await first.unmount();

  // Same api instance = same in-memory accounts, as a relaunch against the same
  // server would be.
  const { result } = await mount(api);
  await waitFor(() => expect(result.current.phase).toBe('signedIn'));
  expect(result.current.me?.email).toBe(credentials.email);
});

test('the viewer is counted in their own section, once', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { result } = await mount(api);
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  const before = (await api.getSection('ankara')).memberCount;

  await act(async () => {
    await result.current.register(credentials);
    // A name that is not already in the seeded roster, so "the viewer is first"
    // is not confused with "the seed happens to start with them".
    await result.current.submitProfile({ name: 'Zehra Ak', sectionId: 'ankara' });
  });

  const after = await api.getSection('ankara');
  expect(after.memberCount).toBe(before + 1);
  expect(after.rosterTotal).toBe(after.memberCount);
  // The prototype puts the viewer at the top of their own roster.
  expect(after.roster[0]?.name).toBe('Zehra Ak');
  expect(after.roster.length).toBeLessThan(after.rosterTotal);
});
