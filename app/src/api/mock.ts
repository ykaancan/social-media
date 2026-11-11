import type { AccountSettings, BlockedEntry } from './settings';
import type { OpenThreadRequest, ThreadDetail, ThreadMessage, ThreadsSnapshot } from './threads';
import type { BoardPost, BoardSnapshot, SendBoardPost, RejectionReceipt } from './board';
import { organisations as organisationFixtures, people, sections as sectionFixtures } from '../dev/fixtures';
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
  type DeviceRegistration,
  type LoginRequest,
  type Me,
  type Membership,
  type MembershipRequest,
  type OrganisationRef,
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
 * prototype's behaviour, typed — the same nine sections and rosters — plus the
 * organisation model of [D13]–[D19] as the backend implements it
 * (TENANT_PLAN.md §10): three organisations, memberships, email confirmation,
 * the join refusals and the per-organisation section change.
 *
 * The admin side has no app route, so the mock exposes it as dev methods that
 * mirror the admin API: `confirmEmail` (opening the link), `assignAdmin`,
 * `approveMember`, `rejectMember`, `updateOrganisation` and `banAccount`, plus
 * `addMember` (no server route: an already-approved member, for tests). The
 * test helpers in `testing.ts` build on them.
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
  organisationId: string;
  /** The fixture's own member count, before the signed-in user is added. */
  members: number;
  roster: string[];
}

const SEED: SeedSection[] = sectionFixtures.map((s) => ({
  ref: { id: s.id, name: s.name, country: s.country },
  organisationId: organisationFixtures.find((o) => o.sectionIds.includes(s.id))!.id,
  members: s.members,
  roster: ROSTERS[s.id] ?? [],
}));

interface StoredOrganisation {
  id: string;
  name: string;
  approvalRequired: boolean;
  hasSections: boolean;
  eventCreation: 'admins' | 'members';
}

interface StoredMembership {
  organisationId: string;
  userId: string;
  status: Membership['status'];
  role: Membership['role'];
  sectionId?: string;
  /** [D17] The event approval joins, while pending. */
  pendingEventId?: string;
  submittedAt: number;
  approvedAt?: number;
  /** DEV ONLY: epoch ms at which the demo admin approves a pending request. */
  approveAt?: number;
}

