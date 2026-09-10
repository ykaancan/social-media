import type { AccountSettings, BlockedEntry } from './settings';
import type { OpenThreadRequest, ThreadDetail, ThreadMessage, ThreadsSnapshot } from './threads';
import type { BoardPost, BoardSnapshot, SendBoardPost, RejectionReceipt } from './board';
import { people, sections as sectionFixtures } from '../dev/fixtures';
import { normalizeForSearch } from '../utils/text';
import type { InboxMessage, InboxSnapshot, WallSnapshot, MessageSender, SendWallMessage, MessageState, ReportReason } from './messages';

interface StoredMessage {
  fromBoard?: boolean;
  id: string; senderId: string; recipientId: string; eventId: string;
  text: string; sender: MessageSender; state: MessageState; createdAt: string;
  deletedAt?: string; pushSuppressed: boolean;
}
import {
  type CreateEventRequest, type EventDetail, type EventSummary, type EventJoinResult,
  ApiError,
  LIMITS,
  type ApiClient,
  type AuthResult,
  type LoginRequest,
  type Me,
  type Person,
  type ProfileRequest,
  type RegisterRequest,
  type SectionDetail,
  type SectionRef,
  type SectionSummary,
  type Tokens,
} from './types';

/**
 * In-memory `ApiClient` for development and tests. It is the onboarding
 * prototype's behaviour, typed: the same nine sections, the same rosters, the
 * same demo approval.
 *
 * It is never used in production — `createApi()` only reaches for it when
 * `EXPO_PUBLIC_API_URL` is unset and `__DEV__` is true.
 *
 * Principle 4 still holds here: the mock's counts are its own fixture counts and
 * the arithmetic on them is honest. Nothing is padded to make a screen look
 * fuller than the data is.
 */

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

/**
 * Rosters from `/design/bundle/prototypes/onboarding-app.jsx` (its `SECTIONS`
 * constant), keyed by the fixture section ids. The prototype's roster is a
 * SAMPLE of the section, not all of it — which is why the section page renders
 * "and N more" off `rosterTotal`.
 */
const ROSTERS: Record<string, string[]> = {
  ankara: ['Ece Kara', 'Deniz Aksoy', 'Burak Şen', 'Zeynep Acar', 'Kerem Uslu'],
  izmir: ['Şeyma Kaya', 'Ahmet Yıldız', 'Melis Er'],
  bogazici: ['İrem Doğan', 'Can Özkan'],
  metu: ['Selin Ateş', 'Ozan Demir'],
  bologna: ['Giulia Ferri', 'Marco Riva'],
  milano: ['Sara Conti'],
  sevilla: ['Mateo Ruiz', 'Lucía Ortega'],
  brno: ['Lena Novak', 'Tomáš Král'],
  koln: ['Jonas Weber', 'Mia Schulz'],
};

/** Fixture people already have stable ids; anyone else gets one off their name. */
const ID_BY_NAME = new Map(Object.values(people).map((p) => [p.name, p.id]));

function personId(name: string): string {
  return ID_BY_NAME.get(name) ?? normalizeForSearch(name).replace(/[^a-z0-9]+/g, '-');
}

interface SeedSection {
  ref: SectionRef;
  /** The fixture's own member count, before the signed-in user is added. */
  members: number;
  roster: string[];
}

const SEED: SeedSection[] = sectionFixtures.map((s) => ({
  ref: { id: s.id, name: s.name, country: s.country },
  members: s.members,
  roster: ROSTERS[s.id] ?? [],
}));

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

interface Account {
  id: string;
  email: string;
  password: string;
  phone?: string;
  status: Me['status'];
  role: Me['role'];
  name?: string;
  bio?: string;
  avatarUrl?: string;
  sectionId?: string;
  /** Epoch ms at which the demo admin approves. Undefined = never. */
  approveAt?: number;
}

export interface MockApiOptions {
  /** Test/development policy injection, not a real keyword/model moderation service. */
  screening?: (text: string) => 'allow' | 'warn' | 'block';
  recipientPolicy?: (id: string) => { writingPolicy: 'anyone' | 'named_only' | 'nobody'; mutedWords: string[] };
  /**
   * How long a `pending` account waits before the demo admin approves it.
   * 4000 ms mirrors the prototype's timing.
   *
   * DEV ONLY. It is a demo convenience, never a promise the UI is allowed to
   * make: no screen may say how long review takes, because in production a
   * person looks at every profile by hand.
   */
  approveAfterMs?: number;
  /** Simulated round-trip. Tests pass 0. */
  latencyMs?: number;
}

const cloneSettings=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
const emailKey = (email: string) => email.trim().toLowerCase();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface StoredBoardPost {
  id: string; eventId: string; senderId: string; text: string; sender: MessageSender; createdAt: string;
  state: 'pending' | 'approved' | 'rejected'; hidden?: boolean; messageId?: string;
  approval?: 'auto_approved_by_author' | 'immediate' | 'moderator';
  rejectionReason?: 'moderator' | 'board_closed';
  rejection?: { token: string; by: string; until: number };
  reactions: Map<string, string>;
}

