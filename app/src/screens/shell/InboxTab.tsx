import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/core';
import { Empty, Screen } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import type { TabScreenProps } from '../../navigation/types';

/**
 * The Inbox tab — `renderInbox` in `prototypes/full-app.jsx` (HANDOFF §6.8),
 * at the only state it can be in today: empty.
 *
 * The prototype's New / Private / On wall filter, the cards and the per-card
 * actions [D12] arrive with the inbox API; none of them is drawn here, because
 * an empty filter bar over an empty list would imply messages exist somewhere.
 */
export function InboxTab(_props: TabScreenProps<'Inbox'>) {
  const { t } = useTranslation();

  // TODO(step 4): the inbox query, the state filter [D12] and the Settings
  // header button ("who can write to me") go here.

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text variant="displayLg" upper>
          {t('inbox.title')}
        </Text>
      </View>
    </View>
  );

  return (
    <Screen header={header}>
      <Empty testID="inbox-empty" icon="Inbox" text={t('inbox.empty')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // `S.header` / `S.hrow`, same box as every other tab root.
  header: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
  },
});
