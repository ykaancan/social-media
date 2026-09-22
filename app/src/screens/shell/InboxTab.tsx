import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Tabs } from '../../components/core';
import { Empty, Screen, RefreshNotice, TabHeader, LoadState, MessageCard, Note } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import type { MessageState } from '../../api';
import { useMessages } from '../../messages/MessagesProvider';
import { MessageActions } from '../../messages/MessageActions';
import { useMessageState } from '../../messages/useMessageState';

export function InboxTab() {
  const { t } = useTranslation();
  const { inbox, error, refresh } = useMessages();
  const { move, pendingIds } = useMessageState();
  const [filter, setFilter] = useState<MessageState>('new');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = inbox?.messages.find(message => message.id === selectedId);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return <Screen testID="inbox-screen" header={<TabHeader title={t('inbox.title')}/>}
    bottom={selected && <MessageActions key={selected.id} message={selected} onClose={() => setSelectedId(null)} />}>
    {!inbox ? <LoadState error={error} onRetry={() => { void refresh(); }} /> : <>
      {error && <RefreshNotice onRetry={() => { void refresh(); }} />}
      <Tabs variant="segmented" value={filter} onChange={value => setFilter(value as MessageState)} testID="inbox-filters"
        items={(['new','private','approved'] as const).map(state => ({ id: state, label: t(`messageFlow.filters.${state}`), count: inbox.counts[state] }))} />
      {filter === 'approved' && <Note>{t('messageFlow.onWallNote')}</Note>}
      {inbox.messages.filter(message => message.state === filter).map(message => <MessageCard key={message.id} message={message} busy={pendingIds.has(message.id)}
        onMore={() => setSelectedId(message.id)} onStateChange={state => { void move(message.id, state); }} />)}
      {inbox.counts[filter] === 0 && <Empty testID="inbox-empty" icon="Inbox" text={t(filter === 'new' ? 'inbox.empty' : `messageFlow.empty.${filter}`)} />}
    </>}
  </Screen>;
}
