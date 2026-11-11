import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { ApiError, ApiProvider } from '../../api';
import { MockApi } from '../../api/mock';
import { SessionProvider, useSession } from '../SessionProvider';
import { clearTokens, loadTokens } from '../storage';

/**
 * The session, driven through `MockApi`. No navigator is mounted: routing is a
 * pure function of `phase` + `me.status` + `me.emailConfirmed`, so testing the state is testing the
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

test('register signs in with an incomplete, unconfirmed account and stores the tokens', async () => {
  const { result } = await mount(new MockApi({ latencyMs: 0 }));
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  await act(async () => {
    await result.current.register(credentials);
  });

  expect(result.current.phase).toBe('signedIn');
  expect(result.current.me?.status).toBe('incomplete');
  // [D18] The link is sent; nothing is confirmed until it is opened.
  expect(result.current.me?.emailConfirmed).toBe(false);
  // Nothing is known about the person yet, and no organisation was invented.
  expect(result.current.me?.name).toBeUndefined();
  expect(result.current.me?.memberships).toEqual([]);
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

test('[D18] the profile cannot be sent before the email is confirmed', async () => {
  const { result } = await mount(new MockApi({ latencyMs: 0 }));
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));
  await act(async () => {
    await result.current.register(credentials);
  });
  await expect(result.current.submitProfile({ name: 'Deniz Aksoy' })).rejects.toMatchObject({ code: 'email_unconfirmed', status: 403 });
  expect(result.current.me?.status).toBe('incomplete');
});

test('[D14] submitProfile makes the account active, with no section and no membership', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { result } = await mount(api);
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  await act(async () => {
    await result.current.register(credentials);
    api.confirmEmail(credentials.email);
    await result.current.submitProfile({ name: 'Deniz Aksoy', bio: 'ESN Ankara' });
  });

  expect(result.current.me?.status).toBe('active');
  expect(result.current.me?.name).toBe('Deniz Aksoy');
  // [D15] The section is not part of the account any more.
  expect(result.current.me).not.toHaveProperty('section');
  expect(result.current.me?.memberships).toEqual([]);
});

test('refreshMe sees the confirmation once the demo has opened the link', async () => {
  const { result } = await mount(new MockApi({ latencyMs: 0, confirmAfterMs: 10 }));
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));

  await act(async () => {
    await result.current.register(credentials);
  });
  expect(result.current.me?.emailConfirmed).toBe(false);

  let read: Awaited<ReturnType<typeof result.current.refreshMe>>;
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    read = await result.current.refreshMe();
  });

  expect(result.current.me?.emailConfirmed).toBe(true);
  expect(read!).toMatchObject({ emailConfirmed: true });
});

test('refreshMe swallows a network failure unless asked to throw it', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { result } = await mount(api);
  await waitFor(() => expect(result.current.phase).toBe('signedOut'));
  await act(async () => {
    await result.current.register(credentials);
  });
  const me = jest.spyOn(api, 'me').mockRejectedValue(new ApiError('network', 'offline'));
  try {
    await expect(result.current.refreshMe()).resolves.toBeUndefined();
    await expect(result.current.refreshMe({ throwOnNetwork: true })).rejects.toMatchObject({ code: 'network' });
    // The session is kept either way.
    expect(result.current.phase).toBe('signedIn');
  } finally {
    me.mockRestore();
  }
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

  await act(async () => {
    await result.current.register(credentials);
    api.confirmEmail(credentials.email);
    // A name that is not already in the seeded roster, so "the viewer is first"
    // is not confused with "the seed happens to start with them".
    await result.current.submitProfile({ name: 'Zehra Ak' });
  });

  const before = (await api.listOrganisationSections('esn-tr')).find((s) => s.id === 'ankara')!.memberCount;
  // [D15] The person is counted once their membership with that section is approved.
  api.addMember('esn-tr', credentials.email, 'ankara');

  const after = await api.getSection('ankara');
  expect(after.memberCount).toBe(before + 1);
  expect(after.rosterTotal).toBe(after.memberCount);
  // The prototype puts the viewer at the top of their own roster.
  expect(after.roster[0]?.name).toBe('Zehra Ak');
  expect(after.roster.length).toBeLessThan(after.rosterTotal);
});