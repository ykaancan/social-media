import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useApi, type ReportReason } from '../../api';
import { AnonymityBadge } from '../../components/anonymity';
import { ThreadBubble, PostCard } from '../../components/cards';
import { IconButton, Text, Button } from '../../components/core';
import { Back, Screen, LoadState, Note, MoreSheet, threadMoreItems, ConfirmSheet, ReportSheet, ThreadComposer, useToast } from '../../components/patterns';
import { useLocale, useTranslation } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../session';
import { useMessages } from '../../messages/MessagesProvider';
import { useThread } from '../../threads/useThread';
import { useThreads } from '../../threads/ThreadsProvider';
import { useSendAttempt } from '../../threads/FirstReply';
import { threadMessageText } from '../../threads/presentation';

export function ThreadScreen({route,navigation}:RootScreenProps<'Thread'>) {
  const api=useApi(),{thread,error,refresh}=useThread(route.params.id),{refresh:refreshList}=useThreads(),{refresh:refreshInbox}=useMessages();
  const {t}=useTranslation(),locale=useLocale(),{me}=useSession(),toast=useToast(),attempt=useSendAttempt();
  const [sheet,setSheet]=useState<string|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const working=useRef(false),lastRead=useRef(''),focused=useIsFocused();
  const scroll=useRef<ScrollView>(null);
  const latest=thread?.messages.at(-1)?.id;
  // Reading acknowledges only the messages rendered by this foreground screen.
  const markRead=useCallback(()=>{
    if(!focused||!latest||lastRead.current===latest||AppState.currentState!=='active')return;
    lastRead.current=latest;
    void api.markThreadRead(route.params.id,latest).then(refreshList).catch(()=>{lastRead.current='';});
  },[api,focused,latest,refreshList,route.params.id]);
  useEffect(markRead,[markRead,thread]);
  useFocusEffect(useCallback(()=>{const listener=AppState.addEventListener('change',state=>{if(state==='active')markRead();});return()=>listener.remove();},[markRead]));
  const run=async(action:()=>Promise<unknown>,after?:()=>void)=>{
    if(working.current)return;working.current=true;setBusy(true);setFailed(false);
    try{await action();setSheet(null);await refreshList();if(after)after();else await refresh();}
    catch{setFailed(true);}finally{working.current=false;setBusy(false);}
  };
  const open=(value:string)=>{setFailed(false);setSheet(value);};
  return <Screen testID="thread-screen" scrollRef={scroll} onContentSizeChange={()=>scroll.current?.scrollToEnd({animated:false})} keyboard contentStyle={{paddingBottom:240}} header={<Back middle={thread&&<View style={{gap:4}}><AnonymityBadge {...thread.other}/>{thread.other.level!=='named'&&<Text variant="caption">{t('threadFlow.from',{event:thread.source})}</Text>}</View>} onBack={()=>navigation.goBack()}
    right={thread&&<IconButton icon="Ellipsis" label={t('common.more')} testID="thread-more" onPress={()=>open('more')}/>}/>}
    bottom={thread&&<ThreadComposer key={thread.id} onScreen={text=>api.screenMessage(text,'thread')} onSend={async(text,ack)=>{
      const payload={text,screeningAcknowledged:ack};await api.sendThreadMessage(thread.id,{...payload,requestId:attempt.key(payload)});attempt.complete();await refresh();await refreshList();
    }}/> }>
    {!thread?<LoadState error={error} onRetry={()=>{void refresh();}}/>:<>
      {error&&<Note><Text>{t('threadFlow.actionError')}</Text><Button variant="ghost" onPress={()=>{void refresh();}}>{t('common.retry')}</Button></Note>}
      <Text variant="captionCaps">{t(thread.origin.mine?'threadFlow.yourPost':'threadFlow.theirPost',{event:thread.source})}</Text>
      <PostCard text={thread.origin.text} sender={thread.origin.sender} eventOutline testID="thread-origin"/>
      {thread.messages.map(message=><ThreadBubble key={message.id} testID={`bubble-${message.id}`} text={threadMessageText(message)}
        mine={message.mine} sender={message.sender} system={!!message.system}
        time={new Date(message.createdAt).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}/>)}
      {sheet==='more'&&<MoreSheet items={threadMoreItems({canReveal:thread.canReveal,otherIsNamed:thread.other.level==='named',otherFirstName:thread.other.name},t)} onClose={()=>setSheet(null)} onPick={open}/>}
      {sheet==='reveal'&&<ConfirmSheet danger={false} title={t('anon.revealMyself')} body={t('threadFlow.revealBody')} action={t('anon.revealMyself')}
        busy={busy} error={failed?t('threadFlow.actionError'):undefined} onClose={()=>setSheet(null)}
        preview={<View style={{gap:8}}><Text variant="caption">{t('threadFlow.preview')}</Text><AnonymityBadge level="named" name={me!.name} avatar={me!.avatarUrl} size="lg"/></View>}
        onConfirm={()=>{void run(async()=>{await api.revealInThread(thread.id);toast.show(t('threadFlow.revealDone'));});}}/>}
      {sheet==='report'&&<ReportSheet threadNote busy={busy} error={failed?t('threadFlow.actionError'):undefined} onClose={()=>setSheet(null)}
        onReport={reason=>{void run(async()=>{await api.reportThread(thread.id,reason as ReportReason);toast.show(t('report.sent'));});}}/>}
      {sheet==='block'&&<ConfirmSheet title={t('common.block')} body={t('threadFlow.blockBody')} action={t('common.block')}
        busy={busy} error={failed?t('threadFlow.actionError'):undefined} onClose={()=>setSheet(null)}
        onConfirm={()=>{void run(async()=>{await api.blockThread(thread.id,thread.blockMessageId);await refreshInbox();},()=>navigation.popTo('Shell',{screen:'Threads'}));}}/>}
    </>}
  </Screen>;
}
