import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, ApiProvider, type ApiClient, type SectionDetail } from '../../api';
import { MockApi } from '../../api/mock';
import { ToastHost } from '../../components/patterns';
import { initI18n } from '../../i18n';
import { RootNavigator } from '../../navigation';
import { getPref, PREF_KEYS, setPref } from '../../prefs';
import { clearTokens, SessionProvider, useSession, type SessionValue } from '../../session';
import { EventColorProvider, ThemeProvider } from '../../theme';

/**
 * The four tab roots and the section page, driven through the real navigator so
 * the parts that only exist in composition are covered: the tab bar, the push
 * onto the root stack, and the session the screens read.
 *
 * What these tests really guard is honesty. Every screen here is empty because
 * the data does not exist yet, and each test asserts that the app says so
 * rather than filling the space — no "0 on the wall", no enabled button that
 * leads nowhere, no roster longer than the server sent.
 */

initI18n();

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Reaches the session from inside the tree so the test can drive onboarding. */
function Driver({ into }: { into: { current: SessionValue | null } }) {
  into.current = useSession();
  return null;
}

async function mount(api: ApiClient) {
  const session: { current: SessionValue | null } = { current: null };

  // Inside `act` because the session boots on mount: `loadTokens()` resolves a
  // tick later and dispatches, which React otherwise warns about.
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

/**
 * Registers, sends a profile and lets the mock's demo admin approve it, which
 * is what puts the four-tab shell in the tree at all.
 */
async function signInApproved(api: ApiClient) {
  const s = await mount(api);

  await waitFor(() => expect(s().phase).toBe('signedOut'));
  await act(async () => {
    await s().register({ email: 'deniz@example.com', password: 'sekizkarakter' });
    await s().submitProfile({
      name: 'Deniz Aksoy',
      sectionId: 'ankara',
      bio: 'Board member at ESN Ankara.',
    });
    await s().refreshMe();
  });
  await waitFor(() => expect(s().me?.status).toBe('approved'));

  return s;
}

const approvedApi = () => new MockApi({ latencyMs: 0, approveAfterMs: 0 });

beforeEach(async () => {
  await clearTokens();
  await AsyncStorage.clear();
});

describe('Events tab', () => {
  it('shows the empty state, the coach mark and working join/create entry points', async () => {
    await signInApproved(approvedApi());

    await waitFor(() =>
      expect(
        screen.getByText('Nothing here yet. Events you join or create show up in this list.'),
      ).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByTestId('coach-mark')).toBeTruthy());
    expect(screen.getByText('Join an event to get started')).toBeTruthy();

    expect(screen.getByTestId('events-join').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('events-create').props.accessibilityState.disabled).toBe(false);
  });

  it('creates an event, shows its real QR code, opens its roster and returns to the refreshed list', async () => {
    const api = approvedApi();
    await signInApproved(api);
    await act(async () => { fireEvent.press(screen.getByTestId('events-create')); });
    await act(async () => { fireEvent.changeText(screen.getByTestId('create-name'), 'Welcome night'); });
    await act(async () => { fireEvent.press(screen.getByTestId('create-submit')); });
    await waitFor(() => expect(screen.getByTestId('event-code-screen')).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText('Event join QR code')).toBeTruthy());
    const events = await api.listMyEvents();
    expect(events).toHaveLength(1);
    expect(events[0].memberCount).toBe(1);
    await act(async () => { fireEvent.press(screen.getByText('Done')); });
    await waitFor(() => expect(screen.getByTestId('event-detail')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('event-show-people')).toBeTruthy());
    // Upcoming board's secondary action opens People.
    await act(async () => { fireEvent.press(screen.getByTestId('event-show-people')); });
    await waitFor(() => expect(screen.getByTestId('event-people-search')).toBeTruthy());
    await act(async () => { fireEvent.changeText(screen.getByTestId('event-people-search'), 'DENİZ'); });
    await waitFor(() => expect(screen.getByTestId('event-person-u1')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('event-person-u1')); });
    await waitFor(() => expect(screen.getByTestId('event-person-screen')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByLabelText('Back')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('Back')); });
    await waitFor(() => expect(screen.getByTestId(`event-${events[0].id}`)).toBeTruthy());
  });

  it('keeps the join form usable after an invalid code or network failure', async () => {
    const api = approvedApi();
    await signInApproved(api);
    await act(async () => { fireEvent.press(screen.getByTestId('events-join')); });
    await act(async () => { fireEvent.changeText(screen.getByTestId('join-code'), 'ZZZ-ZZZ'); });
    await act(async () => { fireEvent.press(screen.getByTestId('join-submit')); });
    await waitFor(() => expect(screen.getByText('No event with that code. Check it with whoever shared it.')).toBeTruthy());
    jest.spyOn(api, 'joinEvent').mockRejectedValueOnce(new ApiError('network'));
    await act(async () => { fireEvent.press(screen.getByTestId('join-submit')); });
    await waitFor(() => expect(screen.getByText('Couldn’t load this. Check your connection and try again.')).toBeTruthy());
    expect(screen.getByTestId('join-submit').props.accessibilityState.disabled).toBe(false);
  });

  it('joins another member’s event and opens the joined detail', async () => {
    const api = approvedApi();
    await api.register({ email: 'organizer@example.com', password: 'password123' });
    await api.submitProfile({ name: 'Organizer', sectionId: 'izmir' }); await api.me();
    const event = await api.createEvent({ name: 'İzmir meetup', scope: 'section', cover: 'azure', boardMode: 'approve_first',
      startsAt: new Date(Date.now()+3600000).toISOString(), endsAt: new Date(Date.now()+7200000).toISOString() });
    await api.logout();
    await signInApproved(api);
    await act(async () => { fireEvent.press(screen.getByTestId('events-join')); });
    await act(async () => { fireEvent.changeText(screen.getByTestId('join-code'), event.joinCode); });
    await act(async () => { fireEvent.press(screen.getByTestId('join-submit')); });
    await waitFor(() => expect(screen.getByTestId('join-open')).toBeTruthy());
    expect((await api.getEvent(event.id)).memberCount).toBe(2);
    await act(async () => { fireEvent.press(screen.getByTestId('join-open')); });
    await waitFor(() => expect(screen.getByTestId('event-detail')).toBeTruthy());
  });

  it('hides the coach mark on "Got it" and remembers it', async () => {
    await signInApproved(approvedApi());
    await waitFor(() => expect(screen.getByTestId('coach-mark')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Got it'));
    });

    expect(screen.queryByTestId('coach-mark')).toBeNull();
    await waitFor(async () => expect(await getPref(PREF_KEYS.coachMarkDismissed)).not.toBeNull());
  });

  it('never shows the coach mark again on a device that dismissed it', async () => {
    await setPref(PREF_KEYS.coachMarkDismissed, '1');
    await signInApproved(approvedApi());

    await waitFor(() => expect(screen.getByTestId('events-empty')).toBeTruthy());
    expect(screen.queryByTestId('coach-mark')).toBeNull();
  });
});

