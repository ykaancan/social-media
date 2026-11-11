import { MockApi } from '../mock';
import { HttpApi } from '../http';
import { activeAccount, memberAccount, TEST_PASSWORD } from '../testing';
import { sectionIn, soleMembershipSection } from '../memberships';
import type { CreateEventRequest, Me, Membership } from '../types';

/**
 * The organisation model in the mock [D13]–[D19], against the rules the backend
 * implements (TENANT_PLAN.md §10). The numbers in the test names are the T-2
 * acceptance tests (§9) the mock mirrors — acceptance test 36.
 *
 * Fixture organisations: `esn-tr` approval + sections, `esn-eu` open + sections,
 * `moda` open without sections and with event creation for admins only.
 */

const live = (organisationId: string, extra: Partial<CreateEventRequest> = {}): CreateEventRequest => ({
  organisationId, name: 'Live event', cover: 'coral', boardMode: 'post_immediately',
  startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), ...extra });

const membershipIn = (me: Me, organisationId: string): Membership | undefined =>
  me.memberships.find((m) => m.organisation.id === organisationId);

/** An admin of `organisationId` with one live event there; returns the event and the admin's tokens. */
async function hostedEvent(api: MockApi, organisationId: string, sectionId?: string) {
  const host = await activeAccount(api, `host-${organisationId}@example.com`, 'Host');
  api.assignAdmin(organisationId, `host-${organisationId}@example.com`, sectionId);
  const event = await api.createEvent(live(organisationId, sectionId ? { scope: 'national' } : {}));
  return { host, event };
}

/* ------------------------------------------------------------------ *
 * Email confirmation and the access order [D18]
 * ------------------------------------------------------------------ */

it('[D18] an unconfirmed account reaches only /me, resend and delete; then active needs the profile', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { me } = await api.register({ email: 'new@example.com', password: TEST_PASSWORD });
  expect(me).toMatchObject({ emailConfirmed: false, status: 'incomplete', memberships: [] });
  expect(await api.me()).toMatchObject({ emailConfirmed: false });
  await expect(api.listMyEvents()).rejects.toMatchObject({ status: 403, code: 'email_unconfirmed' });
  await expect(api.submitProfile({ name: 'New' })).rejects.toMatchObject({ status: 403, code: 'email_unconfirmed' });
  await expect(api.resendConfirmation()).resolves.toBeUndefined();
  expect(api.confirmEmail('new@example.com')).toBe(true);
  await expect(api.listMyEvents()).rejects.toMatchObject({ status: 403, code: 'account_not_active' });
  expect(await api.submitProfile({ name: 'New' })).toMatchObject({ status: 'active', emailConfirmed: true });
  expect(await api.listMyEvents()).toEqual([]);
});

it('[D18] an unconfirmed account can delete itself', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await api.register({ email: 'gone@example.com', password: TEST_PASSWORD });
  await api.deleteAccount();
  await expect(api.login({ email: 'gone@example.com', password: TEST_PASSWORD })).rejects.toMatchObject({ status: 401 });
});

it('[D18] resend always resolves and sends at most one link per 60 seconds, none once confirmed', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await api.register({ email: 'new@example.com', password: TEST_PASSWORD });
  const account = () => api['accounts'].get('new@example.com')!;
  expect(account().confirmationsSent).toBe(1);
  const clock = jest.spyOn(Date, 'now');
  try {
    const start = account().confirmationSentAt!;
    clock.mockReturnValue(start + 59_999);
    await api.resendConfirmation();
    expect(account().confirmationsSent).toBe(1);
    clock.mockReturnValue(start + 60_000);
    await api.resendConfirmation();
    expect(account().confirmationsSent).toBe(2);
    api.confirmEmail('new@example.com');
    clock.mockReturnValue(start + 200_000);
    await api.resendConfirmation();
    expect(account().confirmationsSent).toBe(2);
  } finally {
    clock.mockRestore();
  }
});

