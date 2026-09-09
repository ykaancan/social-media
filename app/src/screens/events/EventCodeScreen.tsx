import React from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { EventCard, JoinCodeBlock } from '../../components/cards';
import { Button, Text } from '../../components/core';
import { Back, BottomBar, Screen, LoadState, useToast } from '../../components/patterns';
import { useLocale, useTranslation } from '../../i18n';
import { EventColorProvider } from '../../theme';
import type { RootScreenProps } from '../../navigation/types';
import { useEvent } from '../../events/useEvent';
import { eventCard } from '../../events/presentation';

export function EventCodeScreen({ route, navigation }: RootScreenProps<'EventCode'>) {
  const { event, error, retry } = useEvent(route.params.id);
  const { t } = useTranslation();
  const locale = useLocale();
  const toast = useToast();
  const done = () => route.params.created ? navigation.replace('EventDetail', { id: route.params.id }) : navigation.goBack();
  return <EventColorProvider cover={event?.cover}><Screen testID="event-code-screen" header={<Back onBack={done} title={t(route.params.created ? 'eventFlow.created' : 'events.joinCode')} />}
    bottom={<BottomBar><Button full size="lg" onPress={done}>{t('common.done')}</Button></BottomBar>}>
    {error || !event ? <LoadState error={error} onRetry={retry} /> : <>
      <Text>{t(route.params.created ? 'eventFlow.createdHelp' : 'eventFlow.codeHelp')}</Text>
      <EventCard {...eventCard(event, locale, t('events.national'))} compact />
      <JoinCodeBlock code={event.joinCode} generateQr onCopy={() => { void Clipboard.setStringAsync(event.joinCode)
        .then(ok => toast.show(t(ok ? 'common.copied' : 'eventFlow.requestError'))).catch(() => toast.show(t('eventFlow.requestError'))); }}
        onShare={() => { void Share.share({ message: t('eventFlow.shareMessage', { name: event.name, code: event.joinCode }) }).catch(() => toast.show(t('eventFlow.requestError'))); }} />
      <Text variant="caption">{t('events.boardMode')}: {t(event.boardMode === 'approve_first' ? 'events.approveFirst' : 'events.postImmediately')}</Text>
    </>}
  </Screen></EventColorProvider>;
}
