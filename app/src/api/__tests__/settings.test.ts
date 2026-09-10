import { MockApi } from '../mock';
import { HttpApi } from '../http';

async function setup(){
  const api=new MockApi({latencyMs:0,approveAfterMs:0});
  const owner=await api.register({email:'owner@example.com',password:'password123'});
  await api.submitProfile({name:'Owner',sectionId:'ankara'});await api.me();
  const event=await api.createEvent({name:'Live event',scope:'section',cover:'coral',boardMode:'post_immediately',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
  const member=await api.register({email:'member@example.com',password:'password123'});
  await api.submitProfile({name:'Member',sectionId:'izmir'});await api.me();await api.joinEvent(event.joinCode);
  const message={eventId:event.id,recipientId:owner.me.id,text:'Hello',anonymityLevel:'anonymous' as const,allowedHints:{}};
  return {api,owner,member,event,message};
}

it('links section peers only through a shared joined event',async()=>{
  const {api,owner,member,event}=await setup();api.setTokens(owner.tokens);
  expect((await api.getSection('izmir')).roster.find(p=>p.id===member.me.id)?.wallEventId).toBe(event.id);
  await api.register({email:'outside@example.com',password:'password123'});await api.submitProfile({name:'Outside',sectionId:'ankara'});await api.me();
  const peer=(await api.getSection('izmir')).roster.find(p=>p.id===member.me.id);
  expect(peer).toBeDefined();expect(peer?.wallEventId).toBeUndefined();
});

it('applies writing permissions to future inbox delivery while existing threads keep working',async()=>{
  const {api,owner,member,message}=await setup();await api.sendWallMessage(message);api.setTokens(owner.tokens);
  const row=(await api.getInbox()).messages[0];
  const {id}=await api.openThread({origin:{kind:'inbox',id:row.id},text:'Hi back',anonymityLevel:'named',allowedHints:{},requestId:'open'});
  await api.updateSettings({writingPolicy:'named_only'});api.setTokens(member.tokens);
  await expect(api.sendWallMessage(message)).rejects.toMatchObject({status:403});
  await api.sendWallMessage({...message,anonymityLevel:'named'});
  api.setTokens(owner.tokens);await api.updateSettings({writingPolicy:'nobody'});api.setTokens(member.tokens);
  await expect(api.sendWallMessage({...message,anonymityLevel:'named'})).rejects.toMatchObject({status:403});
  await api.sendThreadMessage(id,{text:'Existing thread works',requestId:'send'});
  api.setTokens(owner.tokens);expect((await api.getInbox()).messages).toHaveLength(2);
});

it('normalizes Turkish muted words, deduplicates them and privately suppresses pushes',async()=>{
  const {api,owner,member,message}=await setup();api.setTokens(owner.tokens);
  const result=await api.updateSettings({mutedWords:[' IŞIK ','ışık','isik']});expect(result.mutedWords).toHaveLength(1);
  api.setTokens(member.tokens);expect(await api.sendWallMessage({...message,text:'Işıklar güzel'})).toEqual({accepted:true});
  api.setTokens(owner.tokens);const row=(await api.getInbox()).messages[0];expect(row.state).toBe('private');
  expect(api['messages'].get(row.id)?.pushSuppressed).toBe(true);
  await api.updateSettings({mutedWords:[]});expect((await api.getInbox()).messages[0].state).toBe('private');
  await expect(api.updateSettings({mutedWords:['   ']})).rejects.toMatchObject({status:422});
});

it('defaults all three push preferences on and persists changes independently of delivery',async()=>{
  const {api,owner,member,message}=await setup();api.setTokens(owner.tokens);
  expect((await api.getSettings()).notifications).toEqual({inbox:true,threads:true,boardMentions:true});
  await api.updateSettings({notifications:{inbox:false,threads:true,boardMentions:false}});
  api.setTokens(member.tokens);await api.sendWallMessage(message);api.setTokens(owner.tokens);
  const row=(await api.getInbox()).messages[0];expect(row.state).toBe('new');expect(api['messages'].get(row.id)?.pushSuppressed).toBe(true);
});

it('lists anonymous blocks without exposing identity and restores hidden content on unblock',async()=>{
  const {api,owner,member,message}=await setup();await api.sendWallMessage(message);api.setTokens(owner.tokens);
  const row=(await api.getInbox()).messages[0];await api.blockMessage(row.id);
  const blocks=await api.getBlocked();expect(blocks).toEqual([{id:'block-1',sender:{level:'anonymous'}}]);
  api.setTokens(member.tokens);await expect(api.unblock(blocks[0].id)).rejects.toMatchObject({status:404});
  api.setTokens(owner.tokens);await api.unblock(blocks[0].id);expect((await api.getInbox()).messages).toHaveLength(1);
  expect(await api.getBlocked()).toHaveLength(0);
});

it('changes section and country without reapproval, audits it and enforces exactly 30 days',async()=>{
  const {api}=await setup();const changed=await api.changeSection('bologna');
  expect(changed).toMatchObject({status:'approved',section:{id:'bologna',country:'Italy'}});
  expect(api['sectionChanges']).toHaveLength(1);
  await expect(api.changeSection('ankara')).rejects.toMatchObject({status:429});
  await expect(api.submitProfile({name:'Bypass',sectionId:'ankara'})).rejects.toMatchObject({status:422});
  const settings=await api.getSettings(),clock=jest.spyOn(Date,'now').mockReturnValue(Date.parse(settings.sectionChangeAvailableAt!));
  try{expect((await api.changeSection('ankara')).status).toBe('approved');expect(api['sectionChanges']).toHaveLength(2);}finally{clock.mockRestore();}
});

it('edits a profile without reapproval and never changes a sent hint snapshot',async()=>{
  const {api,owner,message}=await setup();await api.sendWallMessage({...message,anonymityLevel:'hint',allowedHints:{section:true}});
  await api.editProfile({name:'Changed',bio:'New bio'});await api.changeSection('bologna');
  expect(await api.me()).toMatchObject({status:'approved',name:'Changed',bio:'New bio'});
  api.setTokens(owner.tokens);expect((await api.getInbox()).messages[0].sender).toEqual({level:'hint',hints:{section:'ESN İzmir'}});
});

it('exports received messages without hidden identity or credentials',async()=>{
  const {api,owner,message}=await setup();await api.sendWallMessage(message);api.setTokens(owner.tokens);
  const data=await api.exportAccount(),text=JSON.stringify(data);
  expect(text).toContain('Hello');expect(text).not.toMatch(/password|tokens|senderId|sender_id|member@example.com/);
});

it('really deletes authored content and credentials, preserving other members’ event posts',async()=>{
  const {api,owner,member,event,message}=await setup();await api.sendWallMessage(message);
  await api.sendBoardPost({eventId:event.id,text:'Member post stays',anonymityLevel:'named',allowedHints:{}});
  api.setTokens(owner.tokens);await api.sendBoardPost({eventId:event.id,text:'Owner post goes',anonymityLevel:'anonymous',allowedHints:{}});
  const row=(await api.getInbox()).messages[0];await api.reportMessage(row.id,'spam');
  await api.openThread({origin:{kind:'inbox',id:row.id},text:'Reply goes',anonymityLevel:'anonymous',allowedHints:{},requestId:'delete-thread'});
  await api.changeSection('bologna');await api.deleteAccount();
  await expect(api.login({email:'owner@example.com',password:'password123'})).rejects.toMatchObject({status:401});
  api.setTokens(owner.tokens);await expect(api.me()).rejects.toMatchObject({status:401});
  api.setTokens(member.tokens);expect((await api.getThreads()).threads).toHaveLength(0);
  const board=await api.getBoard(event.id);expect(board.event.status).toBe('archived');expect(board.creator).toBeUndefined();
  expect(board.posts.map(p=>p.text)).toEqual(['Member post stays']);expect(api['messages'].size).toBe(0);expect(api['reports'].size).toBe(0);expect(api['sectionChanges']).toHaveLength(0);
});

it('maps settings HTTP routes with section changes separate from profile edits',async()=>{
  const fetchMock=jest.spyOn(global,'fetch').mockResolvedValue({ok:true,text:async()=>'{}'} as Response);
  try{const api=new HttpApi('https://api.example');await api.getSettings();await api.updateSettings({writingPolicy:'nobody'});await api.getBlocked();await api.unblock('block/id');await api.editProfile({name:'Name'});await api.changeSection('ankara');await api.exportAccount();await api.deleteAccount();
    expect(fetchMock.mock.calls.map(([url,options])=>[url,options?.method])).toEqual([
      ['/me/settings','GET'],['/me/settings','PATCH'],['/me/blocks','GET'],['/me/blocks/block%2Fid','DELETE'],['/me/profile','PATCH'],['/me/section','PUT'],['/me/export','GET'],['/me','DELETE'],
    ].map(([path,method])=>['https://api.example'+path,method]));
  }finally{fetchMock.mockRestore();}
});