it('a banned account gets account_not_active whether or not its email was confirmed', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await api.register({ email: 'banned@example.com', password: TEST_PASSWORD });
  api.banAccount('banned@example.com');
  await expect(api.listMyEvents()).rejects.toMatchObject({ status: 403, code: 'account_not_active' });
  expect((await api.me()).status).toBe('banned');
});

it('[6] an active account with no membership at all passes the access check', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { me } = await activeAccount(api, 'solo@example.com');
  expect(me).toMatchObject({ status: 'active', memberships: [] });
  expect(await api.listMyEvents()).toEqual([]);
  expect(await api.getSettings()).toBeTruthy();
});

/* ------------------------------------------------------------------ *
 * Joining [D17]
 * ------------------------------------------------------------------ */

it('[13] a code of an open organisation without sections: membership approved and event joined in one call', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { event } = await hostedEvent(api, 'moda');
  expect(event).not.toHaveProperty('scope'); expect(event).not.toHaveProperty('section'); expect(event).not.toHaveProperty('country');
  await activeAccount(api, 'guest@example.com');
  const joined = await api.joinEvent(event.joinCode);
  expect(joined).toMatchObject({ ok: true, event: { id: event.id, organisation: { id: 'moda', hasSections: false } } });
  expect(membershipIn(await api.me(), 'moda')).toMatchObject({ status: 'approved', role: 'member', canCreateEvents: false });
  expect(membershipIn(await api.me(), 'moda')).not.toHaveProperty('section');
});

it('[14] a code of an approval organisation answers membership_required and writes nothing', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { event } = await hostedEvent(api, 'esn-tr', 'ankara');
  await activeAccount(api, 'guest@example.com');
  expect(await api.joinEvent(event.joinCode)).toEqual({ ok: false, reason: 'membership_required',
    organisation: { id: 'esn-tr', name: 'ESN Türkiye', hasSections: true }, approvalRequired: true, eventName: 'Live event' });
  expect((await api.me()).memberships).toEqual([]);
  await expect(api.getEvent(event.id)).rejects.toMatchObject({ status: 404 });
});

it('an open organisation WITH sections also answers membership_required, then lets the person in with a section', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { event } = await hostedEvent(api, 'esn-eu', 'bologna');
  await activeAccount(api, 'guest@example.com');
  expect(await api.joinEvent(event.joinCode)).toMatchObject({ ok: false, reason: 'membership_required', approvalRequired: false });
  const membership = await api.requestMembership({ code: event.joinCode, sectionId: 'sevilla' });
  expect(membership).toMatchObject({ status: 'approved', section: { id: 'sevilla', country: 'Spain' }, canCreateEvents: true });
  expect((await api.getEvent(event.id)).people.map((p) => p.name)).toContain('guest');
});

it('[15] the section must be sent, and be one of that organisation, iff it has sections', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const tr = await hostedEvent(api, 'esn-tr', 'ankara');
  const moda = await hostedEvent(api, 'moda');
  await activeAccount(api, 'guest@example.com');
  await expect(api.requestMembership({ code: tr.event.joinCode })).rejects.toMatchObject({ status: 422, field: 'sectionId' });
  await expect(api.requestMembership({ code: tr.event.joinCode, sectionId: 'bologna' })).rejects.toMatchObject({ status: 422, field: 'sectionId' });
  await expect(api.requestMembership({ code: moda.event.joinCode, sectionId: 'ankara' })).rejects.toMatchObject({ status: 422, field: 'sectionId' });
  await expect(api.requestMembership({ code: 'ZZZZZZ' })).rejects.toMatchObject({ status: 404 });
  expect((await api.me()).memberships).toEqual([]);
});

