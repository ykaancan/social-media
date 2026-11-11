import { act, render } from '@testing-library/react-native';
import React from 'react';
import { Platform } from 'react-native';
import { ApiProvider, MockApi } from '../../api';
import { clearTokens, SessionProvider, useSession, type SessionValue } from '../../session';
import { usePushRegistration } from '../usePushRegistration';

/**
 * The one frontend change the backend plan makes [B8]: while an approved session
 * is on screen, this phone's Expo push token belongs to that account.
 *
 * The expo modules are faked here because there is no phone: `expo-device` says
 * this is one, `expo-notifications` hands over a token, and the real versions of
 * both fail on a simulator — which the hook is required to survive silently.
 */
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } } },
}));

const TOKEN = 'ExponentPushToken[test]';

function Harness({ into }: { into: { current: SessionValue | null } }) {
  into.current = useSession();
  usePushRegistration();
  return null;
}

async function mount() {
  await clearTokens();
  const api = new MockApi({ latencyMs: 0 });
  const registerDevice = jest.spyOn(api, 'registerDevice');
  const unregisterDevice = jest.spyOn(api, 'unregisterDevice');
  const session: { current: SessionValue | null } = { current: null };
  await render(
    <ApiProvider api={api}>
      <SessionProvider>
        <Harness into={session} />
      </SessionProvider>
    </ApiProvider>,
  );
  return { api, session, registerDevice, unregisterDevice };
}

/**
 * Sign up and open the confirmation link [D18]: a real account that is not
 * `active` yet, because its profile has not been sent.
 */
async function signUpIncomplete(api: MockApi, session: { current: SessionValue | null }) {
  await act(async () => {
    await session.current!.register({ email: 'owner@example.com', password: 'password123' });
  });
  api.confirmEmail('owner@example.com');
  await act(async () => {
    await session.current!.refreshMe();
  });
}

afterEach(async () => {
  jest.clearAllMocks();
  await clearTokens();
});

it('registers this phone once an account is active, and not before', async () => {
  const { api, session, registerDevice, unregisterDevice } = await mount();
  expect(registerDevice).not.toHaveBeenCalled();

  await signUpIncomplete(api, session);
  expect(session.current!.me).toMatchObject({ status: 'incomplete', emailConfirmed: true });
  // An account that is not active has nothing to be notified about: no token is asked for.
  expect(registerDevice).not.toHaveBeenCalled();

  await act(async () => {
    await session.current!.submitProfile({ name: 'Owner' });
  });
  expect(session.current!.me!.status).toBe('active');
  expect(registerDevice).toHaveBeenCalledTimes(1);
  expect(registerDevice).toHaveBeenCalledWith({
    token: TOKEN,
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    locale: 'en',
  });
  expect(unregisterDevice).not.toHaveBeenCalled();

  // Nothing changed, so nothing is asked again.
  await act(async () => {
    await session.current!.refreshMe();
  });
  expect(registerDevice).toHaveBeenCalledTimes(1);
});

it('gives the token back on sign-out', async () => {
  const { api, session, registerDevice, unregisterDevice } = await mount();
  await signUpIncomplete(api, session);
  await act(async () => {
    await session.current!.submitProfile({ name: 'Owner' });
  });
  expect(registerDevice).toHaveBeenCalledTimes(1);

  await act(async () => {
    await session.current!.logout();
  });

  // Best effort: by now the session's credentials are gone, so the mock refuses
  // it exactly as the server would. The hook must not care.
  expect(unregisterDevice).toHaveBeenCalledWith(TOKEN);
  expect(session.current!.phase).toBe('signedOut');
});

it('survives a device that cannot produce a push token', async () => {
  const notifications = jest.requireMock('expo-notifications');
  notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('no Google services'));

  const { api, session, registerDevice } = await mount();
  await signUpIncomplete(api, session);
  await act(async () => {
    await session.current!.submitProfile({ name: 'Owner' });
  });

  expect(session.current!.me!.status).toBe('active');
  expect(registerDevice).not.toHaveBeenCalled();
});

it('does not register when notification permission is refused', async () => {
  const notifications = jest.requireMock('expo-notifications');
  notifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

  const { api, session, registerDevice } = await mount();
  await signUpIncomplete(api, session);
  await act(async () => {
    await session.current!.submitProfile({ name: 'Owner' });
  });

  expect(registerDevice).not.toHaveBeenCalled();
  expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
});
