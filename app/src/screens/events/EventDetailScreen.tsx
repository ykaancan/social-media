import React, { useState } from 'react';
import { Text, IconButton, Tabs, Input, Button } from '../../components/core';
import { Back, Screen, Empty, Group, PersonRow, LoadState, Note, EventHeader, eventDateLabel, useMonthsShort } from '../../components/patterns';
import { useLocale, useTranslation } from '../../i18n';
import { useSession } from '../../session';
import { EventColorProvider } from '../../theme';
import type { RootScreenProps } from '../../navigation/types';
import { useEvent } from '../../events/useEvent';
import { eventCard } from '../../events/presentation';
import { normalizeForSearch } from '../../utils/text';

export function EventDetailScreen({ route, navigation }: RootScreenProps<'EventDetail'>) {
  const { event, error, retry } = useEvent(route.params.id);
  const { me } = useSession();
  const { t } = useTranslation();
  const locale = useLocale();
  const months = useMonthsShort();
  const [tab, setTab] = useState('board');
  const [search, setSearch] = useState('');
  const card = event && eventCard(event, locale, t('events.national'));
  const people = event?.people.filter(p => normalizeForSearch(`${p.name} ${p.section.name} ${p.section.country}`).includes(normalizeForSearch(search))) ?? [];
  return <EventColorProvider cover={event?.cover}><Screen testID="event-detail" header={<Back onBack={() => navigation.goBack()}
    right={event && <IconButton icon="Share" label={t('common.share')} onPress={() => navigation.navigate('EventCode', { id: event.id })} />} />}>
    {error || !event || !card ? <LoadState error={error} onRetry={retry} /> : <>
      <EventHeader name={event.name} status={event.status} date={`${eventDateLabel(card, months)} · ${card.timeRange}`} scope={card.scope}
        statusLabel={event.closedAt && Date.now() < Date.parse(event.endsAt) ? t('eventFlow.closed') : undefined} />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'board', label: t('events.board'), count: event.postCount }, { id: 'people', label: t('events.people'), count: event.memberCount }]} />
      {tab === 'people' ? <>
        <Input label={t('events.people')} placeholder={t('eventFlow.searchPeople')} value={search} onChange={setSearch} testID="event-people-search" />
        <Group>{people.map(person => <PersonRow key={person.id} person={{ id: person.id, name: person.name, avatar: person.avatarUrl, section: person.section.name }}
          sub={`${person.section.name} · ${person.section.country}`} me={person.id === me?.id}
          onPress={() => navigation.navigate('EventPerson', { id: event.id, personId: person.id })} testID={`event-person-${person.id}`} />)}</Group>
        {!people.length && <Empty icon="Users" text={t('eventFlow.noPeople')} />}
        <Text variant="caption">{t('eventFlow.joinedCount', { n: event.memberCount })}</Text>
      </> : event.status === 'upcoming' ? <>
        <Empty icon="Radio" tint text={t('eventFlow.opensAt', { date: `${eventDateLabel({day:card.day, month:card.month}, months)} · ${new Date(event.startsAt).toLocaleTimeString(locale, {hour:'2-digit',minute:'2-digit',hour12:false})}` })} />
        <Button testID="event-show-people" variant="secondary" onPress={() => setTab('people')}>{t('events.people')}</Button>
      </> : <>
        {event.status === 'archived' && <Note icon="Lock">{t('eventFlow.archived')}</Note>}
        {/* Full feed and writing interactions belong to Step 5. No invented posts. */}
        {event.postCount === 0 && <Empty icon="Radio" text={t('eventFlow.noPosts')} />}
        {event.postCount > 0 && <Text>{t('events.posts', { n: event.postCount })}</Text>}
      </>}
    </>}
  </Screen></EventColorProvider>;
}