it('[16] asking an approval organisation: pending, event not joined, the next join answers membership_pending', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const first = await hostedEvent(api, 'esn-tr', 'ankara');
  const second = await api.createEvent(live('esn-tr', { name: 'Second event', scope: 'national' }));
  await activeAccount(api, 'guest@example.com');
  const pending = await api.requestMembership({ code: first.event.joinCode, sectionId: 'izmir' });
  expect(pending).toMatchObject({ status: 'pending', section: { id: 'izmir' }, pendingEventName: 'Live event', canCreateEvents: false });
  await expect(api.getEvent(first.event.id)).rejects.toMatchObject({ status: 404 });
  expect(await api.joinEvent(first.event.joinCode)).toMatchObject({ ok: false, reason: 'membership_pending', eventName: 'Live event' });
  // Asking again while pending stays pending and replaces the section and the stored event.
  const again = await api.requestMembership({ code: second.joinCode, sectionId: 'metu' });
  expect(again).toMatchObject({ status: 'pending', section: { id: 'metu' }, pendingEventName: 'Second event' });
});

it('[17] approval joins the stored event automatically', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { event } = await hostedEvent(api, 'esn-tr', 'ankara');
  const guest = await activeAccount(api, 'guest@example.com');
  await api.requestMembership({ code: event.joinCode, sectionId: 'izmir' });
  api.approveMember('esn-tr', guest.me.id);
  const membership = membershipIn(await api.me(), 'esn-tr')!;
  expect(membership).toMatchObject({ status: 'approved', section: { id: 'izmir' } });
  expect(membership).not.toHaveProperty('pendingEventName');
  expect((await api.getEvent(event.id)).people.find((p) => p.id === guest.me.id)?.section?.id).toBe('izmir');
  expect(() => api.approveMember('esn-tr', guest.me.id)).toThrow();
});

it('[18] a rejected person is told so on join, and may ask again with the code they use now', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { event } = await hostedEvent(api, 'esn-tr', 'ankara');
  const other = await api.createEvent(live('esn-tr', { name: 'Other event', scope: 'national' }));
  const guest = await activeAccount(api, 'guest@example.com');
  await api.requestMembership({ code: event.joinCode, sectionId: 'izmir' });
  api.rejectMember('esn-tr', guest.me.id);
  const rejected = membershipIn(await api.me(), 'esn-tr')!;
  // Rejecting clears the stored event.
  expect(rejected.status).toBe('rejected'); expect(rejected).not.toHaveProperty('pendingEventName');
  expect(await api.joinEvent(event.joinCode)).toMatchObject({ ok: false, reason: 'membership_rejected', approvalRequired: true });
  expect(await api.requestMembership({ code: other.joinCode, sectionId: 'bogazici' }))
    .toMatchObject({ status: 'pending', section: { id: 'bogazici' }, pendingEventName: 'Other event' });
});

it('an approved member asking again is only joined to the event; membership and section do not change', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { event } = await hostedEvent(api, 'esn-tr', 'ankara');
  await memberAccount(api, 'member@example.com', 'izmir');
  // The section is not read for an approved membership: even a wrong one is ignored.
  expect(await api.requestMembership({ code: event.joinCode, sectionId: 'bologna' })).toMatchObject({ status: 'approved', section: { id: 'izmir' } });
  expect((await api.getEvent(event.id)).people.some((p) => p.name === 'member')).toBe(true);
});

it('[D14] when approval is switched off, a pending or rejected person is let in when they next ask', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { event } = await hostedEvent(api, 'esn-tr', 'ankara');
  const pending = await activeAccount(api, 'pending@example.com');
  await api.requestMembership({ code: event.joinCode, sectionId: 'izmir' });
  const rejected = await activeAccount(api, 'rejected@example.com');
  await api.requestMembership({ code: event.joinCode, sectionId: 'metu' });
  api.rejectMember('esn-tr', rejected.me.id);
  api.updateOrganisation('esn-tr', { approvalRequired: false });
  // Nobody is let in at the moment the switch changes.
  expect(membershipIn(await api.me(), 'esn-tr')?.status).toBe('rejected');
  // Through the event code: the section already on the request is kept.
  api.setTokens(pending.tokens);
  expect(await api.joinEvent(event.joinCode)).toMatchObject({ ok: true });
  expect(membershipIn(await api.me(), 'esn-tr')).toMatchObject({ status: 'approved', section: { id: 'izmir' } });
  // Through a join request: the section sent then is used.
  api.setTokens(rejected.tokens);
  expect(await api.requestMembership({ code: event.joinCode, sectionId: 'bogazici' })).toMatchObject({ status: 'approved', section: { id: 'bogazici' } });
  expect((await api.getEvent(event.id)).id).toBe(event.id);
});

