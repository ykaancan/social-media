import { HttpApi } from '../http';

/**
 * [D21] `429 rate_limited` from login, sign-up and forgot-password maps to the
 * `rate_limited` code. A 429 on any other route keeps the `unknown` it had before.
 */

const limited = { ok: false, status: 429, text: async () => JSON.stringify({ code: 'rate_limited', message: 'too many attempts' }) } as Response;

it('maps 429 rate_limited on the three auth routes', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(limited);
  const api = new HttpApi('https://api.example');
  try {
    await expect(api.login({ email: 'a@example.com', password: 'whatever1' })).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
    await expect(api.register({ email: 'a@example.com', password: 'whatever1' })).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
    await expect(api.forgotPassword('a@example.com')).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
  } finally {
    fetchMock.mockRestore();
  }
});

it('leaves a 429 on a member route as unknown, as before', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(limited);
  const api = new HttpApi('https://api.example');
  api.setTokens({ accessToken: 'a', refreshToken: 'r' });
  try {
    await expect(api.changeSection('org', 'section')).rejects.toMatchObject({ code: 'unknown', status: 429 });
  } finally {
    fetchMock.mockRestore();
  }
});
