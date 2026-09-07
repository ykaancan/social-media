import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ApiProvider } from '../../../api';
import { MockApi } from '../../../api/mock';
import { ToastHost } from '../../../components';
import { initI18n, t } from '../../../i18n';
import { RootNavigator } from '../../../navigation/RootNavigator';
import { clearTokens, SessionProvider, useSession, type SessionValue } from '../../../session';
import { ThemeProvider } from '../../../theme';
import { upper } from '../../../utils/text';
import type { Me, ProfileRequest } from '../../../api/types';

/**
 * Profile setup and Pending, driven through the real navigator so the thing
 * under test is the whole route: the form sends the profile, the group swaps,
 * and the Pending screen polls until the admin has decided.
 *
 * `MockApi` stands in for the server; nothing here mounts a screen in
 * isolation, because "did the navigator move" is half of what these two
 * screens promise.
 */

initI18n();

// The section sheet is a Modal whose entrance animation never advances under
// reanimated's jest mock, so RNTL would treat its body as hidden.
configure({ defaultIncludeHiddenElements: true });

// expo-image-picker is a native module: the screen owns the permission prompt
// and the picker, and the tests only need it not to explode on import.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const CREDENTIALS = { email: 'zehra@example.com', password: 'sekizkarakter' };

/** Reaches the session from outside the tree so a test can register or submit. */
function Driver({ into }: { into: { current: SessionValue | null } }) {
  into.current = useSession();
  return null;
}

/** RNTL 14 renders concurrently: `render` is awaited, or the first commit
 *  never lands and the session sits in `booting`. */
async function mount(api: MockApi) {
  const session: { current: SessionValue | null } = { current: null };
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ApiProvider api={api}>
          <SessionProvider>
            <ToastHost>
              <Driver into={session} />
              <RootNavigator />
            </ToastHost>
          </SessionProvider>
        </ApiProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return () => session.current as SessionValue;
}

/** Registers, which lands an `incomplete` account on the profile form. */
async function reachProfileSetup(api: MockApi) {
  const s = await mount(api);
  await waitFor(() => expect(s().phase).toBe('signedOut'));
  await act(async () => {
    await s().register(CREDENTIALS);
  });
  await waitFor(() => expect(screen.getByTestId('profile-submit')).toBeTruthy());
  return s;
}

async function pickAnkara() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-section-field'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('section-ankara'));
  });
}

const disabled = (testID: string) =>
  Boolean(screen.getByTestId(testID).props.accessibilityState?.disabled);

beforeEach(async () => {
  await clearTokens();
});

/* ------------------------------------------------------------------ *
 * ProfileSetup
 * ------------------------------------------------------------------ */

test('send stays disabled until there is both a name and a section', async () => {
  await reachProfileSetup(new MockApi({ latencyMs: 0, approveAfterMs: 60_000 }));

  expect(disabled('profile-submit')).toBe(true);

  // A name alone is not enough — and whitespace is not a name.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), '   ');
  });
  expect(disabled('profile-submit')).toBe(true);

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), 'Zehra Ak');
  });
  expect(disabled('profile-submit')).toBe(true);

  await pickAnkara();
  expect(disabled('profile-submit')).toBe(false);
});

test('[D11] picking a section fills the country row and the preview chip', async () => {
  await reachProfileSetup(new MockApi({ latencyMs: 0, approveAfterMs: 60_000 }));

  // Nothing is invented before a section is chosen: the row shows its
  // placeholder, not a guess.
  expect(screen.getByText(t('onboarding.countryFromSection'))).toBeTruthy();

  await pickAnkara();

  expect(screen.getByText('ESN Ankara')).toBeTruthy();
  // Türkiye is on the country row AND on the preview chip, from the one choice.
  expect(screen.getByText('Türkiye')).toBeTruthy();
  expect(screen.getByText('ESN Ankara · Türkiye')).toBeTruthy();
});

test('[D11] the country row is not a control — it cannot be pressed', async () => {
  await reachProfileSetup(new MockApi({ latencyMs: 0, approveAfterMs: 60_000 }));
  await pickAnkara();

  const country = screen.getByTestId('profile-country-field');
  expect(country.props.accessibilityRole).toBeUndefined();
  expect(country.props.onPress).toBeUndefined();
  // The section row beside it IS a button, so this is a real difference.
  expect(screen.getByTestId('profile-section-field').props.accessibilityRole).toBe('button');
});

test('the avatar: a refusal is explained, and a picked photo reaches the server', async () => {
  const api = new MockApi({ latencyMs: 0, approveAfterMs: 60_000 });
  const s = await reachProfileSetup(api);

  const permission = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
  const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;

  // Refused: say what to do next, and change nothing.
  permission.mockResolvedValueOnce({ granted: false });
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-photo-button'));
  });
  expect(screen.getByText(t('onboarding.photoPermission'))).toBeTruthy();
  expect(launch).not.toHaveBeenCalled();

  launch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///tmp/zehra.jpg' }] });
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-photo-button'));
  });

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), 'Zehra Ak');
  });
  await pickAnkara();
  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-submit'));
  });

  await waitFor(() => expect(screen.getByTestId('pending')).toBeTruthy());
  // The local URI is what the client sends; the mock hands it straight back
  // where the real server would return a resized URL.
  expect(s().me?.avatarUrl).toBe('file:///tmp/zehra.jpg');
});