it('DEV: approveAfterMs approves a pending request on a later call and joins the stored event', async () => {
  const api = new MockApi({ latencyMs: 0, approveAfterMs: 5 });
  const { event } = await hostedEvent(api, 'esn-tr', 'ankara');
  await activeAccount(api, 'guest@example.com');
  expect((await api.requestMembership({ code: event.joinCode, sectionId: 'izmir' })).status).toBe('pending');
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(membershipIn(await api.me(), 'esn-tr')?.status).toBe('approved');
  expect((await api.getEvent(event.id)).id).toBe(event.id);
});

it('DEV: demoEvents seeds one live event per fixture organisation and nobody else in them', async () => {
  const api = new MockApi({ latencyMs: 0, demoEvents: true });
  await activeAccount(api, 'guest@example.com');
  expect(await api.joinEvent('NPL026')).toMatchObject({ ok: false, reason: 'membership_required', approvalRequired: true });
  expect(await api.joinEvent('BLQ026')).toMatchObject({ ok: false, reason: 'membership_required', approvalRequired: false });
  expect(await api.joinEvent('QUIZ26')).toMatchObject({ ok: true, event: { status: 'live', memberCount: 2 } });
});

/* ------------------------------------------------------------------ *
 * Event creation [D16]
 * ------------------------------------------------------------------ */

it('[19] event_creation = admins: a member is refused, an admin succeeds; members: approved yes, pending no', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const { event } = await hostedEvent(api, 'moda');
  await activeAccount(api, 'guest@example.com');
  await api.joinEvent(event.joinCode);
  expect(membershipIn(await api.me(), 'moda')?.canCreateEvents).toBe(false);
  await expect(api.createEvent(live('moda'))).rejects.toMatchObject({ status: 403, code: 'event_creation_not_allowed' });
  api.assignAdmin('moda', 'guest@example.com');
  expect(membershipIn(await api.me(), 'moda')).toMatchObject({ role: 'admin', canCreateEvents: true });
  expect((await api.createEvent(live('moda'))).organisation.id).toBe('moda');

  const tr = await hostedEvent(api, 'esn-tr', 'ankara');
  await activeAccount(api, 'pending@example.com');
  await api.requestMembership({ code: tr.event.joinCode, sectionId: 'izmir' });
  await expect(api.createEvent(live('esn-tr', { scope: 'section' }))).rejects.toMatchObject({ status: 403, code: 'event_creation_not_allowed' });
  await memberAccount(api, 'approved@example.com', 'izmir');
  expect((await api.createEvent(live('esn-tr', { scope: 'section' }))).section?.id).toBe('izmir');
  // The same 403 for an unknown organisation; 422 when none is named.
  await expect(api.createEvent(live('nope'))).rejects.toMatchObject({ status: 403, code: 'event_creation_not_allowed' });
  await expect(api.createEvent(live(''))).rejects.toMatchObject({ status: 422, field: 'organisationId' });
});

it('[20] scope is required with sections and refused without them', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await activeAccount(api, 'admin@example.com');
  api.assignAdmin('moda', 'admin@example.com');
  api.assignAdmin('esn-tr', 'admin@example.com', 'ankara');
  await expect(api.createEvent(live('moda', { scope: 'national' }))).rejects.toMatchObject({ status: 422, field: 'scope' });
  await expect(api.createEvent(live('esn-tr'))).rejects.toMatchObject({ status: 422, field: 'scope' });
  const bar = await api.createEvent(live('moda'));
  expect(bar).not.toHaveProperty('section'); expect(bar).not.toHaveProperty('country');
});