/** An event as the mock stores it. [D13] It belongs to one organisation; [D15] its section is the creator's membership section there, absent without sections. */
interface StoredEvent {
  request: Omit<CreateEventRequest, 'organisationId'>; organisationId: string; id: string; creatorId: string; members: Set<string>;
  section?: SectionRef; code: string; mods?: Set<string>; closedAt?: string; closedBy?: string;
}

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
  /** [D18] */
  emailConfirmed: boolean;
  /** DEV ONLY: epoch ms at which the demo "opens the link". Undefined = never. */
  confirmAt?: number;
  /** [D18] When the newest confirmation link was sent, for the 60-second spacing. */
  confirmationSentAt?: number;
  /** How many confirmation links were sent — the mock's stand-in for the mail log. */
  confirmationsSent: number;
  name?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface MockApiOptions {
  /** Test/development policy injection, not a real keyword/model moderation service. */
  screening?: (text: string) => 'allow' | 'warn' | 'block';
  recipientPolicy?: (id: string) => { writingPolicy: 'anyone' | 'named_only' | 'nobody'; mutedWords: string[] };
  /**
   * How long a `pending` membership waits before the demo organisation admin
   * approves it (which also joins the stored event [D17]). Undefined = never.
   *
   * DEV ONLY. It is a demo convenience, never a promise the UI is allowed to
   * make: no screen may say how long review takes, because in production a
   * person looks at every request by hand.
   */
  approveAfterMs?: number;
  /**
   * How long after sign-up the demo "opens the confirmation link" [D18].
   * Undefined = never; tests call `confirmEmail` instead. DEV ONLY, for the
   * same reason as `approveAfterMs`.
   */
  confirmAfterMs?: number;
  /**
   * Seeds one live demo event per organisation, with the join codes listed in
   * `DEMO_EVENTS`, so the dev app can reach every join answer. Nobody is a
   * member of them. DEV ONLY; tests leave it off.
   */
  demoEvents?: boolean;
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
  /** The event the origin belongs to: its organisation decides the hint section [D15]. */
  eventId:string;
  origin:{id:string;text:string;senderId:string;sender:MessageSender};
  participants:Map<string,{sender:MessageSender;readThrough:number;revealedAt?:string}>;
  messages:StoredThreadMessage[];
  requests:Map<string,{fingerprint:string}>;
}
export class MockApi implements ApiClient {
  private settings=new Map<string,AccountSettings>();
  private blockEntries=new Map<string,{owner:string;blocked:string;sender:MessageSender}>();
  private blockSeq=0;
  /** [D7]/[D15] The section-change log, per organisation. */
  private sectionChanges:Array<{userId:string;organisationId:string;from:string|undefined;to:string;at:string}>=[];
  private settingsFor(id:string):AccountSettings {
    return this.settings.get(id)??{...this.recipientPolicy(id),notifications:{inbox:true,threads:true,boardMentions:true}};
  }
  async getSettings():Promise<AccountSettings>{await this.wait();return cloneSettings(this.settingsFor(this.activeAccount().id));}
  async updateSettings(input:Partial<Pick<AccountSettings,'writingPolicy'|'mutedWords'|'notifications'>>):Promise<AccountSettings>{
    await this.wait();const me=this.activeAccount(),next=cloneSettings(this.settingsFor(me.id));
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
  /**
   * [B8] Devices, keyed by push token exactly as the server keys them: a token is
   * one phone, and registering it again re-binds it to whoever is signed in now.
   * Nothing reads these back — they exist so the registration call is real.
   */
  private devices=new Map<string,{userId:string;platform:DeviceRegistration['platform'];locale:DeviceRegistration['locale']}>();
  async registerDevice(input:DeviceRegistration):Promise<void>{
    await this.wait();const me=this.activeAccount();const token=input?.token?.trim();
    if(!token)throw new ApiError('validation','push token required',422);
    if(!['ios','android','web'].includes(input.platform))throw new ApiError('validation','unknown platform',422);
    if(!['en','tr'].includes(input.locale))throw new ApiError('validation','unsupported locale',422);
    this.devices.set(token,{userId:me.id,platform:input.platform,locale:input.locale});
  }
  async unregisterDevice(token:string):Promise<void>{await this.wait();const me=this.activeAccount(),row=this.devices.get(token);if(row&&row.userId===me.id)this.devices.delete(token);}
  async getBlocked():Promise<BlockedEntry[]>{await this.wait();const me=this.activeAccount();return [...this.blockEntries].filter(([,row])=>row.owner===me.id).map(([id,row])=>({id,sender:cloneSettings(row.sender)}));}
  async unblock(id:string):Promise<void>{await this.wait();const me=this.activeAccount(),row=this.blockEntries.get(id);if(!row||row.owner!==me.id)throw new ApiError('unknown','block unavailable',404);this.blocks.get(me.id)?.delete(row.blocked);this.blockEntries.delete(id);this.emitThreads([me.id]);}
  async editProfile(input:ProfileRequest):Promise<Me>{
    await this.wait();const me=this.activeAccount();if(!input.name.trim()||input.name.trim().length>LIMITS.nameMax||(input.bio?.length??0)>LIMITS.bioMax)throw new ApiError('validation','invalid profile',422);
    me.name=input.name.trim();me.bio=input.bio?.trim()||undefined;if(input.photoUri)me.avatarUrl=input.photoUri;return this.toMe(me);
  }
  /**
   * [D7]/[D15] `SettingsService.changeSection`: an approved membership only (404
   * otherwise); a section of that organisation (422 on `sectionId`); the current
   * section is a no-op; one change per 30 days per organisation (429).
   */
  async changeSection(organisationId:string,sectionId:string):Promise<Me>{
    await this.wait();const me=this.activeAccount();
    const membership=this.membership(organisationId,me.id),organisation=this.organisations.get(organisationId);
    if(!membership||membership.status!=='approved'||!organisation)throw new ApiError('unknown','no such membership',404);
    const target=organisation.hasSections?SEED.find(s=>s.ref.id===sectionId&&s.organisationId===organisationId):undefined;
    if(!target)throw new ApiError('validation','unknown section',422,'sectionId');
    if(membership.sectionId===sectionId)return this.toMe(me);
    const availableAt=this.sectionChangeAvailableAt(me.id,organisationId);
    if(availableAt&&Date.now()<Date.parse(availableAt))throw new ApiError('unknown','section change limited',429);
    this.sectionChanges.push({userId:me.id,organisationId,from:membership.sectionId,to:sectionId,at:new Date().toISOString()});
    membership.sectionId=sectionId;return this.toMe(me);
  }
  /** Newest change in this organisation + 30 days, while that is still ahead; else null. */
  private sectionChangeAvailableAt(userId:string,organisationId:string):string|null{
    const last=this.sectionChanges.filter(row=>row.userId===userId&&row.organisationId===organisationId).at(-1);
    if(!last)return null;const at=Date.parse(last.at)+30*86400000;
    return at>Date.now()?new Date(at).toISOString():null;
  }
  async exportAccount():Promise<Record<string,unknown>>{
    await this.wait();const me=this.activeAccount();
    return {profile:this.toMe(me),settings:await this.getSettings(),blocks:await this.getBlocked(),
      inbox:[...this.messages.values()].filter(row=>row.recipientId===me.id).map(row=>this.messageDto(row)),
      sentMessages:[...this.messages.values()].filter(row=>row.senderId===me.id).map(row=>({text:row.text,sender:row.sender,createdAt:row.createdAt})),
      posts:[...this.boardPosts.values()].filter(row=>row.senderId===me.id).map(row=>({text:row.text,sender:row.sender,createdAt:row.createdAt})),
      threads:[...this.threads.values()].filter(row=>row.participants.has(me.id)).map(row=>({messages:row.messages.map(message=>this.threadMessageDto(message)),origin:{text:row.origin.text,sender:row.origin.sender}})),
      memberships:this.toMe(me).memberships,
      sectionChanges:this.sectionChanges.filter(row=>row.userId===me.id).map(({organisationId,from,to,at})=>({organisationId,from,to,at}))};
  }
  /** [D18] Reachable at any status, confirmed or not: the data is the person's own. */
  async deleteAccount():Promise<void>{
    await this.wait();const me=this.require(),affected=new Set<string>();
    for(const [id,row] of this.threads)if(row.participants.has(me.id)){row.participants.forEach((_,id)=>affected.add(id));this.threads.delete(id);}
    for(const [id,row] of this.threadOpenRequests)if(id.startsWith(me.id+':')||!this.threads.has(row.id))this.threadOpenRequests.delete(id);
    this.threadReports=this.threadReports.filter(row=>row.reporterId!==me.id&&this.threads.has(row.threadId));
    for(const [id,row] of this.messages)if(row.senderId===me.id||row.recipientId===me.id)this.messages.delete(id);
    for(const [id,row] of this.boardPosts){if(row.senderId===me.id||(row.messageId&&!this.messages.has(row.messageId)))this.boardPosts.delete(id);else{row.reactions.delete(me.id);if(row.rejection?.by===me.id)row.rejection=undefined;}}
    for(const [id,row] of this.reports)if(row.reporterId===me.id||!this.messages.has(row.messageId))this.reports.delete(id);
    this.boardReports=this.boardReports.filter(row=>row.reporterId!==me.id&&this.boardPosts.has(row.postId));
    for(const [id,row] of this.blockEntries)if(row.owner===me.id||row.blocked===me.id)this.blockEntries.delete(id);
    this.blocks.delete(me.id);this.blocks.forEach(ids=>ids.delete(me.id));this.settings.delete(me.id);
    for(const [token,row] of this.devices)if(row.userId===me.id)this.devices.delete(token);
    this.sectionChanges=this.sectionChanges.filter(row=>row.userId!==me.id);
    for(const [key,row] of this.memberships)if(row.userId===me.id)this.memberships.delete(key);
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
    const id=this.activeAccount().id, listeners=this.threadListeners.get(id)??new Set();
    listeners.add(onChange);this.threadListeners.set(id,listeners);
    return()=>{listeners.delete(onChange);if(!listeners.size)this.threadListeners.delete(id);};
  }
  private emitThreads(ids:Iterable<string>) {for(const id of ids)this.threadListeners.get(id)?.forEach(listener=>listener());}
  private threadAccess(id:string):StoredThread {
    const viewer=this.activeAccount(), thread=this.threads.get(id);
    if(!thread?.participants.has(viewer.id))throw new ApiError('unknown','thread unavailable',404);
    const other=[...thread.participants.keys()].find(person=>person!==viewer.id)!;
    if(this.blocks.get(viewer.id)?.has(other))throw new ApiError('unknown','thread unavailable',404);
    return thread;
  }
  private threadCanSend(thread:StoredThread) {
    const viewer=this.activeAccount();
    const other=[...thread.participants.keys()].find(person=>person!==viewer.id)!;
    if(this.blocks.get(other)?.has(viewer.id)||this.find(other)?.status!=='active')throw new ApiError('unknown','delivery unavailable',403);
  }
  private threadScreen(text:string,ack?:boolean,max=500) {
    if(!text.trim()||text.trim().length>max)throw new ApiError('validation','invalid message',422);
    const result=this.screening(text.trim());
    if(result==='block'||(result==='warn'&&!ack))throw new ApiError('unknown','delivery unavailable',422);
  }
  private threadSender(level:import('./messages').MessageLevel,hints:import('./messages').AllowedHints,eventId:string):MessageSender {
    if(!['anonymous','hint','named'].includes(level)||(level==='hint'&&!hints.section&&!hints.country&&!hints.letter))throw new ApiError('validation','invalid anonymity',422);
    return this.senderFor(this.activeAccount(),level,hints,eventId);
  }
  /**
   * [D15] The sender at the level they chose. The section and country hints are
   * read from the sender's approved membership in the event's organisation;
   * with none to back them (an organisation without sections) they are a 422 on
   * `allowedHints`, as in `Anonymity.from`. `letter` alone is always accepted.
   */
  private senderFor(account:Account,level:import('./messages').MessageLevel,hints:import('./messages').AllowedHints,eventId:string):MessageSender {
    const me=this.toMe(account);
    if(level==='anonymous')return {level};
    if(level==='named')return {level,name:me.name,avatar:me.avatarUrl};
    const section=this.personSection(account.id,this.events.get(eventId)?.organisationId);
    if(!section&&(hints.section||hints.country))throw new ApiError('validation','section and country hints are not available here',422,'allowedHints');
    return {level,hints:{...(hints.section?{section:section!.name}:{}),...(hints.country?{country:section!.country}:{}),...(hints.letter?{letter:Array.from(me.name!)[0]}:{})}};
  }
  private appendThread(thread:StoredThread,text:string,system?:'revealed') {
    const viewer=this.activeAccount();
    thread.messages.push({id:'thread-message-'+ ++this.threadMessageSeq,text,senderId:viewer.id,
      sender:JSON.parse(JSON.stringify(thread.participants.get(viewer.id)!.sender)),createdAt:new Date().toISOString(),...(system?{system}:{})});
  }
  async openThread(input:OpenThreadRequest):Promise<{id:string}> {
    await this.wait();const viewer=this.activeAccount();
    if(!input.requestId||input.requestId.length>100)throw new ApiError('validation','request key required',422);
    const key=viewer.id+':'+input.requestId,fingerprint=JSON.stringify(input), prior=this.threadOpenRequests.get(key);
    if(prior){if(prior.fingerprint!==fingerprint)throw new ApiError('unknown','request key reused',409);this.threadAccess(prior.id);return {id:prior.id};}
    let origin:StoredThread['origin'], source:string, eventId:string;
    if(input.origin.kind==='inbox') {
      const row=this.ownMessage(input.origin.id);
      origin={id:row.id,text:row.text,senderId:row.senderId,sender:JSON.parse(JSON.stringify(row.sender))};
      source=this.events.get(row.eventId)!.request.name;eventId=row.eventId;
    } else if(input.origin.kind==='post') {
      const event=this.boardEvent(input.origin.eventId),row=this.publishedBoardRows(event.id).find(p=>p.id===input.origin.id);
      if(!row)throw new ApiError('unknown','post unavailable',404);
      origin={id:row.id,text:row.text,senderId:row.senderId,sender:JSON.parse(JSON.stringify(row.sender))};source=event.request.name;eventId=event.id;
    } else throw new ApiError('validation','origin required',422);
    if(origin.senderId===viewer.id||this.find(origin.senderId)?.status!=='active'||this.blocks.get(viewer.id)?.has(origin.senderId)||this.blocks.get(origin.senderId)?.has(viewer.id))throw new ApiError('unknown','delivery unavailable',403);
    this.threadScreen(input.text,input.screeningAcknowledged,280);
    const sender=this.threadSender(input.anonymityLevel,input.allowedHints,eventId),id='thread-'+ ++this.threadSeq;
    const thread:StoredThread={id,source,eventId,origin,participants:new Map([
      [viewer.id,{sender,readThrough:-1}],[origin.senderId,{sender:JSON.parse(JSON.stringify(origin.sender)),readThrough:-1}],
    ]),messages:[],requests:new Map()};
    this.appendThread(thread,input.text.trim());this.threads.set(id,thread);this.threadOpenRequests.set(key,{fingerprint,id});
    this.emitThreads(thread.participants.keys());return {id};
  }
  private threadMessageDto(row:StoredThreadMessage):ThreadMessage {
    return {id:row.id,text:row.text,sender:JSON.parse(JSON.stringify(row.sender)),mine:row.senderId===this.activeAccount().id,createdAt:row.createdAt,...(row.system?{system:row.system}:{})};
  }
  private threadSummary(thread:StoredThread) {
    const viewer=this.activeAccount(),mine=thread.participants.get(viewer.id)!;
    const other=[...thread.participants.entries()].find(([id])=>id!==viewer.id)![1];
    const last=thread.messages[thread.messages.length-1];
    return {id:thread.id,other:JSON.parse(JSON.stringify(other.sender)) as MessageSender,source:thread.source,
      lastMessage:this.threadMessageDto(last),updatedAt:last.createdAt,
      unreadCount:thread.messages.filter((row,index)=>index>mine.readThrough&&row.senderId!==viewer.id).length};
  }
  async getThreads():Promise<ThreadsSnapshot> {
    await this.wait();const viewer=this.activeAccount();
    const threads=[...this.threads.values()].filter(thread=>thread.participants.has(viewer.id)&&
      ![...thread.participants.keys()].some(id=>id!==viewer.id&&this.blocks.get(viewer.id)?.has(id)))
      .sort((a,b)=>Number(b.messages.at(-1)!.id.slice(15))-Number(a.messages.at(-1)!.id.slice(15))).map(thread=>this.threadSummary(thread));
    return {threads,unreadCount:threads.reduce((sum,thread)=>sum+thread.unreadCount,0)};
  }
  async getThread(id:string):Promise<ThreadDetail> {
    await this.wait();const thread=this.threadAccess(id),viewer=this.activeAccount(),mine=thread.participants.get(viewer.id)!;
    const blockMessage=thread.messages.find(row=>row.senderId!==viewer.id);
    return {...this.threadSummary(thread),origin:{id:thread.origin.id,text:thread.origin.text,sender:JSON.parse(JSON.stringify(thread.origin.sender)),mine:thread.origin.senderId===viewer.id},
      mySender:JSON.parse(JSON.stringify(mine.sender)),canReveal:mine.sender.level!=='named',
      blockMessageId:blockMessage?.id??thread.origin.id,messages:thread.messages.map(row=>this.threadMessageDto(row))};
  }
  async sendThreadMessage(id:string,input:{text:string;requestId:string;screeningAcknowledged?:boolean}):Promise<void> {
    await this.wait();const thread=this.threadAccess(id);this.threadCanSend(thread);
    if(!input.requestId||input.requestId.length>100)throw new ApiError('validation','request key required',422);
    const key=this.activeAccount().id+':'+input.requestId,fingerprint=JSON.stringify(input),prior=thread.requests.get(key);
    if(prior){if(prior.fingerprint!==fingerprint)throw new ApiError('unknown','request key reused',409);return;}
    this.threadScreen(input.text,input.screeningAcknowledged);this.appendThread(thread,input.text.trim());thread.requests.set(key,{fingerprint});
    this.emitThreads(thread.participants.keys());
  }
  async markThreadRead(id:string,throughMessageId:string):Promise<void> {
    await this.wait();const thread=this.threadAccess(id),viewer=this.activeAccount(),index=thread.messages.findIndex(row=>row.id===throughMessageId);
    if(index<0)throw new ApiError('validation','unknown read watermark',422);
    const participant=thread.participants.get(viewer.id)!;
    if(index>participant.readThrough){participant.readThrough=index;this.emitThreads([viewer.id]);}
  }
  async revealInThread(id:string):Promise<void> {
    await this.wait();const thread=this.threadAccess(id);this.threadCanSend(thread);
    const participant=thread.participants.get(this.activeAccount().id)!;if(participant.sender.level==='named')return;
    participant.sender=this.threadSender('named',{},thread.eventId);participant.revealedAt=new Date().toISOString();
    this.appendThread(thread,'','revealed');this.emitThreads(thread.participants.keys());
  }
  async reportThread(id:string,reason:ReportReason):Promise<void> {
    await this.wait();const thread=this.threadAccess(id);
    if(!['harassment','hate','sexual','identity','spam'].includes(reason))throw new ApiError('validation','invalid reason',422);
    this.threadReports.push({threadId:thread.id,reporterId:this.activeAccount().id,reason});
  }
  async blockThread(id:string,messageId:string):Promise<void> {
    await this.wait();const thread=this.threadAccess(id),viewer=this.activeAccount();
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
    const viewer = this.activeAccount(), event = this.events.get(id);
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
    const viewer = this.activeAccount(), reactions: Record<string,number> = {};
    row.reactions.forEach(emoji => { reactions[emoji] = (reactions[emoji] ?? 0) + 1; });
    const recipientAccount = row.messageId ? this.find(this.messages.get(row.messageId)!.recipientId) : undefined;
    const recipient = recipientAccount && this.toMe(recipientAccount);
    const recipientSection = recipient && this.personSection(recipient.id, this.events.get(row.eventId)?.organisationId);
    return { id: row.id, text: row.text, sender: JSON.parse(JSON.stringify(row.sender)), createdAt: row.createdAt,
      state: row.messageId ? 'approved' : row.state, mine: viewer.id === row.senderId,
      reactions, myReaction: row.reactions.get(viewer.id), rejectionReason: row.rejectionReason,
      ...(recipient ? {recipient: {id: recipient.id, name: recipient.name!, avatarUrl: recipient.avatarUrl, ...(recipientSection ? {section: recipientSection} : {})}} : {}) };
  }
  async getBoard(id: string): Promise<BoardSnapshot> {
    await this.wait(); const event = this.boardEvent(id), viewer = this.activeAccount();
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
    await this.wait(); const event = this.boardEvent(input.eventId, false, true), viewer = this.activeAccount();
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
    const sender = this.senderFor(viewer, level, hints, event.id);
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
    row.rejection = {token,until,by:this.activeAccount().id};
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
    if (!row?.rejection || row.rejection.by !== this.activeAccount().id || Date.now() >= row.rejection.until) throw new ApiError('unknown','undo expired',409);
    row.rejection=undefined; this.emitBoard(eventId);
  }
  async reactToPost(eventId: string, id: string, emoji: string | null): Promise<void> {
    await this.wait(); this.boardEvent(eventId,false,true);
    const row = this.publishedBoardRows(eventId).find(row => row.id === id);
    if (!row || (emoji !== null && !['🔥','😂','❤️','👀','😳'].includes(emoji))) throw new ApiError('validation','invalid reaction',422);
    if (emoji) row.reactions.set(this.activeAccount().id,emoji); else row.reactions.delete(this.activeAccount().id);
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
    this.boardReports.push({postId:id,reporterId:this.activeAccount().id,reason});
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
    event.closedAt=new Date().toISOString(); event.closedBy=this.activeAccount().id;
    this.boardEvent(eventId); this.emitBoard(eventId);
  }
  async setModerator(eventId: string, personId: string, enabled: boolean): Promise<void> {
    await this.wait(); const event=this.boardEvent(eventId,true);
    if(event.creatorId !== this.activeAccount().id || personId === event.creatorId || !event.members.has(personId)) throw new ApiError('unknown','cannot change moderator',403);
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
    const viewer = this.activeAccount(), row = this.messages.get(id);
    if (!row || row.recipientId !== viewer.id || this.hiddenFrom(row, viewer.id)) throw new ApiError('unknown', 'message unavailable', 404);
    return row;
  }
  async getInbox(): Promise<InboxSnapshot> {
    await this.wait(); const viewer = this.activeAccount();
    const rows = this.newest([...this.messages.values()].filter(row => row.recipientId === viewer.id && !this.hiddenFrom(row, viewer.id)));
    const counts = { new: 0, private: 0, approved: 0 };
    rows.forEach(row => counts[row.state]++);
    return { messages: rows.map(row => this.messageDto(row)), counts };
  }
  async getWall(eventId: string, personId: string): Promise<WallSnapshot> {
    await this.wait(); const viewer = this.activeAccount();
    const event = this.events.get(eventId), account = this.find(personId);
    if (!event?.members.has(viewer.id) || !event.members.has(personId) || !account || account.status !== 'active') throw new ApiError('unknown', 'wall unavailable', 404);
    const person = this.toMe(account), section = this.personSection(personId, event.organisationId);
    const rows = this.newest([...this.messages.values()].filter(row => row.recipientId === personId && row.state === 'approved' && !this.hiddenFrom(row, viewer.id)));
    return { person: { id: person.id, name: person.name!, ...(section ? {section} : {}), avatarUrl: person.avatarUrl, bio: person.bio },
      messages: rows.map(row => { const { state: _state, ...message } = this.messageDto(row); return message; }), count: rows.length,
      isOwner: viewer.id === personId, writingPolicy: this.settingsFor(personId).writingPolicy };
  }
  async screenMessage(text: string, context?: 'thread'): Promise<{ warning: boolean }> {
    await this.wait(); this.activeAccount();
    if (!text.trim() || text.trim().length > (context === 'thread' ? 500 : 280)) throw new ApiError('validation', 'invalid message', 422);
    return { warning: this.screening(text.trim()) !== 'allow' };
  }
  async sendWallMessage(input: SendWallMessage): Promise<{ accepted: true }> {
    await this.deliverWallMessage(input); return {accepted:true};
  }
  private async deliverWallMessage(input: SendWallMessage, fromBoard = false): Promise<StoredMessage> {
    await this.wait(); const viewer = this.activeAccount();
    if (fromBoard) this.boardEvent(input.eventId, false, true);
    const recipient = this.find(input.recipientId), event = this.events.get(input.eventId);
    const policy = this.settingsFor(input.recipientId);
    if (!recipient || recipient.status !== 'active' || recipient.id === viewer.id ||
      !event?.members.has(viewer.id) || !event.members.has(recipient.id) ||
      this.blocks.get(recipient.id)?.has(viewer.id) || policy.writingPolicy === 'nobody' ||
      (policy.writingPolicy === 'named_only' && input.anonymityLevel !== 'named')) throw new ApiError('unknown', 'delivery unavailable', 403);
    const text = input.text.trim();
    if (!text || text.length > 280 || !['anonymous','hint','named'].includes(input.anonymityLevel)) throw new ApiError('validation', 'invalid message', 422);
    const screening = this.screening(text);
    if (screening === 'block' || (screening === 'warn' && !input.screeningAcknowledged)) throw new ApiError('unknown', 'delivery unavailable', 422);
    const hints = input.allowedHints;
    if (input.anonymityLevel === 'hint' && !hints.section && !hints.country && !hints.letter) throw new ApiError('validation', 'select a hint', 422);
    const sender = this.senderFor(viewer, input.anonymityLevel, hints, event.id);
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
    await this.wait(); const row = this.ownMessage(id), viewer = this.activeAccount();
    if (!['harassment','hate','sexual','identity','spam'].includes(reason)) throw new ApiError('validation', 'invalid reason', 422);
    this.reports.set(`${id}:${viewer.id}`, { messageId: row.id, reporterId: viewer.id, reason });
  }
  async blockMessage(id: string): Promise<void> {
    await this.wait(); const row = this.ownMessage(id), viewer = this.activeAccount();
    this.rememberBlock(viewer.id,row.senderId,row.sender);
  }
  private readonly events = new Map<string, StoredEvent>();
  private eventSeq = 0;

  /**
   * `ActiveAccountFilter`, in its order: a ban is decided first (confirmed or
   * not), then an unconfirmed email [D18], then any status but `active` [D14].
   * Membership is not checked here: an active account with none passes.
   */
  private activeAccount(): Account {
    const account = this.require();
    if (account.status === 'banned') throw new ApiError('account_not_active', 'account is not active', 403);
    if (!account.emailConfirmed) throw new ApiError('email_unconfirmed', 'email is not confirmed', 403);
    if (account.status !== 'active') throw new ApiError('account_not_active', 'account is not active', 403);
    return account;
  }

  async listMyEvents(): Promise<EventSummary[]> {
    await this.wait();
    const viewer = this.activeAccount();
    return [...this.events.values()].filter(e => e.members.has(viewer.id)).map(e => this.eventDto(e, viewer.id));
  }

  /**
   * `EventService.create`: `organisationId` is required (422); then [D16] an
   * approved membership the organisation's switch allows, or the same
   * `403 event_creation_not_allowed` for every other case; then the fields.
   * [D15]/P9 `scope` is required with sections and refused without them; the
   * event's section is the creator's membership section.
   */
  async createEvent(request: CreateEventRequest): Promise<EventDetail> {
    await this.wait();
    const viewer = this.activeAccount();
    const organisationId = request.organisationId?.trim();
    if (!organisationId) throw new ApiError('validation', 'missing organisation', 422, 'organisationId');
    const organisation = this.organisations.get(organisationId);
    const membership = organisation && this.membership(organisation.id, viewer.id);
    if (!organisation || !membership || !this.canCreateEvents(organisation, membership)) {
      throw new ApiError('event_creation_not_allowed', 'this account may not create events in this organisation', 403);
    }
    const start = Date.parse(request.startsAt), end = Date.parse(request.endsAt);
    if (request.name.trim().length < 2 || request.name.trim().length > 40 ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new ApiError('validation', 'invalid event', 422);
    }
    if (organisation.hasSections ? !['section', 'national'].includes(request.scope ?? '') : request.scope !== undefined) {
      throw new ApiError('validation', 'invalid scope', 422, 'scope');
    }
    if (!['approve_first', 'post_immediately'].includes(request.boardMode) ||
      !['magenta','coral','tangerine','amber','lime','mint','azure','violet'].includes(request.cover)) {
      throw new ApiError('validation', 'invalid event', 422);
    }
    const section = organisation.hasSections ? SEED.find(s => s.ref.id === membership.sectionId)!.ref : undefined;
    const { organisationId: _organisationId, ...fields } = request;
    return this.eventDto(this.storeEvent({ ...fields, name: request.name.trim() }, organisation.id, viewer.id, section), viewer.id);
  }

  private storeEvent(request: StoredEvent['request'], organisationId: string, creatorId: string, section?: SectionRef, fixedCode?: string): StoredEvent {
    const sequence = ++this.eventSeq;
    // Deterministic unique codes for this in-memory mock, never a production generator.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let n = sequence, code = '';
    for (let i = 0; i < 6; i++) { code = alphabet[n % alphabet.length] + code; n = Math.floor(n / alphabet.length); }
    const event: StoredEvent = { request, organisationId, id: `event-${sequence}`,
      creatorId, members: new Set([creatorId]), section, code: fixedCode ?? code };
    this.events.set(event.id, event);
    return event;
  }

  private eventByCode(code: string): StoredEvent | undefined {
    const normalized = code.toUpperCase().replace(/[\s-]/g, '');
    return normalized ? [...this.events.values()].find(e => e.code === normalized) : undefined;
  }

  /**
   * `EventService.join` [D17], in its order: unknown code; already in the event;
   * then the membership in the event's organisation — none, in an organisation
   * with approval off and no sections, is created `approved` and the event
   * joined; none otherwise is `membership_required` and writes nothing. A
   * pending or rejected person is let in when approval has since been switched
   * off, keeping the section already on the request.
   */
  async joinEvent(code: string): Promise<EventJoinResult> {
    await this.wait();
    const viewer = this.activeAccount();
    const event = this.eventByCode(code);
    if (!event) return { ok: false, reason: 'not_found' };
    if (event.members.has(viewer.id)) return { ok: false, reason: 'already_joined', eventName: event.request.name };
    const organisation = this.organisations.get(event.organisationId)!;
    let membership = this.membership(organisation.id, viewer.id);
    if (!membership) {
      if (organisation.approvalRequired || organisation.hasSections) return this.refusal('membership_required', organisation, event);
      membership = this.putMembership({ organisationId: organisation.id, userId: viewer.id, status: 'approved', role: 'member',
        submittedAt: Date.now(), approvedAt: Date.now() });
    }
    if (membership.status !== 'approved' && !organisation.approvalRequired) {
      membership.status = 'approved'; membership.approvedAt = Date.now(); membership.pendingEventId = undefined; membership.approveAt = undefined;
    }
    if (membership.status === 'pending') return this.refusal('membership_pending', organisation, event);
    if (membership.status === 'rejected') return this.refusal('membership_rejected', organisation, event);
    event.members.add(viewer.id);
    return { ok: true, event: this.eventDto(event, viewer.id) };
  }

  private refusal(reason: 'membership_required' | 'membership_pending' | 'membership_rejected', organisation: StoredOrganisation, event: StoredEvent): EventJoinResult {
    return { ok: false, reason, organisation: this.organisationRef(organisation), approvalRequired: organisation.approvalRequired, eventName: event.request.name };
  }

  /**
   * `OrganisationJoinService.join` [D17]: unknown code → 404. No membership:
   * approval off → `approved` and the event joined now; approval on → `pending`
   * with the code's event stored. `rejected` → `pending` again, section and
   * stored event replaced (P8). `pending` → stays pending, section and stored
   * event replaced. `approved` → unchanged, the event joined; its section is not
   * read. Approval switched off since → let in with the section sent now.
   */
  async requestMembership(request: MembershipRequest): Promise<Membership> {
    await this.wait();
    const viewer = this.activeAccount();
    const event = this.eventByCode(request.code ?? '');
    if (!event) throw new ApiError('unknown', 'no such event', 404);
    const organisation = this.organisations.get(event.organisationId)!;
    const now = Date.now();
    let membership = this.membership(organisation.id, viewer.id);
    if (!membership) {
      const sectionId = this.sectionFor(organisation, request.sectionId);
      const pending = organisation.approvalRequired;
      membership = this.putMembership({ organisationId: organisation.id, userId: viewer.id, status: pending ? 'pending' : 'approved',
        role: 'member', sectionId, submittedAt: now, ...(pending ? { pendingEventId: event.id } : { approvedAt: now }) });
      if (pending) this.scheduleApproval(membership); else event.members.add(viewer.id);
      return this.membershipDto(membership);
    }
    if (membership.status !== 'approved' && !organisation.approvalRequired) {
      membership.sectionId = this.sectionFor(organisation, request.sectionId);
      membership.status = 'approved'; membership.approvedAt = now; membership.pendingEventId = undefined; membership.approveAt = undefined;
    }
    if (membership.status === 'approved') {
      event.members.add(viewer.id);
    } else if (membership.status === 'pending') {
      membership.sectionId = this.sectionFor(organisation, request.sectionId);
      membership.pendingEventId = event.id;
    } else {
      membership.sectionId = this.sectionFor(organisation, request.sectionId);
      membership.status = 'pending'; membership.pendingEventId = event.id; membership.submittedAt = now;
      this.scheduleApproval(membership);
    }
    return this.membershipDto(membership);
  }

  /** `SectionChoice`: required and of that organisation iff it has sections; absent otherwise. 422 on `sectionId`. */
  private sectionFor(organisation: StoredOrganisation, raw: string | undefined): string | undefined {
    const given = raw !== undefined && raw.trim() !== '';
    if (!organisation.hasSections) {
      if (given) throw new ApiError('validation', 'this organisation has no sections', 422, 'sectionId');
      return undefined;
    }
    if (!given) throw new ApiError('validation', 'a section is required in this organisation', 422, 'sectionId');
    const seed = SEED.find(s => s.ref.id === raw!.trim() && s.organisationId === organisation.id);
    if (!seed) throw new ApiError('validation', 'not a section of this organisation', 422, 'sectionId');
    return seed.ref.id;
  }

  async getEvent(id: string): Promise<EventDetail> {
    await this.wait();
    const viewer = this.activeAccount();
    const event = this.events.get(id);
    if (!event || !event.members.has(viewer.id)) throw new ApiError('unknown', 'event unavailable', 404);
    return this.eventDto(event, viewer.id);
  }

  /**
   * `EventService.detail`. [D11] The section rides along only for a
   * section-scoped event; the country whenever the event has a section; neither
   * in an organisation without sections. [D15] Each person's section is their
   * approved membership's section in THIS event's organisation. People without
   * a name are left out of the roster but still counted, as on the server.
   */
  private eventDto(event: StoredEvent, viewerId: string): EventDetail {
    const people = [...event.members].map(id => this.find(id)).filter((a): a is Account => !!a?.name)
      .map(a => { const section = this.personSection(a.id, event.organisationId);
        return { id: a.id, name: a.name!, avatarUrl: a.avatarUrl, bio: a.bio, ...(section ? { section } : {}) }; })
      .sort((a, b) => Number(b.id === viewerId) - Number(a.id === viewerId));
    const now = Date.now();
    const { scope, ...request } = event.request;
    return { ...request, ...(scope ? { scope } : {}), id: event.id,
      organisation: this.organisationRef(this.organisations.get(event.organisationId)!),
      ...(scope === 'section' && event.section ? { section: { ...event.section } } : {}),
      ...(event.section ? { country: event.section.country } : {}),
      closedAt: event.closedAt,
      status: event.closedAt || now >= Date.parse(event.request.endsAt) ? 'archived' : now >= Date.parse(event.request.startsAt) ? 'live' : 'upcoming',
      memberCount: event.members.size, postCount: this.publishedBoardRows(event.id).length, people, joinCode: event.code, isModerator: event.creatorId === viewerId || !!event.mods?.has(viewerId) };
  }

  /* ---------------- organisations and memberships ---------------- */

  private readonly organisations = new Map<string, StoredOrganisation>(organisationFixtures.map(o => [o.id,
    { id: o.id, name: o.name, approvalRequired: o.approvalRequired, hasSections: o.hasSections, eventCreation: o.eventCreation }]));
  private readonly memberships = new Map<string, StoredMembership>();

  private membership(organisationId: string, userId: string): StoredMembership | undefined {
    return this.memberships.get(organisationId + ':' + userId);
  }
  private putMembership(row: StoredMembership): StoredMembership {
    this.memberships.set(row.organisationId + ':' + row.userId, row);
    return row;
  }
  private organisationRef(organisation: StoredOrganisation): OrganisationRef {
    return { id: organisation.id, name: organisation.name, hasSections: organisation.hasSections };
  }
  /** [D16] `MembershipReader.canCreateEvents`, also the rule `createEvent` applies. */
  private canCreateEvents(organisation: StoredOrganisation, membership: StoredMembership): boolean {
    return membership.status === 'approved' && (organisation.eventCreation === 'members' || membership.role === 'admin');
  }
  /**
   * [D15] A person's section in one organisation: their APPROVED membership's
   * section there, with an active account. Undefined for no organisation, no
   * sections, or a pending / rejected request.
   */
  private personSection(userId: string, organisationId: string | undefined): SectionRef | undefined {
    if (!organisationId) return undefined;
    const membership = this.membership(organisationId, userId);
    if (membership?.status !== 'approved' || !membership.sectionId || this.find(userId)?.status !== 'active') return undefined;
    return { ...SEED.find(s => s.ref.id === membership.sectionId)!.ref };
  }
  private membershipDto(row: StoredMembership): Membership {
    const organisation = this.organisations.get(row.organisationId)!;
    const section = row.sectionId ? SEED.find(s => s.ref.id === row.sectionId)?.ref : undefined;
    const pendingEvent = row.status === 'pending' && row.pendingEventId ? this.events.get(row.pendingEventId) : undefined;
    return { organisation: this.organisationRef(organisation), status: row.status, role: row.role,
      ...(section ? { section: { ...section } } : {}), canCreateEvents: this.canCreateEvents(organisation, row),
      sectionChangeAvailableAt: this.sectionChangeAvailableAt(row.userId, row.organisationId),
      ...(pendingEvent ? { pendingEventName: pendingEvent.request.name } : {}) };
  }
  private scheduleApproval(row: StoredMembership) {
    row.approveAt = this.approveAfterMs === undefined ? undefined : Date.now() + this.approveAfterMs;
  }
  /** Approval [D17]: `approved_at` now, and the stored event joined if it still exists. */
  private approve(row: StoredMembership) {
    row.status = 'approved'; row.approvedAt = Date.now(); row.approveAt = undefined;
    if (row.pendingEventId) this.events.get(row.pendingEventId)?.members.add(row.userId);
    row.pendingEventId = undefined;
  }

  /* ---- DEV ONLY: the admin side, which has no app route ---- */

  /** Opening the confirmation link [D18]. Returns false for an unknown address. */
  confirmEmail(email: string): boolean {
    const account = this.accounts.get(emailKey(email));
    if (!account) return false;
    account.emailConfirmed = true; account.confirmAt = undefined;
    return true;
  }

  /**
   * `POST /admin/api/organisations/{id}/admins {email, sectionId?}` (P6): an
   * existing active account; creates, or upgrades the same row to, an approved
   * membership with role `admin` — recording the approval and joining a stored
   * event like an approval does. `sectionId` is required when the organisation
   * has sections and the person has no membership there.
   */
  assignAdmin(organisationId: string, email: string, sectionId?: string): void {
    const organisation = this.organisations.get(organisationId), account = this.accounts.get(emailKey(email));
    if (!organisation) throw new ApiError('unknown', 'no such organisation', 404);
    if (!account || account.status !== 'active') throw new ApiError('validation', 'no active account with that email', 422, 'email');
    const existing = this.membership(organisationId, account.id);
    if (!existing) {
      this.putMembership({ organisationId, userId: account.id, status: 'approved', role: 'admin',
        sectionId: this.sectionFor(organisation, sectionId), submittedAt: Date.now(), approvedAt: Date.now() });
      return;
    }
    existing.role = 'admin';
    if (existing.status !== 'approved') this.approve(existing);
  }

  /**
   * DEV/TEST ONLY, no server route: an approved `member` membership for an
   * existing active account, as if they had asked with a join code and been
   * approved. Lets a test start from "already in the organisation".
   */
  addMember(organisationId: string, email: string, sectionId?: string): void {
    const organisation = this.organisations.get(organisationId), account = this.accounts.get(emailKey(email));
    if (!organisation) throw new ApiError('unknown', 'no such organisation', 404);
    if (!account || account.status !== 'active') throw new ApiError('validation', 'no active account with that email', 422, 'email');
    if (this.membership(organisationId, account.id)) throw new ApiError('unknown', 'already a member', 409);
    this.putMembership({ organisationId, userId: account.id, status: 'approved', role: 'member',
      sectionId: this.sectionFor(organisation, sectionId), submittedAt: Date.now(), approvedAt: Date.now() });
  }

  /** `POST /admin/api/organisations/{id}/members/{userId}/approve`. 409 unless pending. */
  approveMember(organisationId: string, userId: string): void {
    const row = this.membership(organisationId, userId);
    if (!row) throw new ApiError('unknown', 'no such member', 404);
    if (row.status !== 'pending') throw new ApiError('unknown', 'not pending', 409);
    this.approve(row);
  }

  /** `.../reject`. 409 unless pending. Clears the stored event (T-1 correction). */
  rejectMember(organisationId: string, userId: string): void {
    const row = this.membership(organisationId, userId);
    if (!row) throw new ApiError('unknown', 'no such member', 404);
    if (row.status !== 'pending') throw new ApiError('unknown', 'not pending', 409);
    row.status = 'rejected'; row.pendingEventId = undefined; row.approveAt = undefined;
  }

  /** `PATCH /admin/api/organisations/{id}`. Nobody is let in at the moment approval is switched off. */
  updateOrganisation(organisationId: string, changes: { name?: string; approvalRequired?: boolean; eventCreation?: 'admins' | 'members' }): void {
    const organisation = this.organisations.get(organisationId);
    if (!organisation) throw new ApiError('unknown', 'no such organisation', 404);
    Object.assign(organisation, changes);
  }

  /** Account ban, super_admin only [D19]. */
  banAccount(email: string): void {
    const account = this.accounts.get(emailKey(email));
    if (account) account.status = 'banned';
  }

  private readonly approveAfterMs: number | undefined;
  private readonly confirmAfterMs: number | undefined;
  private readonly latencyMs: number;
  private readonly accounts = new Map<string, Account>();
  private currentId: string | null = null;
  private unauthorized: (() => void) | undefined;
  private seq = 0;

  constructor(options: MockApiOptions = {}) {
    this.screening = options.screening ?? (() => 'allow');
    this.recipientPolicy = options.recipientPolicy ?? (() => ({ writingPolicy: 'anyone', mutedWords: [] }));
    this.approveAfterMs = options.approveAfterMs;
    this.confirmAfterMs = options.confirmAfterMs;
    this.latencyMs = options.latencyMs ?? 150;
    if (options.demoEvents) this.seedDemoEvents();
  }

  /**
   * DEV ONLY. One organiser account, admin of every fixture organisation, and
   * one live event in each, so the dev app can reach every join answer: the
   * codes are in `DEMO_EVENTS`. Nobody else is a member of them.
   */
  private seedDemoEvents() {
    const host: Account = { id: 'demo-host', email: 'host@demo.invalid', password: '', status: 'active', role: 'member',
      emailConfirmed: true, confirmationsSent: 0, name: 'Demo host' };
    this.accounts.set(emailKey(host.email), host);
    const start = new Date(Date.now() - 3600000).toISOString(), end = new Date(Date.now() + 7 * 86400000).toISOString();
    for (const demo of DEMO_EVENTS) {
      const organisation = this.organisations.get(demo.organisationId)!;
      const sectionId = organisation.hasSections ? SEED.find(s => s.organisationId === organisation.id)!.ref.id : undefined;
      this.putMembership({ organisationId: organisation.id, userId: host.id, status: 'approved', role: 'admin', sectionId,
        submittedAt: Date.now(), approvedAt: Date.now() });
      this.storeEvent({ name: demo.name, ...(organisation.hasSections ? { scope: 'national' as const } : {}), startsAt: start, endsAt: end,
        cover: demo.cover, boardMode: 'post_immediately' }, organisation.id, host.id,
        sectionId ? SEED.find(s => s.ref.id === sectionId)!.ref : undefined, demo.code);
    }
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
      // [D18] The first link goes out with the sign-up.
      emailConfirmed: false,
      confirmationSentAt: Date.now(),
      confirmationsSent: 1,
      confirmAt: this.confirmAfterMs === undefined ? undefined : Date.now() + this.confirmAfterMs,
    };
    this.accounts.set(emailKey(email), account);
    return this.authResult(account);
  }