describe('Inbox and Threads tabs', () => {
  it('are empty, and say why', async () => {
    await signInApproved(approvedApi());
    await waitFor(() => expect(screen.getByTestId('events-empty')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('tab-inbox'));
    });
    await waitFor(() =>
      expect(screen.getByText('No messages yet. Join an event and see.')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('tab-threads'));
    });
    await waitFor(() =>
      expect(
        screen.getByText('No threads yet. Reply privately to a post to start one.'),
      ).toBeTruthy(),
    );
  });
});

describe('Profile tab', () => {
  it('is the owner own wall: header, section chip, empty wall and no invented count', async () => {
    await signInApproved(approvedApi());
    await waitFor(() => expect(screen.getByTestId('events-empty')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('tab-profile'));
    });

    await waitFor(() => expect(screen.getByTestId('profile-wall-header')).toBeTruthy());
    expect(screen.getByText('MY WALL')).toBeTruthy();
    expect(screen.getByText('DENIZ AKSOY')).toBeTruthy();
    // [D11] section and country on one chip; the country is never its own field.
    expect(screen.getByText('ESN Ankara · Türkiye')).toBeTruthy();
    expect(screen.getByText('Board member at ESN Ankara.')).toBeTruthy();
    expect(
      screen.getByText('Approved messages will show here. Approve one from your inbox.'),
    ).toBeTruthy();

    // The approved count comes from the inbox query.
    expect(screen.getByText(/0 on the wall/)).toBeTruthy();
  });
});

/** Profile tab -> the section chip -> the pushed Section screen. */
async function openSection(api: ApiClient) {
  await signInApproved(api);
  await waitFor(() => expect(screen.getByTestId('events-empty')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('tab-profile'));
  });
  await waitFor(() => expect(screen.getByText('ESN Ankara · Türkiye')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByText('ESN Ankara · Türkiye'));
  });
}