/* ------------------------------------------------------------------ *
 * Hints, people and sections [D15]
 * ------------------------------------------------------------------ */

it('[21]/[22] hints come from the membership in the event\'s organisation; none without sections', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const moda = await hostedEvent(api, 'moda');
  api.assignAdmin('esn-tr', 'host-moda@example.com', 'ankara');
  const tr = await api.createEvent(live('esn-tr', { scope: 'national' }));
  await memberAccount(api, 'sender@example.com', 'izmir');
  await api.joinEvent(moda.event.joinCode); await api.joinEvent(tr.joinCode);
  const post = (eventId: string, hints: { section?: boolean; country?: boolean; letter?: boolean }) =>
    api.sendBoardPost({ eventId, text: 'Hello', anonymityLevel: 'hint', allowedHints: hints });
  await expect(post(moda.event.id, { section: true })).rejects.toMatchObject({ status: 422, field: 'allowedHints' });
  await expect(post(moda.event.id, { country: true })).rejects.toMatchObject({ status: 422, field: 'allowedHints' });
  await post(moda.event.id, { letter: true });
  await post(tr.id, { section: true, country: true });
  expect((await api.getBoard(moda.event.id)).posts[0].sender).toEqual({ level: 'hint', hints: { letter: 's' } });
  expect((await api.getBoard(tr.id)).posts[0].sender).toEqual({ level: 'hint', hints: { section: 'ESN İzmir', country: 'Türkiye' } });
});

it('[23] a person with sections in two organisations shows the right one in each event', async () => {
  const api = new MockApi({ latencyMs: 0 });
  const tr = await hostedEvent(api, 'esn-tr', 'ankara');
  const eu = await hostedEvent(api, 'esn-eu', 'bologna');
  const person = await memberAccount(api, 'two@example.com', 'izmir');
  await api.joinEvent(tr.event.joinCode);
  await api.requestMembership({ code: eu.event.joinCode, sectionId: 'brno' });
  expect((await api.getEvent(tr.event.id)).people.find((p) => p.id === person.me.id)?.section?.id).toBe('izmir');
  expect((await api.getEvent(eu.event.id)).people.find((p) => p.id === person.me.id)?.section?.id).toBe('brno');
});

it('[25] a section roster is for approved members of its organisation; the organisation\'s list is for any active account', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await activeAccount(api, 'outside@example.com');
  await expect(api.getSection('ankara')).rejects.toMatchObject({ status: 404 });
  const list = await api.listOrganisationSections('esn-tr');
  expect(list.map((s) => s.id).sort()).toEqual(['ankara', 'bogazici', 'izmir', 'metu']);
  expect(await api.listOrganisationSections('moda')).toEqual([]);
  await expect(api.listOrganisationSections('nope')).rejects.toMatchObject({ status: 404 });
  await memberAccount(api, 'member@example.com', 'izmir');
  expect((await api.getSection('ankara')).id).toBe('ankara');
  await expect(api.getSection('bologna')).rejects.toMatchObject({ status: 404 });
});

it('[26] export contains the memberships; deletion removes them, also for an organisation admin', async () => {
  const api = new MockApi({ latencyMs: 0 });
  await hostedEvent(api, 'esn-tr', 'ankara');
  const exported = await api.exportAccount();
  expect(exported.memberships).toEqual([expect.objectContaining({ organisation: expect.objectContaining({ id: 'esn-tr' }), role: 'admin' })]);
  await api.deleteAccount();
  expect(api['memberships'].size).toBe(0);
});

/* ------------------------------------------------------------------ *
 * HTTP mapping
 * ------------------------------------------------------------------ */

