import { MockApi } from '../mock';
import { HttpApi } from '../http';
import { activeAccount, memberAccount } from '../testing';
import type { CreateEventRequest } from '../types';

const draft = (): CreateEventRequest => ({ organisationId: 'esn-tr', name: 'Welcome night', scope: 'section', startsAt: new Date(Date.now()+3600000).toISOString(),
  endsAt: new Date(Date.now()+7200000).toISOString(), cover: 'coral', boardMode: 'approve_first' });

it('enforces the account state and membership; joining counts once and exposes only roster profile fields', async () => {
  const api = new MockApi({ latencyMs: 0 });
  // [D18] Unconfirmed, then [D14] incomplete: neither reaches a member route.
  await api.register({ email: 'new@example.com', password: 'password123' });
  await expect(api.createEvent(draft())).rejects.toMatchObject({ status: 403, code: 'email_unconfirmed' });
  api.confirmEmail('new@example.com');
  await expect(api.createEvent(draft())).rejects.toMatchObject({ status: 403, code: 'account_not_active' });
  // [D16] Active, but in no organisation: the creation switch refuses.
  await activeAccount(api, 'outside@example.com');
  await expect(api.createEvent(draft())).rejects.toMatchObject({ status: 403, code: 'event_creation_not_allowed' });
  const creator = await memberAccount(api, 'creator@example.com');
  const event = await api.createEvent(draft());
  expect(event.memberCount).toBe(1); expect(event.isModerator).toBe(true);
  expect(event.organisation).toEqual({ id: 'esn-tr', name: 'ESN Türkiye', hasSections: true });
  await memberAccount(api, 'guest@example.com', 'izmir');
  expect(await api.listMyEvents()).toEqual([]);
  await expect(api.getEvent(event.id)).rejects.toMatchObject({ status: 404 });
  expect(await api.joinEvent('ZZZZZZ')).toEqual({ ok: false, reason: 'not_found' });
  const joined = await api.joinEvent(event.joinCode);
  expect(joined).toMatchObject({ ok: true, event: { memberCount: 2, isModerator: false, postCount: 0 } });
  expect(await api.joinEvent(event.joinCode)).toMatchObject({ ok: false, reason: 'already_joined' });
  expect((await api.getEvent(event.id)).memberCount).toBe(2);
  expect((await api.getEvent(event.id)).people[0]).not.toHaveProperty('email');
  api.setTokens(creator.tokens);
  expect((await api.getEvent(event.id)).people[0].name).toBe('creator');
});

it('derives country/scope and transitions upcoming → live → archived at exact boundaries', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await memberAccount(api, 'creator@example.com', 'izmir');
  const input = { ...draft(), scope: 'national' as const };
  const event = await api.createEvent(input);
  expect(event.country).toBe('Türkiye'); expect(event.section).toBeUndefined();
  expect(event.status).toBe('upcoming');
  const now = jest.spyOn(Date, 'now');
  try {
    now.mockReturnValue(Date.parse(input.startsAt));
    expect((await api.getEvent(event.id)).status).toBe('live');
    now.mockReturnValue(Date.parse(input.endsAt));
    expect((await api.getEvent(event.id)).status).toBe('archived');
  } finally { now.mockRestore(); }
});

it('rejects invalid dates and names without creating an event', async () => {
  const api = new MockApi({ latencyMs: 0 }); await memberAccount(api, 'creator@example.com');
  await expect(api.createEvent({ ...draft(), name: ' ' })).rejects.toMatchObject({ code: 'validation' });
  await expect(api.createEvent({ ...draft(), endsAt: 'invalid' })).rejects.toMatchObject({ code: 'validation' });
  await expect(api.createEvent({ ...draft(), endsAt: new Date(0).toISOString() })).rejects.toMatchObject({ code: 'validation' });
  expect(await api.listMyEvents()).toEqual([]);
});

it('maps the Events HTTP contract and encodes route IDs', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: async () => '[]' } as Response);
  try {
    const api = new HttpApi('https://api.example');
    api.setTokens({ accessToken: 'access', refreshToken: 'refresh' });
    await api.listMyEvents(); await api.getEvent('a/b'); await api.createEvent(draft()); await api.joinEvent('AAAAAB');
    expect(fetchMock.mock.calls.map(c => c[0])).toEqual(['https://api.example/events','https://api.example/events/a%2Fb','https://api.example/events','https://api.example/events/join']);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({ organisationId: 'esn-tr', scope: 'section' });
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'POST', body: '{"code":"AAAAAB"}', headers: { Authorization: 'Bearer access' } });
  } finally { fetchMock.mockRestore(); }
});