describe('Section screen', () => {
  it('lists the roster with the signed-in member first, the real count and "and N more"', async () => {
    await openSection(approvedApi());

    await waitFor(() => expect(screen.getByTestId('section-roster')).toBeTruthy());
    expect(screen.getByText('SECTION')).toBeTruthy();
    expect(screen.getByText('ESN ANKARA')).toBeTruthy();
    expect(screen.getByText('Türkiye')).toBeTruthy();
    // 212 fixture members plus the viewer, who really did just join it.
    expect(screen.getByText('213 members')).toBeTruthy();
    expect(
      screen.getByText(
        'A section is a tag people put on their profile. It has no admins and no board of its own.',
      ),
    ).toBeTruthy();

    // The viewer heads their own section roster, marked "· you".
    const first = within(screen.getByTestId('section-person-0'));
    expect(first.getByText('Deniz Aksoy · you')).toBeTruthy();
    expect(screen.getByTestId('section-person-1')).toBeTruthy();

    // 213 members, 6 rows sent: the rest are named honestly, not padded out.
    expect(screen.getByText('and 207 more')).toBeTruthy();
  });

  it('omits "and N more" when the roster IS the whole section', async () => {
    class WholeRoster extends MockApi {
      async getSection(id: string): Promise<SectionDetail> {
        const detail = await super.getSection(id);
        const roster = detail.roster.slice(0, 2);
        return { ...detail, memberCount: roster.length, roster, rosterTotal: roster.length };
      }
    }

    await openSection(new WholeRoster({ latencyMs: 0, approveAfterMs: 0 }));

    await waitFor(() => expect(screen.getByTestId('section-roster')).toBeTruthy());
    expect(screen.getByText('2 members')).toBeTruthy();
    expect(screen.queryByTestId('section-more')).toBeNull();
  });

  it('offers Retry when the roster cannot be loaded, and loads it on the retry', async () => {
    class FlakyApi extends MockApi {
      failNext = true;

      async getSection(id: string): Promise<SectionDetail> {
        if (this.failNext) {
          this.failNext = false;
          throw new ApiError('network', 'offline');
        }
        return super.getSection(id);
      }
    }

    await openSection(new FlakyApi({ latencyMs: 0, approveAfterMs: 0 }));

    await waitFor(() => expect(screen.getByTestId('section-error')).toBeTruthy());
    expect(
      screen.getByText("Couldn't reach the server. Check your connection and try again."),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('section-retry'));
    });

    await waitFor(() => expect(screen.getByTestId('section-roster')).toBeTruthy());
    expect(screen.queryByTestId('section-error')).toBeNull();
  });
});


it('keeps the New badge, inbox filters and owner wall synchronized', async () => {
  const api = approvedApi();
  const session = await signInApproved(api);
  const ownerId = session().me!.id;
  await waitFor(() => expect(screen.getByTestId('events-empty')).toBeTruthy());
  await act(async () => {
    const event = await api.createEvent({name:'Message test',scope:'section',cover:'coral',boardMode:'approve_first',
      startsAt:new Date(Date.now()+3600000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString()});
    await api.register({email:'sender@example.com',password:'password123'});
    await api.submitProfile({name:'Sender',sectionId:'izmir'}); await api.me(); await api.joinEvent(event.joinCode);
    await api.sendWallMessage({eventId:event.id,recipientId:ownerId,text:'A real test message',anonymityLevel:'anonymous',allowedHints:{}});
    await api.login({email:'deniz@example.com',password:'sekizkarakter'});
  });
  await fireEvent.press(screen.getByTestId('tab-inbox'));
  await waitFor(() => expect(screen.getByTestId('message-message-1')).toBeTruthy());
  expect(within(screen.getByTestId('tab-inbox')).getByText('1')).toBeTruthy();
  await fireEvent.press(within(screen.getByTestId('message-message-1')).getByText('Approve to wall'));
  await waitFor(() => expect(screen.queryByTestId('message-message-1')).toBeNull());
  expect(within(screen.getByTestId('tab-inbox')).queryByText('1')).toBeNull();
  await fireEvent.press(screen.getByTestId('tab-profile'));
  await waitFor(() => expect(screen.getByText('A real test message')).toBeTruthy());
  expect(screen.getByText(/1 on the wall/)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('tab-inbox'));
  await fireEvent.press(screen.getByRole('tab',{name:'On wall'}));
  await fireEvent.press(within(screen.getByTestId('message-message-1')).getByText('Keep private'));
  await waitFor(() => expect(screen.queryByTestId('message-message-1')).toBeNull());
  await fireEvent.press(screen.getByTestId('tab-profile'));
  await waitFor(() => expect(screen.getByTestId('profile-empty')).toBeTruthy());
  expect(screen.queryByText('A real test message')).toBeNull();
});
