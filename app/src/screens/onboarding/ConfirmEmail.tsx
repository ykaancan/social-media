import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isApiError, useApi } from '../../api';
import {
  BottomBar,
  Button,
  Note,
  OnboardingHeader,
  PendingState,
  Screen,
  useToast,
} from '../../components';
import { useTranslation } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../session';

/**
 * Confirm your email [D18] — the only screen an account with
 * `emailConfirmed === false` has. Not in the design bundle; built from the
 * onboarding pieces Pending already uses (TENANT_PLAN.md, "Decision before
 * T-3"): `OnboardingHeader`, `PendingState` without steps, `Note`, `BottomBar`.
 *
 * - The address shown is the person's own, from `me.email`.
 * - "Resend email" calls `POST /auth/resend-confirmation`. The server always
 *   answers 202 and sends at most one link per 60 seconds (P3), so a success is
 *   shown as the neutral "sent, check your inbox" and the button rests for 60
 *   seconds. A failed call is never shown as sent: it gets the usual error toast.
 * - Right after sign-up the button also rests, for what is left of the first 60
 *   seconds: the sign-up mail has just been sent and a resend would send nothing.
 * - "I've confirmed" re-reads `GET /me`; so does coming back to the foreground.
 *   Once the email is confirmed the navigator moves on by itself. If the button
 *   finds it still unconfirmed, the screen says so.
 * - The way out is Log out. No onboarding screen offers account deletion, so
 *   this one does not either.
 */

/** The server's resend spacing (TENANT_PLAN.md P3). */
export const RESEND_WAIT_MS = 60_000;

export function ConfirmEmail(_props: RootScreenProps<'ConfirmEmail'>) {
  const { me, refreshMe, logout, registeredAt } = useSession();
  const api = useApi();
  const { t } = useTranslation();
  const toast = useToast();

  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  /**
   * How much of the 60 s since sign-up is left when the screen opens. The
   * sign-up mail has just gone out and the server would send no second link
   * yet, so the button starts resting instead of showing "Sent" for nothing.
   * Zero when the session came from a login or from stored tokens.
   */
  const [initialRest] = useState(() =>
    registeredAt == null ? 0 : Math.max(0, RESEND_WAIT_MS - (Date.now() - registeredAt)),
  );
  /** True for 60 s after sign-up, and for 60 s after a resend the server accepted. */
  const [resting, setResting] = useState(initialRest > 0);
  const [sent, setSent] = useState(false);
  const [stillUnconfirmed, setStillUnconfirmed] = useState(false);
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialRest > 0) {
      restTimer.current = setTimeout(() => setResting(false), initialRest);
    }
    return () => {
      if (restTimer.current) clearTimeout(restTimer.current);
    };
  }, [initialRest]);

  /** Held in a ref so the AppState listener is set up once. */
  const refresh = useRef(refreshMe);
  useEffect(() => {
    refresh.current = refreshMe;
  }, [refreshMe]);

  // Coming back from the mail app is when the link was most likely opened. A
  // silent re-read: nothing is said if it is still unconfirmed or offline.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh.current().catch(() => {});
    });
    return () => subscription.remove();
  }, []);

  const showError = useCallback(
    (err: unknown) => {
      if (isApiError(err, 'network')) {
        toast.show(t('onboarding.errorNetwork'), { tone: 'warn' });
        return;
      }
      toast.show(t('onboarding.errorGeneric'), { tone: 'danger' });
    },
    [t, toast],
  );

  const check = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const next = await refreshMe({ throwOnNetwork: true });
      // Confirmed: the navigator swaps this screen out. Signed out: likewise.
      if (next && !next.emailConfirmed) setStillUnconfirmed(true);
    } catch (err) {
      showError(err);
    } finally {
      setChecking(false);
    }
  }, [checking, refreshMe, showError]);

  const resend = useCallback(async () => {
    if (sending || resting) return;
    setSending(true);
    try {
      await api.resendConfirmation();
      setSent(true);
      setStillUnconfirmed(false);
      setResting(true);
      restTimer.current = setTimeout(() => setResting(false), RESEND_WAIT_MS);
    } catch (err) {
      showError(err);
    } finally {
      setSending(false);
    }
  }, [api, resting, sending, showError]);

  return (
    <Screen
      testID="confirm-email"
      header={
        <OnboardingHeader
          actionLabel={t('onboarding.logOut')}
          onAction={() => {
            void logout();
          }}
          testID="confirm-logout"
        />
      }
      bottom={
        <BottomBar>
          <Button
            size="lg"
            full
            icon="Check"
            loading={checking}
            onPress={() => {
              void check();
            }}
            testID="confirm-check"
          >
            {t('onboarding.confirmDone')}
          </Button>
          <Button
            size="lg"
            full
            variant="ghost"
            icon="Send"
            loading={sending}
            disabled={resting}
            onPress={() => {
              void resend();
            }}
            testID="confirm-resend"
          >
            {t('onboarding.confirmResend')}
          </Button>
        </BottomBar>
      }
    >
      <PendingState
        testID="confirm-state"
        title={t('onboarding.confirmTitle')}
        subtitle={t('onboarding.confirmSub', { email: me?.email ?? '' })}
      />
      {stillUnconfirmed ? (
        <Note icon="TriangleAlert" testID="confirm-still">
          {t('onboarding.confirmStill')}
        </Note>
      ) : null}
      {sent ? (
        <Note testID="confirm-sent">
          {t('onboarding.confirmSent')}
        </Note>
      ) : null}
    </Screen>
  );
}