interface StoredThreadMessage {
  id:string; text:string; senderId:string; sender:MessageSender; createdAt:string; system?:'revealed';
}
interface StoredThread {
  id:string; source:string;
  origin:{id:string;text:string;senderId:string;sender:MessageSender};
  participants:Map<string,{sender:MessageSender;readThrough:number;revealedAt?:string}>;
  messages:StoredThreadMessage[];
  requests:Map<string,{fingerprint:string}>;
}
export class MockApi implements ApiClient {
  private settings=new Map<string,AccountSettings>();
  private blockEntries=new Map<string,{owner:string;blocked:string;sender:MessageSender}>();
  private blockSeq=0;
  private sectionChanges:Array<{userId:string;from:string;to:string;at:string}>=[];
  private settingsFor(id:string):AccountSettings {
    return this.settings.get(id)??{...this.recipientPolicy(id),notifications:{inbox:true,threads:true,boardMentions:true},sectionChangeAvailableAt:null};
  }
  async getSettings():Promise<AccountSettings>{await this.wait();return cloneSettings(this.settingsFor(this.approvedAccount().id));}
  async updateSettings(input:Partial<Pick<AccountSettings,'writingPolicy'|'mutedWords'|'notifications'>>):Promise<AccountSettings>{
    await this.wait();const me=this.approvedAccount(),next=cloneSettings(this.settingsFor(me.id));
    if(input.writingPolicy!==undefined){if(!['anyone','named_only','nobody'].includes(input.writingPolicy))throw new ApiError('validation','invalid policy',422);next.writingPolicy=input.writingPolicy;}
    if(input.mutedWords!==undefined){
      if(!Array.isArray(input.mutedWords)||input.mutedWords.length>100||input.mutedWords.some(w=>typeof w!=='string'||!normalizeForSearch(w.trim())||w.trim().length>40))throw new ApiError('validation','invalid words',422);
      const seen=new Set<string>();next.mutedWords=input.mutedWords.map(w=>w.trim().toLocaleLowerCase('tr')).filter(w=>{const key=normalizeForSearch(w);if(seen.has(key))return false;seen.add(key);return true;});
    }
    if(input.notifications!==undefined){if(['inbox','threads','boardMentions'].some(k=>typeof input.notifications![k as keyof typeof input.notifications]!=='boolean'))throw new ApiError('validation','invalid notifications',422);next.notifications={inbox:input.notifications.inbox,threads:input.notifications.threads,boardMentions:input.notifications.boardMentions};}
    this.settings.set(me.id,next);return cloneSettings(next);
  }
  private rememberBlock(owner:string,blocked:string,sender:MessageSender){
    const ids=this.blocks.get(owner)??new Set<string>();ids.add(blocked);this.blocks.set(owner,ids);
    if(![...this.blockEntries.values()].some(row=>row.owner===owner&&row.blocked===blocked))this.blockEntries.set('block-'+ ++this.blockSeq,{owner,blocked,sender:cloneSettings(sender)});
    this.emitThreads([owner]);
  }
  async getBlocked():Promise<BlockedEntry[]>{await this.wait();const me=this.approvedAccount();return [...this.blockEntries].filter(([,row])=>row.owner===me.id).map(([id,row])=>({id,sender:cloneSettings(row.sender)}));}
  async unblock(id:string):Promise<void>{await this.wait();const me=this.approvedAccount(),row=this.blockEntries.get(id);if(!row||row.owner!==me.id)throw new ApiError('unknown','block unavailable',404);this.blocks.get(me.id)?.delete(row.blocked);this.blockEntries.delete(id);this.emitThreads([me.id]);}
  async editProfile(input:Omit<ProfileRequest,'sectionId'>):Promise<Me>{
    await this.wait();const me=this.approvedAccount();if(!input.name.trim()||input.name.trim().length>LIMITS.nameMax||(input.bio?.length??0)>LIMITS.bioMax)throw new ApiError('validation','invalid profile',422);
    me.name=input.name.trim();me.bio=input.bio?.trim()||undefined;if(input.photoUri)me.avatarUrl=input.photoUri;return this.toMe(me);
  }
  async changeSection(sectionId:string):Promise<Me>{
    await this.wait();const me=this.approvedAccount(),settings=cloneSettings(this.settingsFor(me.id));
    if(!SEED.some(s=>s.ref.id===sectionId))throw new ApiError('validation','unknown section',422);
    if(me.sectionId===sectionId)return this.toMe(me);
    if(settings.sectionChangeAvailableAt&&Date.now()<Date.parse(settings.sectionChangeAvailableAt))throw new ApiError('unknown','section change limited',429);
    this.sectionChanges.push({userId:me.id,from:me.sectionId!,to:sectionId,at:new Date().toISOString()});
    me.sectionId=sectionId;settings.sectionChangeAvailableAt=new Date(Date.now()+30*86400000).toISOString();this.settings.set(me.id,settings);return this.toMe(me);
  }
  async exportAccount():Promise<Record<string,unknown>>{
    await this.wait();const me=this.approvedAccount();
    return {profile:this.toMe(me),settings:await this.getSettings(),blocks:await this.getBlocked(),
      inbox:[...this.messages.values()].filter(row=>row.recipientId===me.id).map(row=>this.messageDto(row)),
      sentMessages:[...this.messages.values()].filter(row=>row.senderId===me.id).map(row=>({text:row.text,sender:row.sender,createdAt:row.createdAt})),
      posts:[...this.boardPosts.values()].filter(row=>row.senderId===me.id).map(row=>({text:row.text,sender:row.sender,createdAt:row.createdAt})),
      threads:[...this.threads.values()].filter(row=>row.participants.has(me.id)).map(row=>({messages:row.messages.map(message=>this.threadMessageDto(message)),origin:{text:row.origin.text,sender:row.origin.sender}})),
      sectionChanges:this.sectionChanges.filter(row=>row.userId===me.id).map(({from,to,at})=>({from,to,at}))};
  }
  async deleteAccount():Promise<void>{
    await this.wait();const me=this.approvedAccount(),affected=new Set<string>();
    for(const [id,row] of this.threads)if(row.participants.has(me.id)){row.participants.forEach((_,id)=>affected.add(id));this.threads.delete(id);}
    for(const [id,row] of this.threadOpenRequests)if(id.startsWith(me.id+':')||!this.threads.has(row.id))this.threadOpenRequests.delete(id);
    this.threadReports=this.threadReports.filter(row=>row.reporterId!==me.id&&this.threads.has(row.threadId));
    for(const [id,row] of this.messages)if(row.senderId===me.id||row.recipientId===me.id)this.messages.delete(id);
    for(const [id,row] of this.boardPosts){if(row.senderId===me.id||(row.messageId&&!this.messages.has(row.messageId)))this.boardPosts.delete(id);else{row.reactions.delete(me.id);if(row.rejection?.by===me.id)row.rejection=undefined;}}
    for(const [id,row] of this.reports)if(row.reporterId===me.id||!this.messages.has(row.messageId))this.reports.delete(id);
    this.boardReports=this.boardReports.filter(row=>row.reporterId!==me.id&&this.boardPosts.has(row.postId));
    for(const [id,row] of this.blockEntries)if(row.owner===me.id||row.blocked===me.id)this.blockEntries.delete(id);
    this.blocks.delete(me.id);this.blocks.forEach(ids=>ids.delete(me.id));this.settings.delete(me.id);
    this.sectionChanges=this.sectionChanges.filter(row=>row.userId!==me.id);
    for(const event of this.events.values()){
      event.members.delete(me.id);event.mods?.delete(me.id);
      if(event.closedBy===me.id)event.closedBy=undefined;
      if(event.creatorId===me.id){event.creatorId='';event.closedAt=event.closedAt??new Date().toISOString();for(const post of this.boardPosts.values())if(post.eventId===event.id&&post.state==='pending'){post.state='rejected';post.rejectionReason='board_closed';post.rejection=undefined;}}
    }
    this.accounts.delete(emailKey(me.email));this.currentId=null;this.threadListeners.delete(me.id);
    this.emitThreads(affected);for(const event of this.events.values())this.emitBoard(event.id);
  }
  private threads=new Map<string,StoredThread>();
  private threadSeq=0;
  private threadMessageSeq=0;
  private threadOpenRequests=new Map<string,{fingerprint:string;id:string}>();
  private threadListeners=new Map<string,Set<()=>void>>();
  private threadReports:Array<{threadId:string;reporterId:string;reason:ReportReason}>=[];
  subscribeThreads(onChange:()=>void):()=>void {
    const id=this.approvedAccount().id, listeners=this.threadListeners.get(id)??new Set();
    listeners.add(onChange);this.threadListeners.set(id,listeners);
    return()=>{listeners.delete(onChange);if(!listeners.size)this.threadListeners.delete(id);};
  }
  private emitThreads(ids:Iterable<string>) {for(const id of ids)this.threadListeners.get(id)?.forEach(listener=>listener());}
  private threadAccess(id:string):StoredThread {
    const viewer=this.approvedAccount(), thread=this.threads.get(id);
    if(!thread?.participants.has(viewer.id))throw new ApiError('unknown','thread unavailable',404);
    const other=[...thread.participants.keys()].find(person=>person!==viewer.id)!;
    if(this.blocks.get(viewer.id)?.has(other))throw new ApiError('unknown','thread unavailable',404);
    return thread;
  }
  private threadCanSend(thread:StoredThread) {
    const viewer=this.approvedAccount();
    const other=[...thread.participants.keys()].find(person=>person!==viewer.id)!;
    if(this.blocks.get(other)?.has(viewer.id)||this.find(other)?.status!=='approved')throw new ApiError('unknown','delivery unavailable',403);
  }
  private threadScreen(text:string,ack?:boolean,max=500) {
    if(!text.trim()||text.trim().length>max)throw new ApiError('validation','invalid message',422);
    const result=this.screening(text.trim());
    if(result==='block'||(result==='warn'&&!ack))throw new ApiError('unknown','delivery unavailable',422);
  }
  private threadSender(level:import('./messages').MessageLevel,hints:import('./messages').AllowedHints):MessageSender {
    const me=this.toMe(this.approvedAccount());
    if(!['anonymous','hint','named'].includes(level)||(level==='hint'&&!hints.section&&!hints.country&&!hints.letter))throw new ApiError('validation','invalid anonymity',422);
    return level==='anonymous'?{level}:level==='named'?{level,name:me.name,avatar:me.avatarUrl}:{level,hints:{
      ...(hints.section?{section:me.section!.name}:{}),...(hints.country?{country:me.section!.country}:{}),...(hints.letter?{letter:Array.from(me.name!)[0]}:{})}};
  }
  private appendThread(thread:StoredThread,text:string,system?:'revealed') {
    const viewer=this.approvedAccount();
    thread.messages.push({id:'thread-message-'+ ++this.threadMessageSeq,text,senderId:viewer.id,
      sender:JSON.parse(JSON.stringify(thread.participants.get(viewer.id)!.sender)),createdAt:new Date().toISOString(),...(system?{system}:{})});
  }
  async openThread(input:OpenThreadRequest):Promise<{id:string}> {
    await this.wait();const viewer=this.approvedAccount();
    if(!input.requestId||input.requestId.length>100)throw new ApiError('validation','request key required',422);
    const key=viewer.id+':'+input.requestId,fingerprint=JSON.stringify(input), prior=this.threadOpenRequests.get(key);
    if(prior){if(prior.fingerprint!==fingerprint)throw new ApiError('unknown','request key reused',409);this.threadAccess(prior.id);return {id:prior.id};}
    let origin:StoredThread['origin'], source:string;
    if(input.origin.kind==='inbox') {
      const row=this.ownMessage(input.origin.id);
      origin={id:row.id,text:row.text,senderId:row.senderId,sender:JSON.parse(JSON.stringify(row.sender))};
      source=this.events.get(row.eventId)!.request.name;
    } else if(input.origin.kind==='post') {
      const event=this.boardEvent(input.origin.eventId),row=this.publishedBoardRows(event.id).find(p=>p.id===input.origin.id);
      if(!row)throw new ApiError('unknown','post unavailable',404);
      origin={id:row.id,text:row.text,senderId:row.senderId,sender:JSON.parse(JSON.stringify(row.sender))};source=event.request.name;
    } else throw new ApiError('validation','origin required',422);
    if(origin.senderId===viewer.id||this.find(origin.senderId)?.status!=='approved'||this.blocks.get(viewer.id)?.has(origin.senderId)||this.blocks.get(origin.senderId)?.has(viewer.id))throw new ApiError('unknown','delivery unavailable',403);
    this.threadScreen(input.text,input.screeningAcknowledged,280);
    const sender=this.threadSender(input.anonymityLevel,input.allowedHints),id='thread-'+ ++this.threadSeq;
    const thread:StoredThread={id,source,origin,participants:new Map([
      [viewer.id,{sender,readThrough:-1}],[origin.senderId,{sender:JSON.parse(JSON.stringify(origin.sender)),readThrough:-1}],
    ]),messages:[],requests:new Map()};
    this.appendThread(thread,input.text.trim());this.threads.set(id,thread);this.threadOpenRequests.set(key,{fingerprint,id});
    this.emitThreads(thread.participants.keys());return {id};
  }
  private threadMessageDto(row:StoredThreadMessage):ThreadMessage {
    return {id:row.id,text:row.text,sender:JSON.parse(JSON.stringify(row.sender)),mine:row.senderId===this.approvedAccount().id,createdAt:row.createdAt,...(row.system?{system:row.system}:{})};
  }
  private threadSummary(thread:StoredThread) {
    const viewer=this.approvedAccount(),mine=thread.participants.get(viewer.id)!;
    const other=[...thread.participants.entries()].find(([id])=>id!==viewer.id)![1];
    const last=thread.messages[thread.messages.length-1];
    return {id:thread.id,other:JSON.parse(JSON.stringify(other.sender)) as MessageSender,source:thread.source,
      lastMessage:this.threadMessageDto(last),updatedAt:last.createdAt,
      unreadCount:thread.messages.filter((row,index)=>index>mine.readThrough&&row.senderId!==viewer.id).length};
  }
  async getThreads():Promise<ThreadsSnapshot> {
    await this.wait();const viewer=this.approvedAccount();
    const threads=[...this.threads.values()].filter(thread=>thread.participants.has(viewer.id)&&
      ![...thread.participants.keys()].some(id=>id!==viewer.id&&this.blocks.get(viewer.id)?.has(id)))
      .sort((a,b)=>Number(b.messages.at(-1)!.id.slice(15))-Number(a.messages.at(-1)!.id.slice(15))).map(thread=>this.threadSummary(thread));
    return {threads,unreadCount:threads.reduce((sum,thread)=>sum+thread.unreadCount,0)};
  }
  async getThread(id:string):Promise<ThreadDetail> {
    await this.wait();const thread=this.threadAccess(id),viewer=this.approvedAccount(),mine=thread.participants.get(viewer.id)!;
    const blockMessage=thread.messages.find(row=>row.senderId!==viewer.id);
    return {...this.threadSummary(thread),origin:{id:thread.origin.id,text:thread.origin.text,sender:JSON.parse(JSON.stringify(thread.origin.sender)),mine:thread.origin.senderId===viewer.id},
      mySender:JSON.parse(JSON.stringify(mine.sender)),canReveal:mine.sender.level!=='named',
      blockMessageId:blockMessage?.id??thread.origin.id,messages:thread.messages.map(row=>this.threadMessageDto(row))};
  }
  async sendThreadMessage(id:string,input:{text:string;requestId:string;screeningAcknowledged?:boolean}):Promise<void> {
    await this.wait();const thread=this.threadAccess(id);this.threadCanSend(thread);
    if(!input.requestId||input.requestId.length>100)throw new ApiError('validation','request key required',422);
    const key=this.approvedAccount().id+':'+input.requestId,fingerprint=JSON.stringify(input),prior=thread.requests.get(key);
    if(prior){if(prior.fingerprint!==fingerprint)throw new ApiError('unknown','request key reused',409);return;}
    this.threadScreen(input.text,input.screeningAcknowledged);this.appendThread(thread,input.text.trim());thread.requests.set(key,{fingerprint});
    this.emitThreads(thread.participants.keys());
  }
  async markThreadRead(id:string,throughMessageId:string):Promise<void> {
    await this.wait();const thread=this.threadAccess(id),viewer=this.approvedAccount(),index=thread.messages.findIndex(row=>row.id===throughMessageId);
    if(index<0)throw new ApiError('validation','unknown read watermark',422);
    const participant=thread.participants.get(viewer.id)!;
    if(index>participant.readThrough){participant.readThrough=index;this.emitThreads([viewer.id]);}
  }
  async revealInThread(id:string):Promise<void> {
    await this.wait();const thread=this.threadAccess(id);this.threadCanSend(thread);
    const participant=thread.participants.get(this.approvedAccount().id)!;if(participant.sender.level==='named')return;
    participant.sender=this.threadSender('named',{});participant.revealedAt=new Date().toISOString();
    this.appendThread(thread,'','revealed');this.emitThreads(thread.participants.keys());
  }
  async reportThread(id:string,reason:ReportReason):Promise<void> {
    await this.wait();const thread=this.threadAccess(id);
    if(!['harassment','hate','sexual','identity','spam'].includes(reason))throw new ApiError('validation','invalid reason',422);
    this.threadReports.push({threadId:thread.id,reporterId:this.approvedAccount().id,reason});
  }
  async blockThread(id:string,messageId:string):Promise<void> {
    await this.wait();const thread=this.threadAccess(id),viewer=this.approvedAccount();
    const message=thread.messages.find(row=>row.id===messageId)??(thread.origin.id===messageId?thread.origin:undefined);
    if(!message||message.senderId===viewer.id)throw new ApiError('validation','other participant message required',422);
    this.rememberBlock(viewer.id,message.senderId,message.sender);
  }

