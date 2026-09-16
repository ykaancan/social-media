import React, { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Empty, Screen, RefreshNotice, TabHeader, Group, LoadState, ThreadRow } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import { useThreads } from '../../threads/ThreadsProvider';
import type { TabScreenProps } from '../../navigation/types';

/** Requests can be inserted above this list in stage 2; no placeholder tab now. */
export function ThreadsTab({navigation}:TabScreenProps<'Threads'>) {
  const {t}=useTranslation(),{snapshot,error,refresh}=useThreads();
  useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
  return <Screen testID="threads-screen" header={<TabHeader title={t('tabs.threads')}/>} >
    {!snapshot?<LoadState error={error} onRetry={()=>{void refresh();}}/>:<>
      {error&&<RefreshNotice onRetry={()=>{void refresh();}}/>}
      {!snapshot.threads.length?<Empty testID="threads-empty" icon="MessagesSquare" text={t('thread.empty')}/>:<Group>
        {snapshot.threads.map(thread=><ThreadRow key={thread.id} thread={thread} onPress={()=>navigation.navigate('Thread',{id:thread.id})}/>)}
      </Group>}
    </>}
  </Screen>;
}
