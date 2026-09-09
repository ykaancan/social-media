import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text, Tabs } from '../../components/core';
import { Empty, Screen, LoadState, MessageCard, Note } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import type { MessageState } from '../../api';
import { useMessages } from '../../messages/MessagesProvider';
import { MessageActions } from '../../messages/MessageActions';
import { useMessageState } from '../../messages/useMessageState';

export function InboxTab() {
  const { t } = useTranslation();
  const { inbox, error, refresh } = useMessages();
  const move = useMessageState();
  const [filter, setFilter] = useState<MessageState>('new');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = inbox?.messages.find(message => message.id === selectedId);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return <Screen testID="inbox-screen" header={<View style={styles.header}><Text variant="displayLg" upper>{t('inbox.title')}</Text></View>}
    bottom={selected && <MessageActions key={selected.id} message={selected} onClose={() => setSelectedId(null)} />}>
    {error || !inbox ? <LoadState error={error} onRetry={() => { void refresh(); }} /> : <>
      <Tabs variant="segmented" value={filter} onChange={value => setFilter(value as MessageState)} testID="inbox-filters"
        items={(['new','private','approved'] as const).map(state => ({ id: state, label: t(`messageFlow.filters.${state}`), count: inbox.counts[state] }))} />
      {filter === 'approved' && <Note>{t('messageFlow.onWallNote')}</Note>}
      {inbox.messages.filter(message => message.state === filter).map(message => <MessageCard key={message.id} message={message}
        onMore={() => setSelectedId(message.id)} onStateChange={state => { void move(message.id, state); }} />)}
      {inbox.counts[filter] === 0 && <Empty testID="inbox-empty" icon="Inbox" text={t(filter === 'new' ? 'inbox.empty' : `messageFlow.empty.${filter}`)} />}
    </>}
  </Screen>;
}
const styles = StyleSheet.create({ header: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12, minHeight: 56 } });
