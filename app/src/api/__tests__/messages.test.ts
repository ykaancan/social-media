import { HttpApi } from '../http';
import { MockApi, type MockApiOptions } from '../mock';
import type { SendWallMessage } from '../messages';

async function setup(options: MockApiOptions = {}) {
  const api = new MockApi({ latencyMs: 0, approveAfterMs: 0, ...options });
  const owner = await api.register({ email:'owner@example.com', password:'password123' });
  await api.submitProfile({ name:'Owner', sectionId:'ankara' }); await api.me();
  const event = await api.createEvent({ name:'Welcome night',scope:'section',cover:'coral',boardMode:'approve_first',
    startsAt:new Date(Date.now()+3600000).toISOString(), endsAt:new Date(Date.now()+7200000).toISOString() });
  const sender = await api.register({ email:'sender@example.com', password:'password123' });
  await api.submitProfile({ name:'Şeyma Kaya',sectionId:'izmir' }); await api.me(); await api.joinEvent(event.joinCode);
  const input: SendWallMessage = {eventId:event.id,recipientId:owner.me.id,text:'Thank you for welcoming everyone.',anonymityLevel:'anonymous',allowedHints:{}};
  return {api,owner,sender,event,input};
}

it('delivers privately with only allowed display fields, and derives hint country from section', async () => {
  const {api,owner,event,input}=await setup();
  await api.sendWallMessage(input);
  await api.sendWallMessage({...input,anonymityLevel:'hint',allowedHints:{country:true,letter:true}});
  await api.sendWallMessage({...input,anonymityLevel:'named'});
  api.setTokens(owner.tokens);
  const inbox=await api.getInbox();
  expect(inbox.counts).toEqual({new:3,private:0,approved:0});
  expect((await api.getWall(event.id,owner.me.id)).messages).toEqual([]);
  expect(inbox.messages[2].sender).toEqual({level:'anonymous'});
  expect(inbox.messages[1].sender).toEqual({level:'hint',hints:{country:'Türkiye',letter:'Ş'}});
  expect(inbox.messages[0].sender).toEqual({level:'named',name:'Şeyma Kaya'});
  expect(JSON.stringify(inbox)).not.toMatch(/senderId|sender_id|recipientId|pushSuppressed/);
});

it('moves freely between all states without changing sent anonymity', async () => {
  const {api,owner,event,input}=await setup(); await api.sendWallMessage(input); api.setTokens(owner.tokens);
  const message=(await api.getInbox()).messages[0];
  for(const state of ['private','approved','new','approved','private'] as const) {
    expect((await api.updateInboxMessage(message.id,state)).sender).toEqual({level:'anonymous'});
    expect((await api.getInbox()).counts[state]).toBe(1);
    expect((await api.getWall(event.id,owner.me.id)).count).toBe(state==='approved'?1:0);
  }
});

it('preserves reported content after soft delete while excluding it from inbox and wall', async () => {
  const {api,owner,event,input}=await setup(); await api.sendWallMessage(input); api.setTokens(owner.tokens);
  const message=(await api.getInbox()).messages[0];
  await api.updateInboxMessage(message.id,'approved'); await api.reportMessage(message.id,'harassment');
  await api.deleteInboxMessage(message.id);
  expect((await api.getInbox()).messages).toEqual([]); expect((await api.getWall(event.id,owner.me.id)).count).toBe(0);
  // Inspect mock storage, not an identity-reading member API.
  expect(api['messages'].get(message.id)).toMatchObject({text:input.text,deletedAt:expect.any(String)});
  expect(api['reports'].size).toBe(1);
});

it('blocks by message ID, hides prior messages for the blocker and refuses new writes', async () => {
  const {api,owner,sender,event,input}=await setup(); await api.sendWallMessage(input); await api.sendWallMessage({...input,text:'Another note'});
  api.setTokens(owner.tokens); const messages=(await api.getInbox()).messages;
  await api.updateInboxMessage(messages[0].id,'approved'); await api.reportMessage(messages[0].id,'spam');
  await api.blockMessage(messages[1].id);
  expect((await api.getInbox()).counts).toEqual({new:0,private:0,approved:0});
  expect((await api.getWall(event.id,owner.me.id)).count).toBe(0);
  expect(api['messages'].size).toBe(2); expect(api['reports'].size).toBe(1);
  api.setTokens(sender.tokens);
  await expect(api.sendWallMessage(input)).rejects.toMatchObject({status:403});
  expect((await api.getWall(event.id,owner.me.id)).count).toBe(1); // Block does not destroy public content.
});

