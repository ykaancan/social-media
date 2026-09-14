import { MockApi } from '../mock';
import { HttpApi } from '../http';

/** An approved account, which is the only kind that may register a device. */
async function approved() {
  const api = new MockApi({ latencyMs: 0, approveAfterMs: 0 });
  await api.register({ email: 'owner@example.com', password: 'password123' });
  await api.submitProfile({ name: 'Owner', sectionId: 'ankara' });
  await api.me();
  return api;
}

it('maps device registration onto PUT and DELETE /me/devices', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue({ ok: true, text: async () => '' } as Response);
  try {
    const api = new HttpApi('https://api.example');
    api.setTokens({ accessToken: 'access', refreshToken: 'refresh' });

    await api.registerDevice({ token: 'ExponentPushToken[abc]', platform: 'android', locale: 'tr' });
    await api.unregisterDevice('ExponentPushToken[abc]');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example/me/devices',
      // The token is a path segment and is encoded: it carries brackets.
      'https://api.example/me/devices/ExponentPushToken%5Babc%5D',
    ]);
    expect(fetchMock.mock.calls[0][1]!.method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      token: 'ExponentPushToken[abc]',
      platform: 'android',
      locale: 'tr',
    });
    expect(fetchMock.mock.calls[1][1]!.method).toBe('DELETE');
  } finally {
    fetchMock.mockRestore();
  }
});

it('keys a device by its token, re-binds it to whoever registered last and validates the rest', async () => {
  const api = await approved();
  await api.registerDevice({ token: 'push-1', platform: 'ios', locale: 'en' });
  expect(api['devices'].get('push-1')).toMatchObject({ platform: 'ios', locale: 'en' });

  // Same phone, new language: one row, updated.
  await api.registerDevice({ token: 'push-1', platform: 'ios', locale: 'tr' });
  expect(api['devices'].size).toBe(1);
  expect(api['devices'].get('push-1')!.locale).toBe('tr');

  await expect(
    api.registerDevice({ token: '  ', platform: 'ios', locale: 'en' }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    api.registerDevice({ token: 'push-2', platform: 'windows' as 'ios', locale: 'en' }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    api.registerDevice({ token: 'push-2', platform: 'ios', locale: 'de' as 'en' }),
  ).rejects.toMatchObject({ status: 422 });

  // Signing out takes the row away; a token that is not yours is left alone.
  const owner = api['devices'].get('push-1')!.userId;
  await api.unregisterDevice('push-1');
  expect(api['devices'].has('push-1')).toBe(false);
  expect(owner).toBeTruthy();
});