  /**
   * [D18] `AuthService.resendConfirmation`: always resolves. A new link only for
   * an unconfirmed account whose newest link is at least 60 seconds old (P3).
   */
  async resendConfirmation(): Promise<void> {
    await this.wait();
    const account = this.require();
    if (account.emailConfirmed) return;
    const now = Date.now();
    if (account.confirmationSentAt !== undefined && now - account.confirmationSentAt < 60_000) return;
    account.confirmationSentAt = now;
    account.confirmationsSent += 1;
  }

  async login(req: LoginRequest): Promise<AuthResult> {
    await this.wait();
    const account = this.accounts.get(emailKey(req.email));
    // Same error for "no such account" and "wrong password" — the real server
    // must not let anyone probe for who has an account.
    if (!account || !account.password || account.password !== req.password) {
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

  /** At any status, confirmed or not [D18]. */
  async me(): Promise<Me> {
    await this.wait();
    return this.toMe(this.require());
  }

  /**
   * `PUT /me/profile`: refused before the email is confirmed (the filter), for a
   * banned account, and for an active one (that is `editProfile`). [D15] No
   * section. The account becomes `active` [D14].
   */
  async submitProfile(req: ProfileRequest): Promise<Me> {
    await this.wait();
    const account = this.require();

    if (account.status === 'banned') throw new ApiError('unknown', 'account restricted', 403);
    if (!account.emailConfirmed) throw new ApiError('email_unconfirmed', 'email is not confirmed', 403);
    if (account.status === 'active') throw new ApiError('validation', 'use profile editing and section change', 422);
    const name = req.name.trim();
    if (!name) throw new ApiError('validation', 'name is required', 422, 'name');
    if (name.length > LIMITS.nameMax) throw new ApiError('validation', 'name too long', 422, 'name');
    if ((req.bio?.length ?? 0) > LIMITS.bioMax) throw new ApiError('validation', 'bio too long', 422, 'bio');

    account.name = name;
    account.bio = req.bio?.trim() || undefined;
    // The real server returns the resized URL from POST /me/photo; the mock has
    // nowhere to put a file, so it hands the local URI straight back.
    if (req.photoUri) account.avatarUrl = req.photoUri;
    account.status = 'active';

    return this.toMe(account);
  }

  /* ---------------- sections ---------------- */

  /** `GET /organisations/{id}/sections`: any active account; 404 for an unknown organisation; empty without sections. */
  async listOrganisationSections(organisationId: string): Promise<SectionSummary[]> {
    await this.wait();
    this.activeAccount();
    if (!this.organisations.has(organisationId)) throw new ApiError('unknown', 'no such organisation', 404);
    return SEED.filter(s => s.organisationId === organisationId)
      .sort((a, b) => normalizeForSearch(a.ref.name).localeCompare(normalizeForSearch(b.ref.name)))
      .map((s) => ({ ...s.ref, memberCount: this.memberCount(s) }));
  }

  /** `GET /sections/{id}`: approved members of the section's organisation only; anyone else 404 [D15]. */
  async getSection(id: string): Promise<SectionDetail> {
    await this.wait();
    const viewer = this.activeAccount();
    const seed = SEED.find((s) => s.ref.id === id);
    if (!seed || this.membership(seed.organisationId, viewer.id)?.status !== 'approved') throw new ApiError('unknown', 'no such section', 404);

    const members = this.sectionMembers(seed);
    const mine = members.find(account => account.id === viewer.id);
    // The prototype puts the viewer at the top of their own section's roster.
    const roster: SectionDetail['roster'] = [
      ...(mine ? [{ id: mine.id, name: mine.name as string, avatarUrl: mine.avatarUrl, section: seed.ref }] : []),
      ...members.filter(other => other.id !== viewer.id).map(other => {
        const shared = [...this.events.values()].find(event => event.members.has(viewer.id) && event.members.has(other.id));
        return { id: other.id, name: other.name!, avatarUrl: other.avatarUrl, section: seed.ref, ...(shared ? { wallEventId: shared.id } : {}) };
      }),
      ...seed.roster.map((name) => ({ id: personId(name), name, section: seed.ref })),
    ];

    const memberCount = this.memberCount(seed);
    // rosterTotal === memberCount: the roster is a page of the whole section, so
    // "and N more" is memberCount - roster.length and the viewer, who is in the
    // list, is also in the count. Nobody is counted twice and nobody is free.
    return { ...seed.ref, memberCount, roster, rosterTotal: memberCount };
  }

  /** Accounts in a section: an approved membership there, an active account, a name. */
  private sectionMembers(seed: SeedSection): Account[] {
    return [...this.accounts.values()].filter(account => account.status === 'active' && !!account.name &&
      this.personSection(account.id, seed.organisationId)?.id === seed.ref.id);
  }

  /** The fixture's own count plus every real account in the section. */
  private memberCount(seed: SeedSection): number {
    return seed.members + this.sectionMembers(seed).length;
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
    // The demo's other side, DEV ONLY: the link is "opened" and a pending
    // request is approved once their timers are up, and the next call notices.
    const now = Date.now();
    if (!account.emailConfirmed && account.confirmAt !== undefined && now >= account.confirmAt) {
      account.emailConfirmed = true; account.confirmAt = undefined;
    }
    for (const row of this.memberships.values()) {
      if (row.status === 'pending' && row.approveAt !== undefined && now >= row.approveAt) this.approve(row);
    }
    return account;
  }

  private authResult(account: Account): AuthResult {
    const tokens: Tokens = {
      accessToken: `mock.${account.id}`,
      refreshToken: `mock.refresh.${account.id}`,
    };
    this.currentId = account.id;
    return { tokens, me: this.toMe(account) };
  }

  /** [D14] `memberships` lists every status, oldest first. [D15] No account-level section. */
  private toMe(account: Account): Me {
    return {
      id: account.id,
      email: account.email,
      emailConfirmed: account.emailConfirmed,
      status: account.status,
      role: account.role,
      name: account.name,
      bio: account.bio,
      avatarUrl: account.avatarUrl,
      memberships: [...this.memberships.values()].filter(row => row.userId === account.id).map(row => this.membershipDto(row)),
    };
  }
}

/**
 * DEV ONLY: the live events `demoEvents` seeds, one per fixture organisation —
 * approval + sections, open + sections, open without sections — so the dev app
 * can reach `membership_required`, `pending` and the one-step join.
 */
export const DEMO_EVENTS: ReadonlyArray<{ organisationId: string; name: string; code: string; cover: CreateEventRequest['cover'] }> = [
  { organisationId: 'esn-tr', name: 'National Platform 2026', code: 'NPL026', cover: 'magenta' },
  { organisationId: 'esn-eu', name: 'Bologna Welcome Week', code: 'BLQ026', cover: 'azure' },
  { organisationId: 'moda', name: 'Quiz Night', code: 'QUIZ26', cover: 'lime' },
];

let singleton: MockApi | null = null;

/**
 * The process-wide dev instance, so a Fast Refresh does not sign you out.
 * Tests construct their own `new MockApi({ latencyMs: 0 })` instead.
 */
export function mockApi(options?: MockApiOptions): MockApi {
  singleton ??= new MockApi(options);
  return singleton;
}