  private boardPosts = new Map<string, StoredBoardPost>();
  private boardSeq = 0;
  private rejectionSeq = 0;
  private boardListeners = new Map<string, Set<() => void>>();
  private boardReports: Array<{postId: string; reporterId: string; reason: ReportReason}> = [];
  subscribeBoard(id: string, onChange: () => void): () => void {
    this.boardEvent(id);
    const listeners = this.boardListeners.get(id) ?? new Set();
    listeners.add(onChange); this.boardListeners.set(id, listeners);
    return () => { listeners.delete(onChange); if (!listeners.size) this.boardListeners.delete(id); };
  }
  private emitBoard(id: string) { this.boardListeners.get(id)?.forEach(listener => listener()); }
  private boardEvent(id: string, moderator = false, live = false) {
    const viewer = this.approvedAccount(), event = this.events.get(id);
    if (!event?.members.has(viewer.id)) throw new ApiError('unknown', 'event unavailable', 404);
    if (moderator && event.creatorId !== viewer.id && !event.mods?.has(viewer.id)) throw new ApiError('unknown', 'moderator required', 403);
    const now = Date.now();
    const writable = !event.closedAt && now >= Date.parse(event.request.startsAt) && now < Date.parse(event.request.endsAt);
    for (const row of this.boardPosts.values()) {
      if (row.eventId !== id || row.messageId || row.state !== 'pending') continue;
      if (event.closedAt || now >= Date.parse(event.request.endsAt)) {
        row.state = 'rejected'; row.rejectionReason = 'board_closed'; row.rejection = undefined;
      } else if (row.rejection && now >= row.rejection.until) {
        row.state = 'rejected'; row.rejectionReason = 'moderator'; row.rejection = undefined;
      }
    }
    if (live && !writable) throw new ApiError('unknown', 'board is read only', 409);
    return event;
  }
  private publishedBoardRows(id: string) {
    return [...this.boardPosts.values()].filter(row => row.eventId === id && !row.hidden && (row.messageId
      ? this.messages.get(row.messageId)?.state === 'approved' && !this.messages.get(row.messageId)?.deletedAt
      : row.state === 'approved'));
  }
  private boardDto(row: StoredBoardPost): BoardPost {
    const viewer = this.approvedAccount(), reactions: Record<string,number> = {};
    row.reactions.forEach(emoji => { reactions[emoji] = (reactions[emoji] ?? 0) + 1; });
    const recipientAccount = row.messageId ? this.find(this.messages.get(row.messageId)!.recipientId) : undefined;
    const recipient = recipientAccount && this.toMe(recipientAccount);
    return { id: row.id, text: row.text, sender: JSON.parse(JSON.stringify(row.sender)), createdAt: row.createdAt,
      state: row.messageId ? 'approved' : row.state, mine: viewer.id === row.senderId,
      reactions, myReaction: row.reactions.get(viewer.id), rejectionReason: row.rejectionReason,
      ...(recipient ? {recipient: {id: recipient.id, name: recipient.name!, avatarUrl: recipient.avatarUrl, section: recipient.section!}} : {}) };
  }
  async getBoard(id: string): Promise<BoardSnapshot> {
    await this.wait(); const event = this.boardEvent(id), viewer = this.approvedAccount();
    const detail = this.eventDto(event, viewer.id);
    const all = [...this.boardPosts.values()].filter(row => row.eventId === id && !row.messageId);
    const newest = (rows: StoredBoardPost[]) => rows.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id.slice(5))-Number(a.id.slice(5))).map(row => this.boardDto(row));
    const published = this.publishedBoardRows(id);
    return { event: detail, posts: newest(published),
      ownUnpublished: newest(all.filter(row => row.senderId === viewer.id && row.state !== 'approved')),
      queue: detail.isModerator ? all.filter(row => row.state === 'pending' && !row.rejection).map(row => this.boardDto(row)) : [],
      pendingCount: detail.isModerator ? all.filter(row=>row.state==='pending').length : 0,
      reviewed: detail.isModerator ? newest(all.filter(row => row.state !== 'pending' && !row.hidden)) : [],
      creator: detail.people.find(person => person.id === event.creatorId)!,
      moderators: detail.people.filter(person => event.mods?.has(person.id)), canManageModerators: event.creatorId === viewer.id };
  }
  async sendBoardPost(input: SendBoardPost): Promise<{accepted: true}> {
    await this.wait(); const event = this.boardEvent(input.eventId, false, true), viewer = this.approvedAccount();
    if (input.recipientId) {
      const message = await this.deliverWallMessage({...input, recipientId: input.recipientId}, true);
      message.fromBoard = true;
      const id = 'post-' + ++this.boardSeq;
      this.boardPosts.set(id, {id, eventId:event.id, senderId:viewer.id, text:message.text, sender:message.sender,
        createdAt:message.createdAt, state:'approved', messageId:message.id, reactions:new Map()});
      this.emitBoard(event.id); return {accepted:true};
    }
    const text = input.text.trim(), level = input.anonymityLevel, hints = input.allowedHints;
    if (!text || text.length > 280 || !['anonymous','hint','named'].includes(level) ||
      (level === 'hint' && !hints.section && !hints.country && !hints.letter)) throw new ApiError('validation','invalid post',422);
    const screening = this.screening(text);
    if (screening === 'block' || (screening === 'warn' && !input.screeningAcknowledged)) throw new ApiError('unknown','delivery unavailable',422);
    const me = this.toMe(viewer);
    const sender: MessageSender = level === 'anonymous' ? {level} : level === 'named' ? {level,name:me.name,avatar:me.avatarUrl}
      : {level,hints:{...(hints.section?{section:me.section!.name}:{}),...(hints.country?{country:me.section!.country}:{}),...(hints.letter?{letter:Array.from(me.name!)[0]}:{})}};
    const moderator = event.creatorId === viewer.id || event.mods?.has(viewer.id);
    const published = moderator || event.request.boardMode === 'post_immediately';
    const id = 'post-' + ++this.boardSeq;
    this.boardPosts.set(id, {id,eventId:event.id,senderId:viewer.id,text,sender,createdAt:new Date().toISOString(),
      state:published?'approved':'pending',approval:moderator?'auto_approved_by_author':published?'immediate':undefined,reactions:new Map()});
    this.emitBoard(event.id); return {accepted:true};
  }
  async approvePosts(eventId: string, ids: string[]): Promise<void> {
    await this.wait(); this.boardEvent(eventId, true, true);
    const rows = [...new Set(ids)].map(id => this.boardPosts.get(id));
    if (!rows.length || rows.some(row => !row || row.eventId !== eventId || row.messageId || row.state !== 'pending' || row.rejection)) throw new ApiError('unknown','queue changed',409);
    rows.forEach(row => { row!.state='approved'; row!.approval='moderator'; }); this.emitBoard(eventId);
  }
  async rejectPost(eventId: string, id: string): Promise<RejectionReceipt> {
    await this.wait(); this.boardEvent(eventId,true,true); const row = this.boardPosts.get(id);
    if (!row || row.eventId !== eventId || row.messageId || row.state !== 'pending' || row.rejection) throw new ApiError('unknown','queue changed',409);
    const until = Date.now()+5000, token = 'undo-' + ++this.rejectionSeq;
    row.rejection = {token,until,by:this.approvedAccount().id};
    // Expiry is authoritative even if the moderator leaves the screen.
    const timer = setTimeout(() => { if(row.rejection?.token === token && Date.now() >= until) {
      row.state='rejected'; row.rejectionReason='moderator'; row.rejection=undefined; this.emitBoard(eventId);
    } },5000);
    (timer as unknown as {unref?:()=>void}).unref?.();
    this.emitBoard(eventId); return {undoToken:token,undoUntil:new Date(until).toISOString()};
  }
  async undoRejection(eventId: string, token: string): Promise<void> {
    await this.wait(); this.boardEvent(eventId,true,true);
    const row = [...this.boardPosts.values()].find(row => row.eventId === eventId && row.rejection?.token === token);
    if (!row?.rejection || row.rejection.by !== this.approvedAccount().id || Date.now() >= row.rejection.until) throw new ApiError('unknown','undo expired',409);
    row.rejection=undefined; this.emitBoard(eventId);
  }
  async reactToPost(eventId: string, id: string, emoji: string | null): Promise<void> {
    await this.wait(); this.boardEvent(eventId,false,true);
    const row = this.publishedBoardRows(eventId).find(row => row.id === id);
    if (!row || (emoji !== null && !['🔥','😂','❤️','👀','😳'].includes(emoji))) throw new ApiError('validation','invalid reaction',422);
    if (emoji) row.reactions.set(this.approvedAccount().id,emoji); else row.reactions.delete(this.approvedAccount().id);
    this.emitBoard(eventId);
  }
  async hidePost(eventId: string, id: string): Promise<void> {
    await this.wait(); this.boardEvent(eventId,true,true); const row = this.publishedBoardRows(eventId).find(row => row.id === id);
    if (!row || row.messageId) throw new ApiError('unknown','room post unavailable',404);
    row.hidden=true; this.emitBoard(eventId);
  }
  async reportPost(eventId: string, id: string, reason: ReportReason): Promise<void> {
    await this.wait(); this.boardEvent(eventId);
    if (!this.publishedBoardRows(eventId).some(row => row.id === id) || !['harassment','hate','sexual','identity','spam'].includes(reason)) throw new ApiError('validation','post unavailable',422);
    this.boardReports.push({postId:id,reporterId:this.approvedAccount().id,reason});
  }
  async updateBoardControls(eventId: string, changes: {boardMode?: 'approve_first'|'post_immediately';endsAt?:string}): Promise<void> {
    await this.wait(); const event=this.boardEvent(eventId,true);
    if (event.closedAt || Date.now() >= Date.parse(event.request.endsAt)) throw new ApiError('unknown','board archived',409);
    if (changes.boardMode && !['approve_first','post_immediately'].includes(changes.boardMode)) throw new ApiError('validation','invalid mode',422);
    if (changes.endsAt && (!Number.isFinite(Date.parse(changes.endsAt)) || Date.parse(changes.endsAt) <= Math.max(Date.now(),Date.parse(event.request.startsAt)))) throw new ApiError('validation','invalid end',422);
    event.request={...event.request,...changes}; this.emitBoard(eventId);
  }
  async closeBoard(eventId: string): Promise<void> {
    await this.wait(); const event=this.boardEvent(eventId,true,true);
    event.closedAt=new Date().toISOString(); event.closedBy=this.approvedAccount().id;
    this.boardEvent(eventId); this.emitBoard(eventId);
  }
  async setModerator(eventId: string, personId: string, enabled: boolean): Promise<void> {
    await this.wait(); const event=this.boardEvent(eventId,true);
    if(event.creatorId !== this.approvedAccount().id || personId === event.creatorId || !event.members.has(personId)) throw new ApiError('unknown','cannot change moderator',403);
    if(event.closedAt || Date.now() >= Date.parse(event.request.endsAt)) throw new ApiError('unknown','board archived',409);
    event.mods ??=new Set(); if(enabled) event.mods.add(personId); else event.mods.delete(personId); this.emitBoard(eventId);
  }

  private readonly messages = new Map<string, StoredMessage>();
  private readonly blocks = new Map<string, Set<string>>();
  private readonly reports = new Map<string, { messageId: string; reporterId: string; reason: ReportReason }>();
  private messageSequence = 0;
  private readonly screening: NonNullable<MockApiOptions['screening']>;
  private readonly recipientPolicy: NonNullable<MockApiOptions['recipientPolicy']>;

  private messageDto(row: StoredMessage): InboxMessage {
    return { id: row.id, text: row.text, createdAt: row.createdAt, state: row.state,
      sender: JSON.parse(JSON.stringify(row.sender)) as MessageSender,
      source: { eventId: row.eventId, name: this.events.get(row.eventId)!.request.name }, approvedFromBoard: !!row.fromBoard };
  }
  private hiddenFrom(row: StoredMessage, viewerId: string): boolean {
    return !!row.deletedAt || !!this.blocks.get(viewerId)?.has(row.senderId);
  }
  private newest(rows: StoredMessage[]): StoredMessage[] {
    return rows.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id.slice(8)) - Number(a.id.slice(8)));
  }
  private ownMessage(id: string): StoredMessage {
    const viewer = this.approvedAccount(), row = this.messages.get(id);
    if (!row || row.recipientId !== viewer.id || this.hiddenFrom(row, viewer.id)) throw new ApiError('unknown', 'message unavailable', 404);
    return row;
  }
  async getInbox(): Promise<InboxSnapshot> {
    await this.wait(); const viewer = this.approvedAccount();
    const rows = this.newest([...this.messages.values()].filter(row => row.recipientId === viewer.id && !this.hiddenFrom(row, viewer.id)));
    const counts = { new: 0, private: 0, approved: 0 };
    rows.forEach(row => counts[row.state]++);
    return { messages: rows.map(row => this.messageDto(row)), counts };
  }
  async getWall(eventId: string, personId: string): Promise<WallSnapshot> {
    await this.wait(); const viewer = this.approvedAccount();
    const event = this.events.get(eventId), account = this.find(personId);
    if (!event?.members.has(viewer.id) || !event.members.has(personId) || !account || account.status !== 'approved') throw new ApiError('unknown', 'wall unavailable', 404);
    const person = this.toMe(account);
    const rows = this.newest([...this.messages.values()].filter(row => row.recipientId === personId && row.state === 'approved' && !this.hiddenFrom(row, viewer.id)));
    return { person: { id: person.id, name: person.name!, section: person.section!, avatarUrl: person.avatarUrl, bio: person.bio },
      messages: rows.map(row => { const { state: _state, ...message } = this.messageDto(row); return message; }), count: rows.length,
      isOwner: viewer.id === personId, writingPolicy: this.settingsFor(personId).writingPolicy };
  }
  async screenMessage(text: string, context?: 'thread'): Promise<{ warning: boolean }> {
    await this.wait(); this.approvedAccount();
    if (!text.trim() || text.trim().length > (context === 'thread' ? 500 : 280)) throw new ApiError('validation', 'invalid message', 422);
    return { warning: this.screening(text.trim()) !== 'allow' };
  }
  async sendWallMessage(input: SendWallMessage): Promise<{ accepted: true }> {
    await this.deliverWallMessage(input); return {accepted:true};
  }
  private async deliverWallMessage(input: SendWallMessage, fromBoard = false): Promise<StoredMessage> {
    await this.wait(); const viewer = this.approvedAccount();
    if (fromBoard) this.boardEvent(input.eventId, false, true);
    const recipient = this.find(input.recipientId), event = this.events.get(input.eventId);
    const policy = this.settingsFor(input.recipientId);
    if (!recipient || recipient.status !== 'approved' || recipient.id === viewer.id ||
      !event?.members.has(viewer.id) || !event.members.has(recipient.id) ||
      this.blocks.get(recipient.id)?.has(viewer.id) || policy.writingPolicy === 'nobody' ||
      (policy.writingPolicy === 'named_only' && input.anonymityLevel !== 'named')) throw new ApiError('unknown', 'delivery unavailable', 403);
    const text = input.text.trim();
    if (!text || text.length > 280 || !['anonymous','hint','named'].includes(input.anonymityLevel)) throw new ApiError('validation', 'invalid message', 422);
    const screening = this.screening(text);
    if (screening === 'block' || (screening === 'warn' && !input.screeningAcknowledged)) throw new ApiError('unknown', 'delivery unavailable', 422);
    const me = this.toMe(viewer), hints = input.allowedHints;
    if (input.anonymityLevel === 'hint' && !hints.section && !hints.country && !hints.letter) throw new ApiError('validation', 'select a hint', 422);
    const sender: MessageSender = input.anonymityLevel === 'anonymous' ? { level: 'anonymous' } : input.anonymityLevel === 'named'
      ? { level: 'named', name: me.name, avatar: me.avatarUrl }
      : { level: 'hint', hints: { ...(hints.section ? { section: me.section!.name } : {}),
        ...(hints.country ? { country: me.section!.country } : {}), ...(hints.letter ? { letter: Array.from(me.name!)[0] } : {}) } };
    const muted = policy.mutedWords.some(word => !!normalizeForSearch(word) && normalizeForSearch(text).includes(normalizeForSearch(word)));
    const id = `message-${++this.messageSequence}`;
    this.messages.set(id, { id, senderId: viewer.id, recipientId: recipient.id, eventId: event.id, text, sender,
      state: muted ? 'private' : 'new', pushSuppressed: muted || !policy.notifications.inbox, createdAt: new Date().toISOString() });
    return this.messages.get(id)!;
  }
  async updateInboxMessage(id: string, state: MessageState): Promise<InboxMessage> {
    await this.wait(); const row = this.ownMessage(id);
    if (!['new','private','approved'].includes(state)) throw new ApiError('validation', 'invalid state', 422);
    row.state = state; this.emitBoard(row.eventId); return this.messageDto(row);
  }
  async deleteInboxMessage(id: string): Promise<void> {
    await this.wait(); const row = this.ownMessage(id); row.deletedAt = new Date().toISOString(); this.emitBoard(row.eventId);
  }
  async reportMessage(id: string, reason: ReportReason): Promise<void> {
    await this.wait(); const row = this.ownMessage(id), viewer = this.approvedAccount();
    if (!['harassment','hate','sexual','identity','spam'].includes(reason)) throw new ApiError('validation', 'invalid reason', 422);
    this.reports.set(`${id}:${viewer.id}`, { messageId: row.id, reporterId: viewer.id, reason });
  }
  async blockMessage(id: string): Promise<void> {
    await this.wait(); const row = this.ownMessage(id), viewer = this.approvedAccount();
    this.rememberBlock(viewer.id,row.senderId,row.sender);
  }
  private readonly events = new Map<string, {
    request: CreateEventRequest; id: string; creatorId: string; members: Set<string>;
    section: SectionRef; code: string; mods?: Set<string>; closedAt?: string; closedBy?: string;
  }>();
  private eventSeq = 0;

  private approvedAccount(): Account {
    const account = this.require();
    if (account.status !== 'approved') throw new ApiError('unauthorized', 'approval required', 403);
    return account;
  }

  async listMyEvents(): Promise<EventSummary[]> {
    await this.wait();
    const viewer = this.approvedAccount();
    return [...this.events.values()].filter(e => e.members.has(viewer.id)).map(e => this.eventDto(e, viewer.id));
  }

  async createEvent(request: CreateEventRequest): Promise<EventDetail> {
    await this.wait();
    const viewer = this.approvedAccount();
    const start = Date.parse(request.startsAt), end = Date.parse(request.endsAt);
    if (request.name.trim().length < 2 || request.name.trim().length > 40 ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      !['section', 'national'].includes(request.scope) ||
      !['approve_first', 'post_immediately'].includes(request.boardMode) ||
      !['magenta','coral','tangerine','amber','lime','mint','azure','violet'].includes(request.cover)) {
      throw new ApiError('validation', 'invalid event', 422);
    }
    const section = SEED.find(s => s.ref.id === viewer.sectionId)!.ref;
    const sequence = ++this.eventSeq;
    // Deterministic unique codes for this in-memory mock, never a production generator.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let n = sequence, code = '';
    for (let i = 0; i < 6; i++) { code = alphabet[n % alphabet.length] + code; n = Math.floor(n / alphabet.length); }
    const event = { request: { ...request, name: request.name.trim() }, id: `event-${sequence}`,
      creatorId: viewer.id, members: new Set([viewer.id]), section, code };
    this.events.set(event.id, event);
    return this.eventDto(event, viewer.id);
  }

  async joinEvent(code: string): Promise<EventJoinResult> {
    await this.wait();
    const viewer = this.approvedAccount();
    const event = [...this.events.values()].find(e => e.code === code.toUpperCase().replace(/[\s-]/g, ''));
    if (!event) return { ok: false, reason: 'not_found' };
    if (event.members.has(viewer.id)) return { ok: false, reason: 'already_joined', eventName: event.request.name };
    event.members.add(viewer.id);
    return { ok: true, event: this.eventDto(event, viewer.id) };
  }

  async getEvent(id: string): Promise<EventDetail> {
    await this.wait();
    const viewer = this.approvedAccount();
    const event = this.events.get(id);
    if (!event || !event.members.has(viewer.id)) throw new ApiError('unknown', 'event unavailable', 404);
    return this.eventDto(event, viewer.id);
  }

  private eventDto(event: { request: CreateEventRequest; id: string; creatorId: string; members: Set<string>; section: SectionRef; code: string; mods?: Set<string>; closedAt?: string; closedBy?: string }, viewerId: string): EventDetail {
    const people = [...event.members].map(id => this.toMe(this.find(id)!))
      .map(p => ({ id: p.id, name: p.name!, section: p.section!, avatarUrl: p.avatarUrl, bio: p.bio }))
      .sort((a, b) => Number(b.id === viewerId) - Number(a.id === viewerId));
    const now = Date.now();
    return { ...event.request, id: event.id, country: event.section.country,
      section: event.request.scope === 'section' ? { ...event.section } : undefined,
      closedAt: event.closedAt,
      status: event.closedAt || now >= Date.parse(event.request.endsAt) ? 'archived' : now >= Date.parse(event.request.startsAt) ? 'live' : 'upcoming',
      memberCount: people.length, postCount: this.publishedBoardRows(event.id).length, people, joinCode: event.code, isModerator: event.creatorId === viewerId || !!event.mods?.has(viewerId) };
  }
  private readonly approveAfterMs: number;
  private readonly latencyMs: number;
  private readonly accounts = new Map<string, Account>();
  private currentId: string | null = null;
  private unauthorized: (() => void) | undefined;
  private seq = 0;

  constructor(options: MockApiOptions = {}) {
    this.screening = options.screening ?? (() => 'allow');
    this.recipientPolicy = options.recipientPolicy ?? (() => ({ writingPolicy: 'anyone', mutedWords: [] }));
    this.approveAfterMs = options.approveAfterMs ?? 4000;
    this.latencyMs = options.latencyMs ?? 150;
  }

  /* ---------------- tokens ---------------- */

  setTokens(tokens: Tokens | null): void {
    // The mock's access token IS the user id, prefixed. Nothing signs it; it
    // only has to survive a round trip through secure storage.
    this.currentId = tokens ? tokens.accessToken.replace(/^mock\./, '') : null;
  }

  onUnauthorized(cb: () => void): void {
    this.unauthorized = cb;
  }

  /* ---------------- auth ---------------- */

  async register(req: RegisterRequest): Promise<AuthResult> {
    await this.wait();
    const email = req.email.trim();
    if (!LIMITS.emailPattern.test(email)) throw new ApiError('validation', 'invalid email', 422, 'email');
    if (req.password.length < LIMITS.passwordMin) {
      throw new ApiError('validation', 'password too short', 422, 'password');
    }
    if (this.accounts.has(emailKey(email))) {
      throw new ApiError('email_in_use', 'that email already has an account', 409, 'email');
    }

    const account: Account = {
      id: `u${++this.seq}`,
      email,
      password: req.password,
      phone: req.phone,
      status: 'incomplete',
      role: 'member',
    };
    this.accounts.set(emailKey(email), account);
    return this.authResult(account);
  }

  async login(req: LoginRequest): Promise<AuthResult> {
    await this.wait();
    const account = this.accounts.get(emailKey(req.email));
    // Same error for "no such account" and "wrong password" — the real server
    // must not let anyone probe for who has an account.
    if (!account || account.password !== req.password) {
      throw new ApiError('invalid_credentials', 'wrong email or password', 401);
    }
    return this.authResult(account);
  }

  async logout(): Promise<void> {
    await this.wait();
    this.currentId = null;
  }

  async forgotPassword(_email: string): Promise<void> {
    await this.wait();
    // Always resolves, like the real 202: existence is not observable.
  }

  /* ---------------- me ---------------- */

  async me(): Promise<Me> {
    await this.wait();
    return this.toMe(this.require());
  }

  async submitProfile(req: ProfileRequest): Promise<Me> {
    await this.wait();
    const account = this.require();

    if(account.status==='banned')throw new ApiError('unknown','account restricted',403);
    if(account.status==='approved')throw new ApiError('validation','use profile editing and section change',422);
    const name = req.name.trim();
    if (!name) throw new ApiError('validation', 'name is required', 422, 'name');
    if (name.length > LIMITS.nameMax) throw new ApiError('validation', 'name too long', 422, 'name');
    if ((req.bio?.length ?? 0) > LIMITS.bioMax) throw new ApiError('validation', 'bio too long', 422, 'bio');
    if (!SEED.some((s) => s.ref.id === req.sectionId)) {
      throw new ApiError('validation', 'unknown section', 422, 'sectionId');
    }

    account.name = name;
    account.bio = req.bio?.trim() || undefined;
    account.sectionId = req.sectionId;
    // The real server returns the resized URL from POST /me/photo; the mock has
    // nowhere to put a file, so it hands the local URI straight back.
    if (req.photoUri) account.avatarUrl = req.photoUri;
    // [D7] Resubmitting after a rejection returns to pending, same as the first send.
    account.status = 'pending';
    account.approveAt = Date.now() + this.approveAfterMs;

    return this.toMe(account);
  }

  /* ---------------- sections ---------------- */

  async listSections(): Promise<SectionSummary[]> {
    await this.wait();
    return SEED.map((s) => ({ ...s.ref, memberCount: this.memberCount(s) }));
  }

  async getSection(id: string): Promise<SectionDetail> {
    await this.wait();
    const seed = SEED.find((s) => s.ref.id === id);
    if (!seed) throw new ApiError('unknown', 'no such section', 404);

    const account = this.currentId ? this.find(this.currentId) : undefined;
    const mine = account?.sectionId === id && account.name ? account : undefined;
    // The prototype puts the viewer at the top of their own section's roster.
    const roster: SectionDetail['roster'] = [
      ...(mine
        ? [{ id: mine.id, name: mine.name as string, avatarUrl: mine.avatarUrl, section: seed.ref }]
        : []),
      ...[...this.accounts.values()].filter(other=>other.id!==account?.id&&other.sectionId===id&&other.status==='approved').map(other=>{const person=this.toMe(other);const shared=[...this.events.values()].find(event=>!!account&&event.members.has(account.id)&&event.members.has(other.id));return {id:person.id,name:person.name!,avatarUrl:person.avatarUrl,section:person.section!,...(shared?{wallEventId:shared.id}:{})};}),
      ...seed.roster.map((name) => ({ id: personId(name), name, section: seed.ref })),
    ];

    const memberCount = this.memberCount(seed);
    // rosterTotal === memberCount: the roster is a page of the whole section, so
    // "and N more" is memberCount - roster.length and the viewer, who is in the
    // list, is also in the count. Nobody is counted twice and nobody is free.
    return { ...seed.ref, memberCount, roster, rosterTotal: memberCount };
  }

  /* ---------------- plumbing ---------------- */

  private wait(): Promise<void> {
    return this.latencyMs > 0 ? sleep(this.latencyMs) : Promise.resolve();
  }

  private find(id: string): Account | undefined {
    for (const account of this.accounts.values()) if (account.id === id) return account;
    return undefined;
  }

  private require(): Account {
    const account = this.currentId ? this.find(this.currentId) : undefined;
    if (!account) {
      this.unauthorized?.();
      throw new ApiError('unauthorized', 'not signed in', 401);
    }
    // The demo admin: a pending account flips to approved once its timer is up,
    // and `me()` is the call that notices — which is exactly what the Pending
    // screen polls.
    if (account.status === 'pending' && account.approveAt !== undefined && Date.now() >= account.approveAt) {
      account.status = 'approved';
      account.approveAt = undefined;
    }
    return account;
  }

  /** The viewer counts toward their own section the moment they pick it. */
  private memberCount(seed: SeedSection): number {
    const account = this.currentId ? this.find(this.currentId) : undefined;
    return seed.members + (account?.sectionId === seed.ref.id ? 1 : 0);
  }

  private authResult(account: Account): AuthResult {
    const tokens: Tokens = {
      accessToken: `mock.${account.id}`,
      refreshToken: `mock.refresh.${account.id}`,
    };
    this.currentId = account.id;
    return { tokens, me: this.toMe(account) };
  }

  private toMe(account: Account): Me {
    const seed = SEED.find((s) => s.ref.id === account.sectionId);
    return {
      id: account.id,
      email: account.email,
      status: account.status,
      role: account.role,
      name: account.name,
      bio: account.bio,
      avatarUrl: account.avatarUrl,
      // [D11] The country is only ever reachable through this ref.
      section: seed?.ref,
    };
  }
}

let singleton: MockApi | null = null;

/**
 * The process-wide dev instance, so a Fast Refresh does not sign you out.
 * Tests construct their own `new MockApi({ latencyMs: 0 })` instead.
 */
export function mockApi(options?: MockApiOptions): MockApi {
  singleton ??= new MockApi(options);
  return singleton;
}
