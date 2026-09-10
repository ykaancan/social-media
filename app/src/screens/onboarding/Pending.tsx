import React, { useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import {
  Button,
  PendingState,
  Screen,
  Text,
  WallHeader,
  Wordmark,
  type PendingStep,
} from '../../components';
import { useTranslation } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../session';
import { useTheme } from '../../theme';

/**
 * Pending approval — the `pending` branch of
 * `/design/bundle/prototypes/onboarding-app.jsx`: the mark and a log out, the
 * three-step `PendingState`, and the wall-header preview underneath.
 *
 * The prototype has no rejected screen — its demo admin only ever approves — so
 * the `rejected` variant here is the one thing on this screen with no pixel
 * spec. It reuses the same `PendingState` with the second step closed instead
 * of current, and puts "Edit profile" in the body rather than the thumb zone:
 * there is no primary action while rejected, only a way back to the form.
 *
 * No timeline is promised anywhere in the copy, and there is no spinner or
 * "checking…" line: a person reads every profile by hand and the screen must
 * not imply otherwise.
 */

/** The prototype polls nothing; the app does, because approval happens elsewhere. */
const POLL_MS = 30_000;

export function Pending({ navigation }: RootScreenProps<'Pending'>) {
  const { me, refreshMe, logout } = useSession();
  const { t } = useTranslation();
  const { colors } = useTheme();

  /**
   * `refreshMe` is rebuilt whenever the session state changes, so it is held in
   * a ref: the interval is set up once for the life of the screen instead of
   * being torn down and restarted on every refresh.
   */
  const refresh = useRef(refreshMe);
  useEffect(() => {
    refresh.current = refreshMe;
  }, [refreshMe]);

  useEffect(() => {
    const poll = () => {
      // A poll is never an event: `refreshMe` already swallows a network
      // failure, and this screen has nothing to say about any other one. The
      // navigator moves the person on by itself when the status flips.
      void refresh.current().catch(() => {});
    };

    const id = setInterval(poll, POLL_MS);
    // Coming back from the background is the moment approval is most likely to
    // have happened while the app was not looking.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });

    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, []);

  const rejected = me?.status === 'rejected', banned=me?.status==='banned';

  // "{name} · {section}" — both are set from `pending` onward, but the line is
  // built from what is actually there rather than printing a stray separator.
  const sent = [me?.name, me?.section?.name].filter(Boolean).join(' · ');

  const steps: PendingStep[] = banned ? [] : rejected
    ? [
        { label: t('onboarding.stepSent'), done: true, description: sent || undefined },
        { label: t('onboarding.stepReview'), done: true, description: t('onboarding.rejectedNote') },
      ]
    : [
        { label: t('onboarding.stepSent'), done: true, description: sent || undefined },
        {
          label: t('onboarding.stepReview'),
          current: true,
          description: t('onboarding.stepReviewDesc'),
        },
        { label: t('onboarding.stepIn'), description: t('onboarding.stepInDesc') },
      ];

  return (
    <Screen
      testID="pending"
      header={
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Wordmark treatment="plain" size="sm" />
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                void logout();
              }}
              testID="pending-logout"
            >
              {t('onboarding.logOut')}
            </Button>
          </View>
        </View>
      }
    >

      <PendingState
        testID="pending-state"
        title={banned?t('reviewFlow.bannedTitle'):rejected ? t('onboarding.rejectedTitle') : t('onboarding.pendingTitle')}
        subtitle={banned?t('reviewFlow.bannedBody'):rejected ? undefined : t('onboarding.pendingSub')}
        steps={steps}
        note={rejected||banned ? undefined : t('onboarding.pendingNote')}
      />

      {rejected ? (
        // [D7]/[D8] Editing and resending is the whole recovery path; it returns
        // the account to `pending` rather than opening a separate appeal.
        <Button
          size="lg"
          full
          variant="secondary"
          icon="Pencil"
          onPress={() => navigation.navigate('ProfileSetup', { edit: true })}
          testID="pending-edit"
        >
          {t('onboarding.editProfile')}
        </Button>
      ) : null}

      <View style={styles.preview}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('onboarding.wallPreview')}
        </Text>
        <WallHeader
          preview
          testID="pending-preview"
          user={{
            name: me?.name ?? '',
            section: me?.section?.name,
            country: me?.section?.country,
            bio: me?.bio,
            avatar: me?.avatarUrl,
            hasPhoto: Boolean(me?.avatarUrl),
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // S.header from the prototype, without a title.
  header: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
  },
  preview: { gap: 8, paddingTop: 8 },
});
