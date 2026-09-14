import React, { useState } from 'react';
import { Text, IconButton, Tabs, Input, Button } from '../../components/core';
import { Back, Screen, Empty, Group, PersonRow, LoadState, Note, EventHeader, eventDateLabel, useMonthsShort } from '../../components/patterns';
import { useLocale, useTranslation } from '../../i18n';
import { useSession } from '../../session';
import { EventColorProvider } from '../../theme';
import type { RootScreenProps } from '../../navigation/types';
import { useBoard } from '../../events/useBoard';
import { BoardPanel } from '../../events/BoardPanel';
import { BottomBar } from '../../components/patterns';
import { eventCard } from '../../events/presentation';
import { normalizeForSearch } from '../../utils/text';

export function EventDetailScreen({ route, navigation }: RootScreenProps<'EventDetail'>) {
  const { board, error, refresh } = useBoard(route.params.id);
  const event = board?.event;
  const retry = () => { void refresh(); };
  const [composing, setComposing] = useState(false);
  const { me } = useSession();
  const { t } = useTranslation();
  const locale = useLocale();
  const months = useMonthsShort();
  const [tab, setTab] = useState('board');
  const [search, setSearch] = useState('');
  const card = event && eventCard(event, locale, t('events.national'));
  const people = event?.people.filter(p => normalizeForSearch(`${p.name} ${p.section.name} ${p.section.country}`).includes(normalizeForSearch(search))) ?? [];
  return <EventColorProvider cover={event?.cover}><Screen testID="event-detail" bottom={tab==='board'&&event?.status==='live'&&<BottomBar><Button full size="lg" variant="event" icon="PenLine" testID="board-compose" onPress={()=>setComposing(true)}>{t('boardFlow.write')}</Button></BottomBar>} header={<Back onBack={() => navigation.goBack()}
    right={event && <IconButton icon="Share" label={t('common.share')} onPress={() => navigation.navigate('EventCode', { id: event.id })} />} />}>
    {!event || !card ? <LoadState error={error} onRetry={retry} /> : <>
      {error && <Note><Text>{t('boardFlow.actionError')}</Text><Button variant="ghost" onPress={retry}>{t('common.retry')}</Button></Note>}
      <EventHeader name={event.name} status={event.status} date={`${eventDateLabel(card, months)} · ${card.timeRange}`} scope={card.scope}
        statusLabel={event.closedAt && Date.now() < Date.parse(event.endsAt) ? t('eventFlow.closed') : undefined} />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'board', label: t('events.board'), count: event.postCount }, ...(event.isModerator ? [{id:'queue',label:t('events.queue'),count:board?.queue.length,hot:!!board?.queue.length}] : []), { id: 'people', label: t('events.people'), count: event.memberCount }]} />
      {tab === 'people' ? <>
        <Input label={t('events.people')} placeholder={t('eventFlow.searchPeople')} value={search} onChange={setSearch} testID="event-people-search" />
        <Group>{people.map(person => <PersonRow key={person.id} person={{ id: person.id, name: person.name, avatar: person.avatarUrl, section: person.section.name }}
          sub={`${person.section.name} · ${person.section.country}`} me={person.id === me?.id}
          onPress={() => navigation.navigate('EventPerson', { id: event.id, personId: person.id })} testID={`event-person-${person.id}`} />)}</Group>
        {!people.length && <Empty icon="Users" text={t('eventFlow.noPeople')} />}
        <Text variant="caption">{t('eventFlow.joinedCount', { n: event.memberCount })}</Text>
      </> : board && <>{event.status==='upcoming' && <Button testID="event-show-people" variant="secondary" onPress={()=>setTab('people')}>{t('events.people')}</Button>}<BoardPanel tab={tab} board={board} refresh={refresh} composing={composing} onComposerClose={()=>setComposing(false)} onProjector={()=>navigation.navigate('EventProjector',{id:event.id})}/></>}
    </>}
  </Screen></EventColorProvider>;
}
