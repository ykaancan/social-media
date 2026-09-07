import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/core';
import { Empty, Screen } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import type { TabScreenProps } from '../../navigation/types';

/**
 * The Threads tab — `renderThreads` in `prototypes/full-app.jsx` (HANDOFF
 * §6.8), empty until threads exist.
 *
 * The title is `tabs.threads`, not `thread.title`: `thread.title` names one
 * thread ("Thread"), and this is the list.
 */
export function ThreadsTab(_props: TabScreenProps<'Threads'>) {
  const { t } = useTranslation();

  // TODO(step 7): the thread list, unread dots and the tab badge.
  //
  // Requests tab: NOT stage 1 (§4.7 — it arrives with cold DMs in stage 2), but
  // the list is designed so one can be added ABOVE it. When it comes, a
  // `Tabs variant="segmented"` goes in this header between the title row and
  // the body, exactly where the prototype reserves the space; the list below is
  // unchanged. Nothing is drawn for it now: an empty reserved band reads as a
  // rendering bug, and a tab with no requests behind it would be a fiction.

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text variant="displayLg" upper>
          {t('tabs.threads')}
        </Text>
      </View>
    </View>
  );

  return (
    <Screen header={header}>
      <Empty testID="threads-empty" icon="MessagesSquare" text={t('thread.empty')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
  },
});
