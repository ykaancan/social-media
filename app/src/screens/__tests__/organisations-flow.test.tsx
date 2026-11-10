import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, ApiProvider, type CreateEventRequest } from '../../api';
import { MockApi } from '../../api/mock';
import { activeAccount, TEST_PASSWORD } from '../../api/testing';
import { ToastHost } from '../../components/patterns';
import { initI18n, t } from '../../i18n';
import { RootNavigator } from '../../navigation';
import { clearTokens, SessionProvider, useSession, type SessionValue } from '../../session';
import { EventColorProvider, ThemeProvider } from '../../theme';

/**
 * Step T-3 acceptance tests 29–34 (TENANT_PLAN.md §9), driven through the real
 * navigator against the mock: joining an organisation through an event code,
 * the waiting and rejected cards, event creation per organisation, composer
 * hints, the per-organisation section change and the own-wall section line.
 *
 * Fixture organisations: `esn-tr` approval + sections, `esn-eu` open +
 * sections, `moda` open without sections, event creation for admins only.
 */

initI18n();

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const EMAIL = 'deniz@example.com';

function Driver({ into }: { into: { current: SessionValue | null } }) {
  into.current = useSession();
  return null;
}

async function mount(api: MockApi) {
  const session: { current: SessionValue | null } = { current: null };
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <EventColorProvider>
            <ApiProvider api={api}>
              <SessionProvider>
                <ToastHost>
                  <Driver into={session} />
                  <RootNavigator />
                </ToastHost>
              </SessionProvider>
            </ApiProvider>
          </EventColorProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return () => session.current as SessionValue;
}

const live = (organisationId: string, name: string, extra: Partial<CreateEventRequest> = {}): CreateEventRequest => ({
  organisationId, name, cover: 'coral', boardMode: 'post_immediately',
  startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), ...extra });

/** A host (admin of the organisation) with one live event there. Signs the host out again. */
async function hostedEvent(api: MockApi, organisationId: string, name: string, sectionId?: string) {
  const email = `host-${organisationId}-${name.replace(/\W/g, '')}@example.com`;
  await activeAccount(api, email, 'Host');
  api.assignAdmin(organisationId, email, sectionId);
  const event = await api.createEvent(live(organisationId, name, sectionId ? { scope: 'national' } : {}));
  await api.logout();
  return event;
}

/**
 * Deniz: confirmed, profile sent, `active`, with whatever memberships `setup`
 * gives the account (none by default). The Events tab is on screen.
 */
async function signIn(api: MockApi, setup: (email: string) => void = () => undefined) {
  await activeAccount(api, EMAIL, 'Deniz Aksoy');
  setup(EMAIL);
  await api.logout();
  const s = await mount(api);
  await waitFor(() => expect(s().phase).toBe('signedOut'));
  await act(async () => { await s().login({ email: EMAIL, password: TEST_PASSWORD }); });
  await waitFor(() => expect(screen.getByTestId('events-screen')).toBeTruthy());
  return s;
}

const enterCode = async (code: string) => {
  await fireEvent.press(screen.getByTestId('events-join'));
  await fireEvent.changeText(screen.getByTestId('join-code'), code);
  await fireEvent.press(screen.getByTestId('join-submit'));
};

/** Leaves the Events tab and comes back: the focus refresh re-reads /me and the list. */
const refocusEvents = async () => {
  await fireEvent.press(screen.getByTestId('tab-inbox'));
  await fireEvent.press(screen.getByTestId('tab-events'));
};

beforeEach(async () => {
  await clearTokens();
  await AsyncStorage.clear();
});

