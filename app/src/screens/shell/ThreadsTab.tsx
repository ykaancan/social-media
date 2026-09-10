import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text, Button } from '../../components/core';
import { Empty, Screen, Group, LoadState, Note, ThreadRow } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import { useThreads } from '../../threads/ThreadsProvider';
import type { TabScreenProps } from '../../navigation/types';

/** Requests can be inserted above this list in stage 2; no placeholder tab now. */
export function ThreadsTab({navigation}:TabScreenProps<'Threads'>) {
  const {t}=useTranslation(),{snapshot,error,refresh}=useThreads();
  useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
  return <Screen testID="threads-screen" header={<View style={{paddingTop:6,paddingHorizontal:16,paddingBottom:12,minHeight:56}}><Text variant="displayLg" upper>{t('tabs.threads')}</Text></View>}>
    {!snapshot?<LoadState error={error} onRetry={()=>{void refresh();}}/>:<>
      {error&&<Note><Text>{t('threadFlow.actionError')}</Text><Button variant="ghost" onPress={()=>{void refresh();}}>{t('common.retry')}</Button></Note>}
      {!snapshot.threads.length?<Empty testID="threads-empty" icon="MessagesSquare" text={t('thread.empty')}/>:<Group>
        {snapshot.threads.map(thread=><ThreadRow key={thread.id} thread={thread} onPress={()=>navigation.navigate('Thread',{id:thread.id})}/>)}
      </Group>}
    </>}
  </Screen>;
}