it('maps the organisation routes and tells the three 403 codes apart', async () => {
  const responses = [
    { ok: true, status: 202, text: async () => '' },
    { ok: true, status: 200, text: async () => '[]' },
    { ok: true, status: 200, text: async () => '{}' },
    { ok: false, status: 403, text: async () => '{"code":"email_unconfirmed"}' },
    { ok: false, status: 403, text: async () => '{"code":"account_not_active"}' },
    { ok: false, status: 403, text: async () => '{"code":"event_creation_not_allowed"}' },
    { ok: false, status: 403, text: async () => '{"code":"account_restricted"}' },
  ];
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => responses.shift() as Response);
  try {
    const api = new HttpApi('https://api.example');
    api.setTokens({ accessToken: 'access', refreshToken: 'refresh' });
    await api.resendConfirmation();
    await api.listOrganisationSections('org/1');
    await api.requestMembership({ code: 'AAAAAB', sectionId: 's1' });
    await expect(api.me()).rejects.toMatchObject({ code: 'email_unconfirmed', status: 403 });
    await expect(api.me()).rejects.toMatchObject({ code: 'account_not_active', status: 403 });
    await expect(api.createEvent(live('o'))).rejects.toMatchObject({ code: 'event_creation_not_allowed', status: 403 });
    await expect(api.submitProfile({ name: 'X' })).rejects.toMatchObject({ code: 'unknown', status: 403 });
    expect(fetchMock.mock.calls.slice(0, 3).map(([url, options]) => [url, options?.method])).toEqual([
      ['https://api.example/auth/resend-confirmation', 'POST'],
      ['https://api.example/organisations/org%2F1/sections', 'GET'],
      ['https://api.example/organisations/join', 'POST'],
    ]);
    expect(fetchMock.mock.calls[2][1]?.body).toBe('{"code":"AAAAAB","sectionId":"s1"}');
  } finally {
    fetchMock.mockRestore();
  }
});

/* ------------------------------------------------------------------ *
 * Reading a section off the memberships [D15], Q5
 * ------------------------------------------------------------------ */

describe('membership section helpers', () => {
  const ankara = { id: 'ankara', name: 'ESN Ankara', country: 'Türkiye' };
  const bologna = { id: 'bologna', name: 'ESN Bologna', country: 'Italy' };
  const row = (organisationId: string, status: Membership['status'], section?: typeof ankara): Membership => ({
    organisation: { id: organisationId, name: organisationId, hasSections: Boolean(section) }, status, role: 'member',
    ...(section ? { section } : {}), canCreateEvents: false, sectionChangeAvailableAt: null });
  const me = (memberships: Membership[]): Me => ({ id: 'u', email: 'u@example.com', emailConfirmed: true, status: 'active', role: 'member', memberships });

  it('[34] the own-wall line needs exactly one APPROVED membership with a section', () => {
    expect(soleMembershipSection(me([row('esn-tr', 'approved', ankara)]))).toEqual(ankara);
    expect(soleMembershipSection(me([row('esn-tr', 'approved', ankara), row('moda', 'approved')]))).toEqual(ankara);
    expect(soleMembershipSection(me([row('esn-tr', 'approved', ankara), row('esn-eu', 'approved', bologna)]))).toBeUndefined();
    // A pending or rejected request's section does not count, either way.
    expect(soleMembershipSection(me([row('esn-tr', 'pending', ankara)]))).toBeUndefined();
    expect(soleMembershipSection(me([row('esn-tr', 'approved', ankara), row('esn-eu', 'pending', bologna)]))).toEqual(ankara);
    expect(soleMembershipSection(me([row('esn-tr', 'rejected', ankara)]))).toBeUndefined();
    expect(soleMembershipSection(me([]))).toBeUndefined();
  });

  it('[32] sectionIn reads only the approved membership of that organisation', () => {
    const account = me([row('esn-tr', 'approved', ankara), row('esn-eu', 'pending', bologna), row('moda', 'approved')]);
    expect(sectionIn(account, 'esn-tr')).toEqual(ankara);
    expect(sectionIn(account, 'esn-eu')).toBeUndefined();
    expect(sectionIn(account, 'moda')).toBeUndefined();
    expect(sectionIn(account, undefined)).toBeUndefined();
  });
});