describe('[29]/[30] joining an organisation through an event code', () => {
  it('approval + sections: section picker with the read-only country, a waiting card naming the organisation and the event, then the approval shows on refocus', async () => {
    const api = new MockApi({ latencyMs: 0 });
    const event = await hostedEvent(api, 'esn-tr', 'National Platform', 'izmir');
    const s = await signIn(api);
    await waitFor(() => expect(screen.getByTestId('events-empty')).toBeTruthy());

    await enterCode(event.joinCode);
    await waitFor(() => expect(screen.getByTestId('join-request')).toBeTruthy());
    expect(screen.getByText(t('joinFlow.intro', { organisation: 'ESN Türkiye', event: 'National Platform' }))).toBeTruthy();
    expect(screen.getByText(t('joinFlow.approvalNote', { organisation: 'ESN Türkiye', event: 'National Platform' }))).toBeTruthy();
    expect(screen.getByTestId('join-country')).toBeTruthy();
    expect(screen.getByTestId('join-request').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('join-section-field'));
    // Only ESN Türkiye's sections are offered.
    await waitFor(() => expect(screen.getByTestId('section-ankara')).toBeTruthy());
    expect(screen.queryByTestId('section-bologna')).toBeNull();
    await fireEvent.press(screen.getByTestId('section-ankara'));
    expect(within(screen.getByTestId('join-country')).getByText('Türkiye')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('join-request'));

    await waitFor(() => expect(screen.queryByTestId('join-sheet')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('membership-pending-esn-tr')).toBeTruthy());
    const card = within(screen.getByTestId('membership-pending-esn-tr'));
    expect(card.getByText(t('membershipFlow.pendingTitle', { organisation: 'ESN Türkiye' }).toUpperCase())).toBeTruthy();
    expect(card.getByText(t('membershipFlow.stepInEvent', { event: 'National Platform' }))).toBeTruthy();
    expect(screen.getByTestId('events-empty')).toBeTruthy();

    // A second try with the code says it is still waiting, with no second step.
    await enterCode(event.joinCode);
    await waitFor(() => expect(screen.getByTestId('join-pending')).toBeTruthy());
    expect(screen.queryByTestId('join-request')).toBeNull();
    await fireEvent.press(screen.getByTestId('join-sheet-close'));
    await waitFor(() => expect(screen.queryByTestId('join-sheet')).toBeNull());

    api.approveMember('esn-tr', s().me!.id);
    await refocusEvents();
    await waitFor(() => expect(screen.queryByTestId('membership-pending-esn-tr')).toBeNull());
    await waitFor(() => expect(screen.getByTestId(`event-${event.id}`)).toBeTruthy());
  });

  it('a rejected request shows a note and can be asked again through the same step', async () => {
    const api = new MockApi({ latencyMs: 0 });
    const event = await hostedEvent(api, 'esn-tr', 'National Platform', 'izmir');
    const s = await signIn(api);
    await act(async () => { await api.requestMembership({ code: event.joinCode, sectionId: 'ankara' }); });
    api.rejectMember('esn-tr', s().me!.id);
    await refocusEvents();
    await waitFor(() => expect(screen.getByTestId('membership-rejected-esn-tr')).toBeTruthy());
    expect(screen.getByText(t('membershipFlow.rejected', { organisation: 'ESN Türkiye' }))).toBeTruthy();
    expect(screen.queryByText(/removed/i)).toBeNull();

    await enterCode(event.joinCode);
    await waitFor(() => expect(screen.getByTestId('join-rejected')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('join-ask-again'));
    await waitFor(() => expect(screen.getByTestId('join-section')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('join-section-field'));
    await waitFor(() => expect(screen.getByTestId('section-metu')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('section-metu'));
    await fireEvent.press(screen.getByTestId('join-request'));
    await waitFor(() => expect(screen.getByTestId('membership-pending-esn-tr')).toBeTruthy());
    expect(screen.queryByTestId('membership-rejected-esn-tr')).toBeNull();
    expect(s().me?.memberships[0]).toMatchObject({ status: 'pending', section: { id: 'metu' }, pendingEventName: 'National Platform' });
  });

  it('open + sections: picker, no review line, and the person lands in the event', async () => {
    const api = new MockApi({ latencyMs: 0 });
    const event = await hostedEvent(api, 'esn-eu', 'Welcome Week', 'bologna');
    await signIn(api);
    await enterCode(event.joinCode);
    await waitFor(() => expect(screen.getByTestId('join-request')).toBeTruthy());
    expect(screen.queryByTestId('join-approval-note')).toBeNull();
    await fireEvent.press(screen.getByTestId('join-section-field'));
    await waitFor(() => expect(screen.getByTestId('section-milano')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('section-milano'));
    await fireEvent.press(screen.getByTestId('join-request'));
    await waitFor(() => expect(screen.getByTestId('join-open')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('join-open'));
    await waitFor(() => expect(screen.getByTestId('event-detail')).toBeTruthy());
    expect((await api.getEvent(event.id)).memberCount).toBe(2);
  });

  it('a refused section is shown on the section field', async () => {
    const api = new MockApi({ latencyMs: 0 });
    const event = await hostedEvent(api, 'esn-eu', 'Welcome Week', 'bologna');
    await signIn(api);
    jest.spyOn(api, 'requestMembership').mockRejectedValueOnce(new ApiError('validation', 'bad section', 422, 'sectionId'));
    await enterCode(event.joinCode);
    await fireEvent.press(screen.getByTestId('join-section-field'));
    await waitFor(() => expect(screen.getByTestId('section-milano')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('section-milano'));
    await fireEvent.press(screen.getByTestId('join-request'));
    await waitFor(() => expect(screen.getByTestId('join-section-error')).toBeTruthy());
    expect(screen.getByText(t('joinFlow.sectionInvalid'))).toBeTruthy();
  });

  it('an open organisation without sections is entered in one step, with no second step', async () => {
    const api = new MockApi({ latencyMs: 0 });
    const event = await hostedEvent(api, 'moda', 'Quiz Night');
    await signIn(api);
    await enterCode(event.joinCode);
    await waitFor(() => expect(screen.getByTestId('join-open')).toBeTruthy());
    expect(screen.queryByTestId('join-request')).toBeNull();
  });
});

describe('[31] create event per organisation', () => {
  it('is not offered without a membership that may create', async () => {
    const api = new MockApi({ latencyMs: 0 });
    // A plain member of Moda Bar, where only admins create.
    await signIn(api, email => api.addMember('moda', email));
    await waitFor(() => expect(screen.getByTestId('events-join')).toBeTruthy());
    expect(screen.queryByTestId('events-create')).toBeNull();
  });

  it('with one organisation it is implied; without sections there is no section / national and no scope is sent', async () => {
    const api = new MockApi({ latencyMs: 0 });
    await signIn(api, email => api.assignAdmin('moda', email));
    const create = jest.spyOn(api, 'createEvent');
    await waitFor(() => expect(screen.getByTestId('events-create')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('events-create'));
    expect(screen.queryByTestId('create-scope')).toBeNull();
    expect(within(screen.getByTestId('create-organisation')).getByText('Moda Bar')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('create-name'), 'Quiz night');
    await fireEvent.press(screen.getByTestId('create-submit'));
    await waitFor(() => expect(screen.getByTestId('event-code-screen')).toBeTruthy());
    expect(create.mock.calls[0][0]).toMatchObject({ organisationId: 'moda', name: 'Quiz night' });
    expect(create.mock.calls[0][0]).not.toHaveProperty('scope');
  });

  it('asks for the organisation only when more than one may create', async () => {
    const api = new MockApi({ latencyMs: 0 });
    await signIn(api, email => { api.addMember('esn-tr', email, 'ankara'); api.assignAdmin('moda', email); });
    const create = jest.spyOn(api, 'createEvent');
    await waitFor(() => expect(screen.getByTestId('events-create')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('events-create'));
    await fireEvent.changeText(screen.getByTestId('create-name'), 'Welcome night');
    expect(screen.getByTestId('create-submit').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('create-organisation-field'));
    await fireEvent.press(screen.getByRole('radio', { name: 'ESN Türkiye' }));
    expect(screen.getByTestId('create-scope')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('create-submit'));
    await waitFor(() => expect(screen.getByTestId('event-code-screen')).toBeTruthy());
    expect(create.mock.calls[0][0]).toMatchObject({ organisationId: 'esn-tr', scope: 'section' });
  });

  it('a 403 event_creation_not_allowed says so and re-reads /me, which takes the action away', async () => {
    const api = new MockApi({ latencyMs: 0 });
    await signIn(api, email => api.addMember('esn-tr', email, 'ankara'));
    await waitFor(() => expect(screen.getByTestId('events-create')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('events-create'));
    api.updateOrganisation('esn-tr', { eventCreation: 'admins' });
    await fireEvent.changeText(screen.getByTestId('create-name'), 'Welcome night');
    await fireEvent.press(screen.getByTestId('create-submit'));
    await waitFor(() => expect(screen.getByText(t('createFlow.notAllowed', { organisation: 'ESN Türkiye' }))).toBeTruthy());
    await fireEvent.press(screen.getByTestId('create-sheet-close'));
    await waitFor(() => expect(screen.queryByTestId('events-create')).toBeNull());
  });
});

describe('[32] composer hints follow the event organisation', () => {
  it('a board of an organisation without sections offers first letter only', async () => {
    const api = new MockApi({ latencyMs: 0 });
    // Deniz has a section in ESN Türkiye, but none in Moda Bar.
    await signIn(api, email => { api.addMember('esn-tr', email, 'ankara'); api.assignAdmin('moda', email); });
    let eventId = '';
    await act(async () => { eventId = (await api.createEvent(live('moda', 'Quiz Night'))).id; });
    await refocusEvents();
    await waitFor(() => expect(screen.getByTestId(`event-${eventId}`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`event-${eventId}`));
    await waitFor(() => expect(screen.getByTestId('board-compose')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('board-compose'));
    await waitFor(() => expect(screen.getByTestId('composer')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('anonymity-option-hint'));
    expect(screen.queryByTestId('anonymity-hint-section')).toBeNull();
    expect(screen.queryByTestId('anonymity-hint-country')).toBeNull();
    expect(screen.getByTestId('anonymity-hint-letter')).toBeTruthy();
  });

  it('a board of an organisation with the sender\'s section offers section and country', async () => {
    const api = new MockApi({ latencyMs: 0 });
    await signIn(api, email => api.addMember('esn-tr', email, 'ankara'));
    let eventId = '';
    await act(async () => { eventId = (await api.createEvent(live('esn-tr', 'Board', { scope: 'section' }))).id; });
    await refocusEvents();
    await waitFor(() => expect(screen.getByTestId(`event-${eventId}`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`event-${eventId}`));
    await waitFor(() => expect(screen.getByTestId('board-compose')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('board-compose'));
    await waitFor(() => expect(screen.getByTestId('composer')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('anonymity-option-hint'));
    expect(screen.getByTestId('anonymity-hint-section')).toBeTruthy();
    expect(screen.getByTestId('anonymity-hint-country')).toBeTruthy();
  });
});

describe('[33] Settings · change section per organisation', () => {
  const openSettings = async () => {
    await fireEvent.press(screen.getByTestId('tab-profile'));
    await fireEvent.press(screen.getByTestId('profile-settings'));
    await waitFor(() => expect(screen.getByText(t('settings.whoCanWrite'))).toBeTruthy());
  };

  it('lists one row per approved membership with sections, each with its own next-change date', async () => {
    const api = new MockApi({ latencyMs: 0 });
    const s = await signIn(api, email => { api.addMember('esn-tr', email, 'ankara'); api.addMember('esn-eu', email, 'bologna'); api.addMember('moda', email); });
    await openSettings();
    expect(screen.getByText(t('settingsFlow.sectionIn', { organisation: 'ESN Türkiye' }))).toBeTruthy();
    expect(screen.getByText(t('settingsFlow.sectionIn', { organisation: 'ESN Europe' }))).toBeTruthy();
    expect(screen.queryByTestId('settings-section-moda')).toBeNull();
    expect(within(screen.getByTestId('settings-section-esn-tr')).getByText('ESN Ankara · Türkiye')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('settings-section-esn-tr'));
    await waitFor(() => expect(screen.getByTestId('change-section')).toBeTruthy());
    expect(screen.getByText(t('settingsFlow.sectionNote'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('change-section'));
    await waitFor(() => expect(screen.getByTestId('section-izmir')).toBeTruthy());
    // Only this organisation's sections.
    expect(screen.queryByTestId('section-bologna')).toBeNull();
    await fireEvent.press(screen.getByTestId('section-izmir'));
    await fireEvent.press(screen.getByTestId('confirm-action'));
    await waitFor(() => expect(screen.queryByTestId('change-section')).toBeNull());
    const trMembership = s().me!.memberships.find(m => m.organisation.id === 'esn-tr')!;
    const wait = t('settingsFlow.sectionWait', { date: new Date(trMembership.sectionChangeAvailableAt!).toLocaleDateString('en') });
    expect(screen.getByText(wait)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Back'));
    await waitFor(() => expect(screen.getByTestId('settings-section-esn-tr')).toBeTruthy());
    expect(within(screen.getByTestId('settings-section-esn-tr')).getByText(`ESN İzmir · Türkiye\n${wait}`)).toBeTruthy();
    expect(within(screen.getByTestId('settings-section-esn-eu')).getByText('ESN Bologna · Italy')).toBeTruthy();

    // ESN Europe has its own limit: still changeable.
    await fireEvent.press(screen.getByTestId('settings-section-esn-eu'));
    await waitFor(() => expect(screen.getByTestId('change-section')).toBeTruthy());
    expect(screen.getByTestId('settings-section-page')).toBeTruthy();
  });

  it('shows no section row without such a membership', async () => {
    const api = new MockApi({ latencyMs: 0 });
    await signIn(api, email => api.addMember('moda', email));
    await openSettings();
    expect(screen.queryByTestId(/^settings-section-/)).toBeNull();
    expect(screen.queryByText(t('settings.mySection'))).toBeNull();
  });
});

describe('[34] own Profile tab section line', () => {
  it('shows nothing with two memberships that have a section', async () => {
    const api = new MockApi({ latencyMs: 0 });
    await signIn(api, email => { api.addMember('esn-tr', email, 'ankara'); api.addMember('esn-eu', email, 'bologna'); });
    await fireEvent.press(screen.getByTestId('tab-profile'));
    await waitFor(() => expect(screen.getByTestId('profile-wall-header')).toBeTruthy());
    expect(screen.queryByText('ESN Ankara · Türkiye')).toBeNull();
    expect(screen.queryByText('ESN Bologna · Italy')).toBeNull();
  });

  it('shows the one section, ignoring a pending request elsewhere', async () => {
    const api = new MockApi({ latencyMs: 0 });
    const event = await hostedEvent(api, 'esn-tr', 'National Platform', 'izmir');
    await signIn(api, email => api.addMember('esn-eu', email, 'bologna'));
    await act(async () => { await api.requestMembership({ code: event.joinCode, sectionId: 'ankara' }); });
    await refocusEvents();
    await waitFor(() => expect(screen.getByTestId('membership-pending-esn-tr')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('tab-profile'));
    await waitFor(() => expect(screen.getByText('ESN Bologna · Italy')).toBeTruthy());
    expect(screen.queryByText('ESN Ankara · Türkiye')).toBeNull();
  });
});
