import { FirstReply } from '../threads/FirstReply';
import React, { useRef, useState } from 'react';
import { useApi, type BoardPost, type BoardSnapshot, type ReportReason } from '../api';
import { Sheet, IconButton, Button, Tabs, StatusPill, Text } from '../components/core';
import { PostCard, QueueCard } from '../components/cards';
import { Empty, Note, Swipe, UnpublishedPost, MoreSheet, ReportSheet, ConfirmSheet, ControlsSheet, ModsSheet, EventDatePicker, closeBoardConfirmBody, useToast } from '../components/patterns';
import { useLocale, useTranslation } from '../i18n';
import { useSession } from '../session';
import { BoardComposer } from './BoardComposer';

export function BoardPanel({tab,board,refresh,composing,onComposerClose,onProjector}: {
  tab:string; board:BoardSnapshot; refresh:()=>Promise<void>; composing:boolean; onComposerClose:()=>void; onProjector:()=>void;
}) {
  const api=useApi(), toast=useToast(), {t}=useTranslation(), locale=useLocale(), {me}=useSession();
  const event=board.event, live=event.status==='live';
  const [filter,setFilter]=useState('pending');
  const [selected,setSelected]=useState<string[]>([]), [selecting,setSelecting]=useState(false);
  const [sheet,setSheet]=useState<string|null>(null), [post,setPost]=useState<BoardPost>();
  const [rewrite,setRewrite]=useState<BoardPost>(), [dismissed,setDismissed]=useState<string[]>([]);
  const [busy,setBusy]=useState(false), [failed,setFailed]=useState(false), working=useRef(false);
  const run=async(action:()=>Promise<unknown>,close=false)=>{
    if(working.current) return; working.current=true; setBusy(true); setFailed(false);
    try {await action(); await refresh(); if(close)setSheet(null);} catch {setFailed(true);toast.show(t('boardFlow.actionError')); await refresh();}
    finally {working.current=false;setBusy(false);}
  };
  const reject=(id:string)=>{void run(async()=>{
    const receipt=await api.rejectPost(event.id,id);
    toast.show(t('boardFlow.rejected'),{durationMs:Math.max(1,Date.parse(receipt.undoUntil)-Date.now()),action:t('boardFlow.undo'),
      onAction:()=>{void api.undoRejection(event.id,receipt.undoToken).then(refresh).catch(()=>toast.show(t('boardFlow.actionError')));}});
  });};
  const person=(p:NonNullable<BoardSnapshot['creator']>)=>({id:p.id,name:p.name,avatar:p.avatarUrl,section:p.section.name});
  const open=(name:string,p?:BoardPost)=>{setFailed(false);setPost(p);setSheet(name);};
  const pendingIds=selected.filter(id=>board.queue.some(row=>row.id===id));
  const readOnlyRows=board.reviewed.filter(p=>p.state===filter);
  return <>
    <Button variant="secondary" icon="Projector" testID="board-projector" onPress={onProjector}>{t('events.projector')}</Button>
    {event.isModerator && <>
      <Button variant="ghost" icon="Settings" testID="board-controls" onPress={()=>open('controls')} disabled={event.status==='archived'}>{t('events.boardControls')}</Button>
      {board.canManageModerators && <Button variant="ghost" icon="Users" onPress={()=>open('mods')} disabled={event.status==='archived'}>{t('events.coModerators')}</Button>}

    </>}
    {tab==='queue' && event.isModerator ? <>
      <Tabs variant="segmented" value={filter} onChange={value=>{setFilter(value);setSelecting(false);setSelected([]);}}
        items={['pending','approved','rejected'].map(id=>({id,label:t(`boardFlow.${id === 'rejected' ? 'rejectedLabel' : id}`)}))}/>
      <Note>{t('boardFlow.queueNote')}</Note>
      {filter==='pending' ? <>
        {board.queue.length>0 && live && <>
          <Button variant="secondary" onPress={()=>{setSelecting(!selecting);setSelected([]);}}>{t(selecting?'common.cancel':'queue.select')}</Button>
          {selecting && <>
            <Button variant="ghost" onPress={()=>setSelected(board.queue.map(p=>p.id))}>{t('boardFlow.selectAll')}</Button>
            <Button disabled={busy||!pendingIds.length} onPress={()=>{void run(async()=>{await api.approvePosts(event.id,pendingIds);setSelected([]);setSelecting(false);});}}>{t('boardFlow.approveSelected',{n:pendingIds.length})}</Button>
          </>}
        </>}
        {!board.queue.length && <Empty icon="Check" text={t('queue.empty')}/>}
        {board.queue.map((p,index)=><Swipe key={p.id} disabled={busy||selecting||!live} onApprove={()=>{void run(()=>api.approvePosts(event.id,[p.id]));}} onReject={()=>reject(p.id)}>
          <QueueCard index={index+1} text={p.text} sender={p.sender} testID={`queue-${p.id}`} selectable={selecting} selected={selected.includes(p.id)}
            onSelect={()=>setSelected(current=>current.includes(p.id)?current.filter(id=>id!==p.id):[...current,p.id])}
            onApprove={live&&!busy?()=>{void run(()=>api.approvePosts(event.id,[p.id]));}:undefined} onReject={live&&!busy?()=>reject(p.id):undefined}/>
        </Swipe>)}
      </> : <>
        {!readOnlyRows.length && <Empty icon="Inbox" text={t('boardFlow.noReviewed')}/>}
        {readOnlyRows.map(p=><PostCard key={p.id} testID={`reviewed-${p.id}`} text={p.text} sender={p.sender}>
          <StatusPill status={p.state==='approved'?'live':'rejected'}/>
        </PostCard>)}
      </>}
    </> : <>
      {event.status==='archived' && <Note icon="Lock">{t('eventFlow.archived')}</Note>}
      {event.status==='upcoming' && <Note>{t('boardFlow.upcoming')}</Note>}
      {board.ownUnpublished.filter(p=>!dismissed.includes(p.id)).map(p=><UnpublishedPost key={p.id} post={p}
        onRewrite={live?()=>setRewrite(p):undefined} onDismiss={()=>setDismissed(ids=>[...ids,p.id])}/>)}
      {!board.posts.length && <Empty icon="Radio" text={t('eventFlow.noPosts')}/>}
      {board.posts.map(p=><PostCard key={p.id} testID={`board-${p.id}`} text={p.text} sender={p.sender}
        time={new Date(p.createdAt).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})} entering eventOutline={p.mine}
        reactions={p.reactions} myReaction={p.myReaction} onReact={live?emoji=>{void run(()=>api.reactToPost(event.id,p.id,p.myReaction===emoji?null:emoji));}:undefined}
        onMore={()=>open('more',p)} onReply={!p.mine?()=>open('reply',p):undefined}>
          {p.recipient && <Text variant="caption">{t('boardFlow.toPerson',{name:p.recipient.name})}</Text>}
      </PostCard>)}
    </>}
    {(composing||rewrite) && <BoardComposer board={board} rewrite={rewrite} onClose={()=>{setRewrite(undefined);onComposerClose();void refresh();}}/>}
    {sheet==='reply'&&post&&<FirstReply origin={{kind:'post',id:post.id,eventId:event.id}} post={post} onClose={()=>setSheet(null)}/>}
    {sheet==='more' && post && <MoreSheet post={post} onClose={()=>setSheet(null)} items={[
      {id:'report',icon:'Flag',label:t('report.title')},
      ...(event.isModerator&&live&&!post.recipient?[{id:'hide',icon:'EyeOff' as const,label:t('boardFlow.hide'),danger:true}]:[]),
    ]} onPick={setSheet}/>}
    {sheet==='report' && post && <ReportSheet post={post} busy={busy} error={failed?t('boardFlow.actionError'):undefined} onClose={()=>setSheet(null)}
      onReport={reason=>{void run(async()=>{await api.reportPost(event.id,post.id,reason as ReportReason);toast.show(t('report.sent'));},true);}}/>}
    {(sheet==='hide'||sheet==='close') && <ConfirmSheet title={t(sheet==='hide'?'boardFlow.hide':'events.closeBoardNow')}
      body={sheet==='hide'?t('boardFlow.hideBody'):closeBoardConfirmBody(t,board.pendingCount)} action={t(sheet==='hide'?'boardFlow.hide':'events.closeBoardNow')}
      busy={busy} error={failed?t('boardFlow.actionError'):undefined} onClose={()=>setSheet(null)}
      onConfirm={()=>{void run(()=>sheet==='hide'?api.hidePost(event.id,post!.id):api.closeBoard(event.id),true);}}/>}
    {sheet==='controls' && <ControlsSheet mode={event.boardMode} onMode={boardMode=>{void run(()=>api.updateBoardControls(event.id,{boardMode}));}}
      end={event.endsAt} endOptions={[]} onEnd={()=>undefined} pendingCount={board.pendingCount} canCloseBoard={live}
      endControl={<Button variant="secondary" onPress={()=>open('end')}>{new Date(event.endsAt).toLocaleString(locale)}</Button>}
      onClose={()=>setSheet(null)} onCloseBoard={()=>open('close')}/>}
    {sheet==='end' && <Sheet title={t('events.endsLabel')} onClose={()=>open('controls')}><EventDatePicker value={new Date(event.endsAt)} onClose={()=>open('controls')}
      onChange={date=>{void run(()=>api.updateBoardControls(event.id,{endsAt:date.toISOString()}));}}/></Sheet>}
    {sheet==='mods' && board.creator && <ModsSheet me={person(board.event.people.find(p=>p.id===me!.id)!)} creator={person(board.creator)} mods={board.moderators.map(person)}
      pool={event.people.filter(p=>p.id!==board.creator?.id&&!board.moderators.some(m=>m.id===p.id)).map(person)} eventName={event.name}
      onAdd={p=>{void run(()=>api.setModerator(event.id,p.id,true));}} onRemove={p=>{void run(()=>api.setModerator(event.id,p.id,false));}} onClose={()=>setSheet(null)}/>}
  </>;
}
