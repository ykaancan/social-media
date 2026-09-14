import type { AllowedHints, MessageLevel, MessageSender, ReportReason } from './messages';

export type ThreadOrigin = {kind:'inbox'; id:string} | {kind:'post'; id:string; eventId:string};
export interface OpenThreadRequest {
  origin: ThreadOrigin;
  text: string;
  anonymityLevel: MessageLevel;
  allowedHints: AllowedHints;
  screeningAcknowledged?: boolean;
  /** Stable for retries of one send. Never reused for a different draft. */
  requestId: string;
}
export interface ThreadMessage {
  id: string;
  text: string;
  sender: MessageSender;
  mine: boolean;
  createdAt: string;
  system?: 'revealed';
}
export interface ThreadSummary {
  id: string;
  other: MessageSender;
  source: string;
  lastMessage: ThreadMessage;
  unreadCount: number;
  updatedAt: string;
}
export interface ThreadsSnapshot { threads: ThreadSummary[]; unreadCount: number }
export interface ThreadDetail extends ThreadSummary {
  origin: {id:string; text:string; sender:MessageSender; mine:boolean};
  mySender: MessageSender;
  canReveal: boolean;
  /** An origin/message reference written by the other participant; not a user ID. */
  blockMessageId: string;
  messages: ThreadMessage[];
}
export interface ThreadApi {
  /** POST /threads. Source access and idempotency are checked server-side. */
  openThread(input: OpenThreadRequest): Promise<{id:string}>;
  /** GET /me/threads */
  getThreads(): Promise<ThreadsSnapshot>;
  /** GET /threads/:id. Does not implicitly mark anything read. */
  getThread(id:string): Promise<ThreadDetail>;
  /** POST /threads/:id/messages. The server chooses the participant's current level. */
  sendThreadMessage(id:string,input:{text:string;requestId:string;screeningAcknowledged?:boolean}): Promise<void>;
  /** PUT /threads/:id/read {throughMessageId}. A monotonic read watermark. */
  markThreadRead(id:string,throughMessageId:string): Promise<void>;
  /** POST /threads/:id/reveal. One-way, idempotent; old message rows never change. */
  revealInThread(id:string): Promise<void>;
  /** POST /threads/:id/report {reason}. Whole thread retained for audited admin review. */
  reportThread(id:string,reason:ReportReason): Promise<void>;
  /** POST /threads/:id/block {messageId}. No sender identity response. */
  blockThread(id:string,messageId:string): Promise<void>;
  /** User-private STOMP invalidations; clients refetch authorized snapshots. */
  subscribeThreads(onChange:()=>void): ()=>void;
}
