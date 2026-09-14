import React, { useCallback } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { EventColorProvider, ThemeProvider } from '../../theme';
import { Back, Screen, LoadState } from '../../components/patterns';
import { ProjectorStage } from '../../components/projector/ProjectorStage';
import { useBoard } from '../../events/useBoard';
import type { RootScreenProps } from '../../navigation/types';

export function EventProjectorScreen({route,navigation}:RootScreenProps<'EventProjector'>) {
  const {board,error,refresh}=useBoard(route.params.id);
  useFocusEffect(useCallback(()=>{
    if(Platform.OS==='web') return;
    const tag='projector-'+route.params.id;
    let active=true;
    void activateKeepAwakeAsync(tag).then(()=>{if(!active)void deactivateKeepAwake(tag).catch(()=>{});}).catch(()=>{});
    return ()=>{active=false;void deactivateKeepAwake(tag).catch(()=>{});};
  },[route.params.id]));
  return <ThemeProvider scheme="projector"><EventColorProvider cover={board?.event.cover}>
    <StatusBar hidden />
    {!board||error?<Screen header={<Back onBack={()=>navigation.goBack()}/>}><LoadState error={error} onRetry={()=>{void refresh();}}/></Screen>
      :<ProjectorStage name={board.event.name} posts={board.posts} status={board.event.status} onExit={()=>navigation.goBack()}/>}
  </EventColorProvider></ThemeProvider>;
}
