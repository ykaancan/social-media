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
  it('shows the empty state, the coach mark and two actions that do not pretend to work', async () => {
    await signInApproved(approvedApi());

    await waitFor(() =>
      expect(
        screen.getByText('Nothing here yet. Events you join or create show up in this list.'),
      ).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByTestId('coach-mark')).toBeTruthy());
    expect(screen.getByText('Join an event to get started')).toBeTruthy();

    // Step 3 owns both flows, so both buttons are disabled rather than toasting
    // a promise (principle 4).
    expect(screen.getByTestId('events-join').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('events-create').props.accessibilityState.disabled).toBe(true);
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

    // Nothing counts approved messages yet, so nothing claims to.
    expect(screen.queryByText(/on the wall/)).toBeNull();
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
