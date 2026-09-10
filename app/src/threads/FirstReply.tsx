import React, { useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useApi, type ThreadOrigin } from '../api';
import { ReplySheet, type PostPreview } from '../components/patterns';
import { useSession } from '../session';
import { useThreads } from './ThreadsProvider';

/** One stable idempotency key per submitted payload, retained after a lost response. */
export function useSendAttempt(){
  const attempt=useRef<{fingerprint:string;id:string}|null>(null);
  const key=(payload:unknown)=>{const fingerprint=JSON.stringify(payload);
    if(attempt.current?.fingerprint!==fingerprint)attempt.current={fingerprint,id:`send-${Date.now()}-${Math.random().toString(36).slice(2)}`};
    return attempt.current!.id;
  };
  return {key,complete:()=>{attempt.current=null;}};
}
export function FirstReply({origin,post,onClose}:{origin:ThreadOrigin;post:PostPreview;onClose:()=>void}) {
  const api=useApi(),{me}=useSession(),navigation=useNavigation(),{refresh}=useThreads(),attempt=useSendAttempt();
  return <ReplySheet post={post} me={{name:me!.name!,avatar:me!.avatarUrl,section:me!.section!.name,country:me!.section!.country}}
    onClose={onClose} onScreen={text=>api.screenMessage(text)} onSend={async payload=>{
      const input={origin,text:payload.text,anonymityLevel:payload.level,allowedHints:{section:!!payload.hints?.section,country:!!payload.hints?.country,letter:!!payload.hints?.letter},screeningAcknowledged:payload.screeningAcknowledged};
      const result=await api.openThread({...input,requestId:attempt.key(input)});
      attempt.complete();await refresh();onClose();navigation.navigate('Thread',{id:result.id});
    }}/>;
}
