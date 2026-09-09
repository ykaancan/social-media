import React, { useState } from 'react';
import { Back, Screen, WallHeader, LoadState, MessageCard, Empty, BottomBar, Note } from '../../components/patterns';
import { Button } from '../../components/core';
import type { RootScreenProps } from '../../navigation/types';
import { useWall } from '../../messages/useWall';
import { WallComposer } from '../../messages/WallComposer';
import { useMessages } from '../../messages/MessagesProvider';
import { MessageActions } from '../../messages/MessageActions';
import { useTranslation } from '../../i18n';

/** Public wall reached only through a joined event's People tab. */
export function EventPersonScreen({ route, navigation }: RootScreenProps<'EventPerson'>) {
  const { wall, error, refresh } = useWall(route.params.id, route.params.personId);
  const { inbox } = useMessages();
  const { t } = useTranslation();
  const [composing, setComposing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = inbox?.messages.find(message => message.id === selectedId);
  return <Screen testID="event-person-screen" header={<Back onBack={() => navigation.goBack()} />}
    bottom={<>
      {wall && !error && !wall.isOwner && wall.writingPolicy !== 'nobody' && <BottomBar><Button full size="lg" icon="PenLine" testID="wall-write" onPress={() => setComposing(true)}>{t('wall.writeOnWall')}</Button></BottomBar>}
      {wall && !error && composing && <WallComposer wall={wall} eventId={route.params.id} onClose={() => setComposing(false)} />}
      {selected && <MessageActions key={selected.id} message={selected} onClose={() => { setSelectedId(null); refresh(); }} />}
    </>}>
    {error || !wall ? <LoadState error={error} onRetry={refresh} /> : <>
      <WallHeader user={{ name: wall.person.name, avatar: wall.person.avatarUrl, bio: wall.person.bio, section: wall.person.section.name, country: wall.person.section.country }}
        count={wall.count} onSection={() => navigation.navigate('Section', { id: wall.person.section.id })} />
      {!wall.isOwner && wall.writingPolicy === 'nobody' && <Note>{t('messageFlow.wallClosed')}</Note>}
      {wall.messages.map(message => <MessageCard key={message.id} message={message} wall onMore={wall.isOwner ? () => setSelectedId(message.id) : undefined} />)}
      {!wall.count && <Empty icon="StickyNote" text={t(wall.isOwner ? 'wall.emptyOwner' : 'wall.empty')} />}
    </>}
  </Screen>;
}
