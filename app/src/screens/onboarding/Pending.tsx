import React, { useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import {
  OnboardingHeader,
  PendingState,
  Screen,
  Text,
  WallHeader,
} from '../../components';
import { soleMembershipSection } from '../../api';
import { useTranslation } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../session';
import { useTheme } from '../../theme';

/**
 * The restricted account screen: a `banned` account [D19], in the onboarding
 * shell — the mark and a log out, `PendingState` with the restricted copy and
 * no steps, and the wall-header preview underneath.
 *
 * Until T-3 this screen was also the account approval queue (`pending` /
 * `rejected`). [D14] Approval is no longer an account state: those branches are
 * gone, and the per-organisation waiting state lives on the Events tab. The
 * file and the route keep the name `Pending` so nothing else had to move.
 *
 * It still re-reads `GET /me` every 30 s and on returning to the foreground,
 * as before, so a lifted ban takes the person on without a restart.
 */

const POLL_MS = 30_000;

export function Pending(_props: RootScreenProps<'Pending'>) {
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
      // failure, and this screen has nothing to say about any other one.
      void refresh.current().catch(() => {});
    };

    const id = setInterval(poll, POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });

    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, []);

  // Q5: the "section · country" line of your own wall only with exactly one
  // membership that has a section.
  const section = soleMembershipSection(me);

  return (
    <Screen
      testID="pending"
      header={
        <OnboardingHeader
          actionLabel={t('onboarding.logOut')}
          onAction={() => {
            void logout();
          }}
          testID="pending-logout"
        />
      }
    >
      <PendingState
        testID="pending-state"
        title={t('reviewFlow.bannedTitle')}
        subtitle={t('reviewFlow.bannedBody')}
        steps={[]}
      />

      <View style={styles.preview}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('onboarding.wallPreview')}
        </Text>
        <WallHeader
          preview
          testID="pending-preview"
          user={{
            name: me?.name ?? '',
            section: section?.name,
            country: section?.country,
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
  preview: { gap: 8, paddingTop: 8 },
});
