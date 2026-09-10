import { MockApi } from '../mock';
import { HttpApi } from '../http';
import type { OpenThreadRequest } from '../threads';

async function setup() {
  const api=new MockApi({latencyMs:0,approveAfterMs:0,screening:text=>text==='blocked'?'block':text==='warning'?'warn':'allow'});
  const owner=await api.register({email:'owner@example.com',password:'password123'});
  await api.submitProfile({name:'Owner',sectionId:'ankara'});await api.me();
  const event=await api.createEvent({name:'Live event',scope:'section',cover:'coral',boardMode:'post_immediately',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
  const member=await api.register({email:'member@example.com',password:'password123'});
  await api.submitProfile({name:'Şeyma',sectionId:'izmir'});await api.me();await api.joinEvent(event.joinCode);
  await api.sendBoardPost({eventId:event.id,text:'Original post',anonymityLevel:'hint',allowedHints:{country:true}});
  const post=(await api.getBoard(event.id)).posts[0];api.setTokens(owner.tokens);
  const input:OpenThreadRequest={origin:{kind:'post',id:post.id,eventId:event.id},text:'First reply',anonymityLevel:'anonymous',allowedHints:{},requestId:'open-1'};
  return {api,owner,member,event,post,input};
}

it('snapshots sent identities and reveals only future messages, once',async()=>{
  const {api,member,input}=await setup();const {id}=await api.openThread(input);
  let detail=await api.getThread(id);expect(detail.origin.sender).toEqual({level:'hint',hints:{country:'Türkiye'}});
  expect(detail.messages[0].sender).toEqual({level:'anonymous'});
  await api.revealInThread(id);await api.revealInThread(id);
  await api.sendThreadMessage(id,{text:'Now named',requestId:'send-1'});
  detail=await api.getThread(id);expect(detail.messages).toHaveLength(3);
  expect(detail.messages[0].sender).toEqual({level:'anonymous'});
  expect(detail.messages[1]).toMatchObject({system:'revealed',sender:{level:'named',name:'Owner'}});
  expect(detail.messages[2].sender).toMatchObject({level:'named',name:'Owner'});
  expect(detail.canReveal).toBe(false);expect(detail.origin.sender.level).toBe('hint');
  api.setTokens(member.tokens);detail=await api.getThread(id);
  expect(detail.other).toMatchObject({level:'named',name:'Owner'});
  await api.sendThreadMessage(id,{text:'Still a hint',requestId:'send-1'});
  expect((await api.getThread(id)).messages[3].sender).toEqual({level:'hint',hints:{country:'Türkiye'}});
  expect(JSON.stringify(detail)).not.toMatch(/senderId|sender_id|revealedAt|sectionId|userId/);
});

it('deduplicates retries and rejects a changed payload using the same key',async()=>{
  const {api,input}=await setup();const result=await api.openThread(input);
  expect(await api.openThread(input)).toEqual(result);expect((await api.getThreads()).threads).toHaveLength(1);
  await expect(api.openThread({...input,text:'Changed'})).rejects.toMatchObject({status:409});
  const send={text:'Follow up',requestId:'send-1'};
  await api.sendThreadMessage(result.id,send);await api.sendThreadMessage(result.id,send);
  expect((await api.getThread(result.id)).messages).toHaveLength(2);
  await expect(api.sendThreadMessage(result.id,{...send,text:'Changed'})).rejects.toMatchObject({status:409});
});

it('keeps read watermarks monotonic without marking later arrivals read',async()=>{
  const {api,input,owner,member}=await setup();const {id}=await api.openThread(input);
  expect((await api.getThreads()).unreadCount).toBe(0);
  api.setTokens(member.tokens);const first=(await api.getThread(id)).lastMessage.id;
  expect((await api.getThreads()).unreadCount).toBe(1);
  api.setTokens(owner.tokens);await api.sendThreadMessage(id,{text:'Later',requestId:'later'});
  api.setTokens(member.tokens);await api.markThreadRead(id,first);
  expect((await api.getThreads()).unreadCount).toBe(1);
  await api.markThreadRead(id,(await api.getThread(id)).lastMessage.id);await api.markThreadRead(id,first);
  expect((await api.getThreads()).unreadCount).toBe(0);
  await expect(api.markThreadRead(id,'foreign')).rejects.toMatchObject({status:422});
});

it('blocks by other message reference, hides only for the blocker and retains reports and board posts',async()=>{
  const {api,input,owner,member,event,post}=await setup();const {id}=await api.openThread(input);
  const detail=await api.getThread(id);
  await expect(api.blockThread(id,detail.messages[0].id)).rejects.toBeDefined();
  await expect(api.blockThread(id,'foreign')).rejects.toBeDefined();
  await api.reportThread(id,'spam');await api.blockThread(id,detail.blockMessageId);
  expect((await api.getThreads()).threads).toHaveLength(0);
  expect((await api.getBoard(event.id)).posts.some(p=>p.id===post.id)).toBe(true);
  expect(api['threadReports']).toHaveLength(1);expect(api['threads'].get(id)?.messages).toHaveLength(1);
  api.setTokens(member.tokens);expect((await api.getThreads()).threads).toHaveLength(1);
  await expect(api.sendThreadMessage(id,{text:'Cannot send',requestId:'blocked'})).rejects.toMatchObject({status:403});
  await expect(api.sendWallMessage({eventId:event.id,recipientId:owner.me.id,text:'Cannot send',anonymityLevel:'anonymous',allowedHints:{}})).rejects.toMatchObject({status:403});
});

it('requires accessible origins and thread membership, with no cold or self opening',async()=>{
  const {api,input,member}=await setup();const {id}=await api.openThread(input);
  api.setTokens(member.tokens);await expect(api.openThread(input)).rejects.toMatchObject({status:403});
  await api.register({email:'outsider@example.com',password:'password123'});
  await api.submitProfile({name:'Outsider',sectionId:'ankara'});await api.me();
  await expect(api.openThread(input)).rejects.toBeDefined();
  await expect(api.getThread(id)).rejects.toMatchObject({status:404});
  await expect(api.sendThreadMessage(id,{text:'Intrude',requestId:'intrude'})).rejects.toMatchObject({status:404});
});

it('opens from a recipient inbox and shares inbox blocks with threads',async()=>{
  const {api,owner,member,event}=await setup();
  await api.sendWallMessage({eventId:event.id,recipientId:member.me.id,text:'Hello',anonymityLevel:'anonymous',allowedHints:{}});
  api.setTokens(member.tokens);const message=(await api.getInbox()).messages[0];
  const {id}=await api.openThread({origin:{kind:'inbox',id:message.id},text:'Reply',anonymityLevel:'named',allowedHints:{},requestId:'inbox'});
  expect((await api.getThread(id)).other).toEqual({level:'anonymous'});
  await api.blockMessage(message.id);expect((await api.getThreads()).threads).toHaveLength(0);
  api.setTokens(owner.tokens);await expect(api.sendThreadMessage(id,{text:'Blocked',requestId:'blocked'})).rejects.toMatchObject({status:403});
});

it('screens first replies at 280 and later messages at 500; acknowledgement never bypasses hard blocks',async()=>{
  const {api,input}=await setup();
  await expect(api.openThread({...input,text:'x'.repeat(281)})).rejects.toMatchObject({status:422});
  const {id}=await api.openThread(input);
  expect(await api.screenMessage('x'.repeat(500),'thread')).toEqual({warning:false});
  await api.sendThreadMessage(id,{text:'x'.repeat(500),requestId:'long'});
  await expect(api.sendThreadMessage(id,{text:'x'.repeat(501),requestId:'too-long'})).rejects.toMatchObject({status:422});
  await expect(api.sendThreadMessage(id,{text:'warning',requestId:'warn'})).rejects.toMatchObject({status:422});
  await api.sendThreadMessage(id,{text:'warning',requestId:'warn',screeningAcknowledged:true});
  await expect(api.sendThreadMessage(id,{text:'blocked',requestId:'block',screeningAcknowledged:true})).rejects.toMatchObject({status:422});
});

it('maps thread HTTP requests without sending participant identities',async()=>{
  const fetchMock=jest.spyOn(global,'fetch').mockResolvedValue({ok:true,text:async()=>'{}'} as Response);
  try {
    const api=new HttpApi('https://api.example');api.setTokens({accessToken:'access',refreshToken:'refresh'});
    await api.getThreads();await api.getThread('thread/id');
    await api.sendThreadMessage('thread/id',{text:'Hi',requestId:'one'});
    await api.markThreadRead('thread/id','message-1');await api.revealInThread('thread/id');
    await api.reportThread('thread/id','spam');await api.blockThread('thread/id','message-1');
    expect(fetchMock.mock.calls.map(([url])=>url)).toEqual(['https://api.example/me/threads',...['','/messages','/read','/reveal','/report','/block'].map(s=>'https://api.example/threads/thread%2Fid'+s)]);
    expect(JSON.parse(fetchMock.mock.calls[6][1]!.body as string)).toEqual({messageId:'message-1'});
  } finally {fetchMock.mockRestore();}
});