it('normalizes muted words Turkish-aware, files privately and suppresses push without telling the sender', async () => {
  const {api,owner,input}=await setup({recipientPolicy:()=>({writingPolicy:'anyone',mutedWords:['çiğ']})});
  expect(await api.screenMessage('ÇIĞLIK')).toEqual({warning:false});
  expect(await api.sendWallMessage({...input,text:'ÇIĞLIK'})).toEqual({accepted:true});
  api.setTokens(owner.tokens);
  expect((await api.getInbox()).counts).toEqual({new:0,private:1,approved:0});
  expect([...api['messages'].values()][0].pushSuppressed).toBe(true);
});

it('rechecks screening at delivery, and never lets acknowledgement bypass a hard block', async () => {
  const {api,input}=await setup({screening:text=>text==='warn'?'warn':text==='block'?'block':'allow'});
  expect(await api.screenMessage('warn')).toEqual({warning:true});
  await expect(api.sendWallMessage({...input,text:'warn'})).rejects.toMatchObject({status:422});
  expect(await api.sendWallMessage({...input,text:'warn',screeningAcknowledged:true})).toEqual({accepted:true});
  await expect(api.sendWallMessage({...input,text:'block',screeningAcknowledged:true})).rejects.toMatchObject({status:422});
});

it('refuses non-owner actions, wall discovery and named-only violations', async () => {
  const {api,owner,sender,event,input}=await setup({recipientPolicy:()=>({writingPolicy:'named_only',mutedWords:[]})});
  await expect(api.sendWallMessage(input)).rejects.toMatchObject({status:403});
  await api.sendWallMessage({...input,anonymityLevel:'named'});
  api.setTokens(owner.tokens); const id=(await api.getInbox()).messages[0].id; api.setTokens(sender.tokens);
  await expect(api.updateInboxMessage(id,'approved')).rejects.toMatchObject({status:404});
  await expect(api.deleteInboxMessage(id)).rejects.toMatchObject({status:404});
  await expect(api.blockMessage(id)).rejects.toMatchObject({status:404});
  await expect(api.reportMessage(id,'spam')).rejects.toMatchObject({status:404});
  await api.register({email:'outside@example.com',password:'password123'});
  await api.submitProfile({name:'Outsider',sectionId:'ankara'}); await api.me();
  await expect(api.getWall(event.id,owner.me.id)).rejects.toMatchObject({status:404});
  await expect(api.sendWallMessage(input)).rejects.toMatchObject({status:403});
});


it('maps message HTTP methods and encodes identifiers without sender identity', async () => {
  const fetchMock = jest.spyOn(global,'fetch').mockResolvedValue({ok:true,text:async ()=>'{}'} as Response);
  try {
    const api = new HttpApi('https://api.example');
    api.setTokens({accessToken:'access',refreshToken:'refresh'});
    await api.getInbox(); await api.getWall('event/id','person/id');
    await api.screenMessage('draft');
    await api.updateInboxMessage('message/id','private');
    await api.deleteInboxMessage('message/id');
    await api.reportMessage('message/id','spam'); await api.blockMessage('message/id');
    expect(fetchMock.mock.calls.map(c=>c[0])).toEqual([
      'https://api.example/me/inbox','https://api.example/events/event%2Fid/people/person%2Fid/wall',
      'https://api.example/messages/screen','https://api.example/me/inbox/message%2Fid/state',
      'https://api.example/me/inbox/message%2Fid','https://api.example/messages/message%2Fid/report',
      'https://api.example/messages/message%2Fid/block']);
    expect(fetchMock.mock.calls[3][1]).toMatchObject({method:'PUT',body:JSON.stringify({state:'private'})});
    expect(fetchMock.mock.calls[4][1]).toMatchObject({method:'DELETE'});
    expect(fetchMock.mock.calls[5][1]).toMatchObject({method:'POST',body:JSON.stringify({reason:'spam'})});
  } finally {fetchMock.mockRestore();}
});