test('sending the profile stores it and the navigator lands on Pending', async () => {
  const api = new MockApi({ latencyMs: 0, approveAfterMs: 60_000 });
  const s = await reachProfileSetup(api);

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-name'), 'Zehra Ak');
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('profile-bio'), 'Ankara, coffee, night trains');
  });
  await pickAnkara();

  await act(async () => {
    fireEvent.press(screen.getByTestId('profile-submit'));
  });

  await waitFor(() => expect(screen.getByTestId('pending')).toBeTruthy());
  expect(s().me?.status).toBe('pending');
  expect(s().me?.name).toBe('Zehra Ak');
  expect(s().me?.section?.id).toBe('ankara');
  // [D11] The country came along with the section; it was never sent.
  expect(s().me?.section?.country).toBe('Türkiye');

  // The three steps, with the profile line describing what was actually sent.
  // `PendingState` sets its title through `Text upper`.
  expect(screen.getByText(upper(t('onboarding.pendingTitle')))).toBeTruthy();
  expect(screen.getByText(t('onboarding.stepSent'))).toBeTruthy();
  expect(screen.getByText(t('onboarding.stepReview'))).toBeTruthy();
  expect(screen.getByText(t('onboarding.stepIn'))).toBeTruthy();
  expect(screen.getByText('Zehra Ak · ESN Ankara')).toBeTruthy();
  expect(screen.getByTestId('pending-logout')).toBeTruthy();
});

/* ------------------------------------------------------------------ *
 * Pending
 * ------------------------------------------------------------------ */

test('Pending polls until the admin decides, then the navigator moves on', async () => {
  // Fake timers, and deliberately no `waitFor`: RNTL's waitFor advances the
  // clock itself, which would run the 30 s poll before the test could see the
  // screen sitting in the queue. `flush` moves the clock by a millisecond at a
  // time instead — enough for the keychain read and the mock's promises, far
  // short of a poll.
  const flush = async (rounds = 10) => {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
    }
  };

  // `setImmediate` and `nextTick` stay real: the keychain read and RN's own
  // async plumbing ride on them, and faking those deadlocks the boot.
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  try {
    const api = new MockApi({ latencyMs: 0, approveAfterMs: 50 });
    const s = await mount(api);

    await flush();
    expect(s().phase).toBe('signedOut');

    await act(async () => {
      await s().register(CREDENTIALS);
      await s().submitProfile({ name: 'Zehra Ak', sectionId: 'ankara' });
    });
    await flush();

    expect(screen.getByTestId('pending')).toBeTruthy();
    expect(s().me?.status).toBe('pending');

    // Nothing changes on its own: the screen only learns what a poll told it,
    // and the admin took 50 ms of this clock.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await flush();

    expect(s().me?.status).toBe('approved');
    // [D2] Approved means the four-tab shell, not this screen.
    expect(screen.queryByTestId('pending')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

/* ------------------------------------------------------------------ *
 * Rejected — the one state the prototype never drew
 * ------------------------------------------------------------------ */

/** A server that turns the profile down instead of queueing it. */
class RejectingApi extends MockApi {
  override async me(): Promise<Me> {
    return { ...(await super.me()), status: 'rejected' };
  }

  override async submitProfile(req: ProfileRequest): Promise<Me> {
    return { ...(await super.submitProfile(req)), status: 'rejected' };
  }
}

test('a rejected account is told plainly, and can edit a prefilled form', async () => {
  const api = new RejectingApi({ latencyMs: 0, approveAfterMs: 60_000 });
  const s = await mount(api);

  await waitFor(() => expect(s().phase).toBe('signedOut'));
  await act(async () => {
    await s().register(CREDENTIALS);
    await s().submitProfile({
      name: 'Zehra Ak',
      sectionId: 'ankara',
      bio: 'Ankara, coffee, night trains',
    });
  });

  await waitFor(() => expect(screen.getByTestId('pending')).toBeTruthy());
  expect(screen.getByText(upper(t('onboarding.rejectedTitle')))).toBeTruthy();
  expect(screen.getByText(t('onboarding.rejectedNote'))).toBeTruthy();
  // Nothing is pending any more, so the queue copy is gone.
  expect(screen.queryByText(upper(t('onboarding.pendingTitle')))).toBeNull();
  expect(screen.queryByText(t('onboarding.stepIn'))).toBeNull();

  // [D8] The recovery path is the form again, not an appeal.
  await act(async () => {
    fireEvent.press(screen.getByTestId('pending-edit'));
  });

  await waitFor(() => expect(screen.getByTestId('profile-submit')).toBeTruthy());
  expect(screen.getByTestId('profile-name').props.value).toBe('Zehra Ak');
  expect(screen.getByTestId('profile-bio').props.value).toBe('Ankara, coffee, night trains');
  expect(screen.getByText('ESN Ankara')).toBeTruthy();
  expect(screen.getByText('Türkiye')).toBeTruthy();
  // The label does not change in edit mode: resending IS what re-queues it.
  expect(disabled('profile-submit')).toBe(false);
  expect(screen.getByText(t('onboarding.sendForApproval'))).toBeTruthy();
});
