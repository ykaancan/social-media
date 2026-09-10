import { MockApi } from '../mock';
import { HttpApi } from '../http';
import type { SendBoardPost } from '../board';

async function setup(mode:'approve_first'|'post_immediately'='approve_first') {
  const api=new MockApi({latencyMs:0,approveAfterMs:0});
  const owner=await api.register({email:'owner@example.com',password:'password123'});
  await api.submitProfile({name:'Owner',sectionId:'ankara'});await api.me();
  const event=await api.createEvent({name:'Live event',scope:'section',cover:'coral',boardMode:mode,
    startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
  const member=await api.register({email:'member@example.com',password:'password123'});
  await api.submitProfile({name:'Şeyma',sectionId:'izmir'});await api.me();await api.joinEvent(event.joinCode);
  const input:SendBoardPost={eventId:event.id,text:'Welcome everyone',anonymityLevel:'anonymous',allowedHints:{}};
  return {api,owner,member,event,input};
}

it('keeps room posts private until approved and never exposes hidden identity fields',async()=>{
  const {api,owner,event,input}=await setup();await api.sendBoardPost(input);
  let board=await api.getBoard(event.id);
  expect(board.posts).toHaveLength(0);expect(board.queue).toHaveLength(0);expect(board.ownUnpublished).toHaveLength(1);
  api.setTokens(owner.tokens);board=await api.getBoard(event.id);
  expect(board.queue).toHaveLength(1);expect(JSON.stringify(board)).not.toMatch(/senderId|sender_id|approval|auto_approved/);
  await api.approvePosts(event.id,[board.queue[0].id]);
  expect((await api.getBoard(event.id)).posts[0].sender).toEqual({level:'anonymous'});
  expect((await api.getEvent(event.id)).postCount).toBe(1);
});

it.each(['approve_first','post_immediately'] as const)('auto-approves moderator room posts in %s while preserving chosen anonymity',async mode=>{
  const {api,owner,event,input}=await setup(mode);api.setTokens(owner.tokens);
  await api.sendBoardPost({...input,anonymityLevel:'hint',allowedHints:{country:true}});
  const board=await api.getBoard(event.id);
  expect(board.queue).toHaveLength(0);expect(board.posts[0].sender).toEqual({level:'hint',hints:{country:'Türkiye'}});
  expect(api['boardPosts'].get(board.posts[0].id)?.approval).toBe('auto_approved_by_author');
});

it('allows immediate room posts and tracks one real reaction per member',async()=>{
  const {api,event,input}=await setup('post_immediately');await api.sendBoardPost(input);
  const post=(await api.getBoard(event.id)).posts[0];
  await api.reactToPost(event.id,post.id,'🔥');await api.reactToPost(event.id,post.id,'🔥');
  expect((await api.getBoard(event.id)).posts[0].reactions).toEqual({'🔥':1});
  await api.reactToPost(event.id,post.id,'😂');expect((await api.getBoard(event.id)).posts[0].reactions).toEqual({'😂':1});
  await api.reactToPost(event.id,post.id,null);expect((await api.getBoard(event.id)).posts[0].reactions).toEqual({});
});

it('never queues person-targeted messages and mirrors recipient approval and soft deletion on the board',async()=>{
  const {api,owner,member,event,input}=await setup();api.setTokens(owner.tokens);
  await api.sendBoardPost({...input,recipientId:member.me.id});
  let board=await api.getBoard(event.id);expect(board.posts).toHaveLength(0);expect(board.queue).toHaveLength(0);
  api.setTokens(member.tokens);const message=(await api.getInbox()).messages[0];expect(message.approvedFromBoard).toBe(true);
  await api.updateInboxMessage(message.id,'approved');board=await api.getBoard(event.id);
  expect(board.posts).toHaveLength(1);expect(board.posts[0].recipient?.id).toBe(member.me.id);
  expect((await api.getWall(event.id,member.me.id)).messages[0].approvedFromBoard).toBe(true);
  api.setTokens(owner.tokens);await expect(api.hidePost(event.id,board.posts[0].id)).rejects.toMatchObject({status:404});
  api.setTokens(member.tokens);await api.updateInboxMessage(message.id,'private');expect((await api.getBoard(event.id)).posts).toHaveLength(0);
  await api.updateInboxMessage(message.id,'approved');await api.deleteInboxMessage(message.id);expect((await api.getBoard(event.id)).posts).toHaveLength(0);
});

it('supports rejection undo only within five seconds and keeps the sender pending until expiry',async()=>{
  const {api,owner,member,event,input}=await setup();await api.sendBoardPost(input);api.setTokens(owner.tokens);
  const id=(await api.getBoard(event.id)).queue[0].id;
  const receipt=await api.rejectPost(event.id,id);expect((await api.getBoard(event.id)).queue).toHaveLength(0);
  api.setTokens(member.tokens);expect((await api.getBoard(event.id)).ownUnpublished[0].state).toBe('pending');
  api.setTokens(owner.tokens);await api.undoRejection(event.id,receipt.undoToken);expect((await api.getBoard(event.id)).queue).toHaveLength(1);
  const final=await api.rejectPost(event.id,id), clock=jest.spyOn(Date,'now').mockReturnValue(Date.parse(final.undoUntil));
  try {
    await expect(api.undoRejection(event.id,final.undoToken)).rejects.toMatchObject({status:409});
    await expect(api.approvePosts(event.id,[id])).rejects.toMatchObject({status:409});
    api.setTokens(member.tokens);expect((await api.getBoard(event.id)).ownUnpublished[0]).toMatchObject({state:'rejected',rejectionReason:'moderator'});
    await api.sendBoardPost({...input,text:'Rewritten message'});expect((await api.getBoard(event.id)).ownUnpublished).toHaveLength(2);
  } finally {clock.mockRestore();}
});

it('closes to archived, resolves all waiting decisions and refuses writes without deleting the board',async()=>{
  const {api,owner,event,input}=await setup();await api.sendBoardPost(input);await api.sendBoardPost(input);api.setTokens(owner.tokens);
  let board=await api.getBoard(event.id);await api.rejectPost(event.id,board.queue[0].id);
  await api.sendBoardPost({...input,text:'A published post'});await api.closeBoard(event.id);
  board=await api.getBoard(event.id);expect(board.event.status).toBe('archived');expect(board.event.closedAt).toBeTruthy();
  expect(board.queue).toHaveLength(0);expect(board.reviewed.filter(p=>p.state==='rejected').map(p=>p.rejectionReason)).toEqual(['board_closed','board_closed']);
  expect(board.posts).toHaveLength(1);await expect(api.sendBoardPost(input)).rejects.toMatchObject({status:409});
  await expect(api.reactToPost(event.id,board.posts[0].id,'🔥')).rejects.toMatchObject({status:409});
  await expect(api.updateBoardControls(event.id,{endsAt:new Date(Date.now()+7200000).toISOString()})).rejects.toMatchObject({status:409});
});

it('gives co-moderators shared queue and board controls but reserves moderator assignment for the creator',async()=>{
  const {api,owner,member,event,input}=await setup();
  await expect(api.closeBoard(event.id)).rejects.toMatchObject({status:403});
  api.setTokens(owner.tokens);await expect(api.setModerator(event.id,'outsider',true)).rejects.toMatchObject({status:403});
  await api.setModerator(event.id,member.me.id,true);api.setTokens(member.tokens);
  expect((await api.getBoard(event.id)).event.isModerator).toBe(true);
  await api.updateBoardControls(event.id,{boardMode:'post_immediately'});await api.sendBoardPost(input);
  await expect(api.setModerator(event.id,owner.me.id,false)).rejects.toMatchObject({status:403});
  api.setTokens(owner.tokens);await api.setModerator(event.id,member.me.id,false);api.setTokens(member.tokens);
  await expect(api.closeBoard(event.id)).rejects.toMatchObject({status:403});
});

it('keeps existing queue entries when switching modes and rejects conflicting batch approvals atomically',async()=>{
  const {api,owner,event,input}=await setup();await api.sendBoardPost(input);await api.sendBoardPost(input);api.setTokens(owner.tokens);
  const rows=(await api.getBoard(event.id)).queue;
  await api.updateBoardControls(event.id,{boardMode:'post_immediately'});expect((await api.getBoard(event.id)).queue).toHaveLength(2);
  await api.approvePosts(event.id,[rows[0].id]);
  await expect(api.approvePosts(event.id,rows.map(p=>p.id))).rejects.toMatchObject({status:409});
  expect((await api.getBoard(event.id)).queue).toHaveLength(1);
});

it('retains reported content when hidden and removes it from the public feed/projector data',async()=>{
  const {api,owner,event,input}=await setup('post_immediately');await api.sendBoardPost(input);
  const id=(await api.getBoard(event.id)).posts[0].id;await api.reportPost(event.id,id,'spam');
  api.setTokens(owner.tokens);await api.hidePost(event.id,id);
  expect((await api.getBoard(event.id)).posts).toHaveLength(0);expect(api['boardPosts'].get(id)?.text).toBe(input.text);
  expect(api['boardReports']).toHaveLength(1);
});

it('notifies subscribed viewers and stops after unsubscribe',async()=>{
  const {api,event,input}=await setup('post_immediately');const changed=jest.fn(),stop=api.subscribeBoard(event.id,changed);
  await api.sendBoardPost(input);expect(changed).toHaveBeenCalledTimes(1);stop();await api.sendBoardPost(input);expect(changed).toHaveBeenCalledTimes(1);
});

it('maps board HTTP endpoints and preserves explicit reaction removal',async()=>{
  const fetchMock=jest.spyOn(global,'fetch').mockResolvedValue({ok:true,text:async()=>'{}'} as Response);
  try {
    const api=new HttpApi('https://api.example');await api.getBoard('event/id');await api.reactToPost('event/id','post/id',null);
    await api.approvePosts('event/id',['post/id']);await api.rejectPost('event/id','post/id');await api.undoRejection('event/id','token');
    await api.setModerator('event/id','person/id',false);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example/events/event%2Fid/board');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({method:'PUT',body:'{"emoji":null}'});
    expect(fetchMock.mock.calls[4][1]).toMatchObject({method:'POST',body:'{"undoToken":"token"}'});
    expect(fetchMock.mock.calls[5][1]).toMatchObject({method:'DELETE'});
  } finally {fetchMock.mockRestore();}
});
