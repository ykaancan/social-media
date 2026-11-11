import React, { useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { sectionIn, useApi, type ThreadOrigin } from '../api';
import { LoadState, ReplySheet, type PostPreview } from '../components/patterns';
import { Sheet } from '../components/core';
import { useEventOrganisation } from '../events/useEventOrganisation';
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
/**
 * [D15] The hint section is the sender's section in the organisation of the
 * event the thread starts from: a board post passes its event's organisation;
 * an inbox message passes the event it was written from (`source.eventId`),
 * which is read once. Without either, no section or country hint is offered.
 */
export function FirstReply({origin,post,organisationId,eventId,onClose}:{origin:ThreadOrigin;post:PostPreview;organisationId?:string;eventId?:string;onClose:()=>void}) {
  const api=useApi(),{me}=useSession(),navigation=useNavigation(),{refresh}=useThreads(),attempt=useSendAttempt();
  const organisation=useEventOrganisation(eventId,organisationId);
  if(!organisation.ready)return <Sheet onClose={onClose}><LoadState onRetry={()=>undefined}/></Sheet>;
  const mine=sectionIn(me,organisation.organisationId);
  return <ReplySheet post={post} me={{name:me!.name!,avatar:me!.avatarUrl,section:mine?.name,country:mine?.country}}
    onClose={onClose} onScreen={text=>api.screenMessage(text)} onSend={async payload=>{
      const input={origin,text:payload.text,anonymityLevel:payload.level,allowedHints:{section:!!payload.hints?.section,country:!!payload.hints?.country,letter:!!payload.hints?.letter},screeningAcknowledged:payload.screeningAcknowledged};
      const result=await api.openThread({...input,requestId:attempt.key(input)});
      attempt.complete();await refresh();onClose();navigation.navigate('Thread',{id:result.id});
    }}/>;
}
