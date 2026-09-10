import React, { useEffect, useState } from 'react';
import { useApi, type BoardSnapshot, type BoardPost, type AllowedHints, type MessageLevel } from '../api';
import { Composer, LoadState, Sheet, useToast } from '../components';
import { getPref, setPref } from '../prefs';
import { useSession } from '../session';
import { useTranslation } from '../i18n';

export function BoardComposer({ board, rewrite, onClose }: { board: BoardSnapshot; rewrite?: BoardPost; onClose: () => void }) {
  const api=useApi(), {me}=useSession(), {t}=useTranslation(), toast=useToast();
  const [choice,setChoice]=useState<{level:MessageLevel;hints:AllowedHints}|null>(null);
  const key=`anonymity.${me!.id}` as const;
  useEffect(()=>{let active=true; void getPref(key).then(raw=>{
    let next:{level:MessageLevel;hints:AllowedHints}={level:'anonymous',hints:{section:true}};
    try { const saved=JSON.parse(raw??'null'); if(saved && ['anonymous','hint','named'].includes(saved.level)) {
      next={level:saved.level,hints:{section:saved.hints?.section===true,country:saved.hints?.country===true,letter:saved.hints?.letter===true}};
      if(next.level==='hint'&&!Object.values(next.hints).some(Boolean)) next.hints.section=true;
    } } catch { /* Safe default. */ }
    if(rewrite) next={level:rewrite.sender.level,hints:{section:!!rewrite.sender.hints?.section,country:!!rewrite.sender.hints?.country,letter:!!rewrite.sender.hints?.letter}};
    if(active) setChoice(next);
  }); return ()=>{active=false;};},[key,rewrite]);
  if(!choice) return <Sheet onClose={onClose}><LoadState onRetry={()=>undefined}/></Sheet>;
  return <Composer me={{name:me!.name!,avatar:me!.avatarUrl,section:me!.section!.name,country:me!.section!.country}}
    members={board.event.people.filter(p=>p.id!==me!.id).map(p=>({id:p.id,name:p.name,avatar:p.avatarUrl,section:p.section.name}))}
    initialText={rewrite?.text} initialLevel={choice.level} initialHintFields={choice.hints}
    boardMode={board.event.boardMode} isModerator={board.event.isModerator} onClose={onClose}
    onLevelChange={(level,hints)=>{void setPref(key,JSON.stringify({level,hints}));}}
    onScreen={text=>api.screenMessage(text)} onSend={async payload=>{
      await api.sendBoardPost({eventId:board.event.id,text:payload.text,anonymityLevel:payload.sender.level,
        allowedHints:{section:!!payload.sender.hints?.section,country:!!payload.sender.hints?.country,letter:!!payload.sender.hints?.letter},
        recipientId:payload.target==='person'?payload.person?.id:undefined,screeningAcknowledged:payload.screeningAcknowledged});
      toast.show(t(payload.target==='person'?'composer.sentToInbox':'boardFlow.sent')); onClose();
    }}/>
}
