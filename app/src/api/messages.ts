/** Display-only DTOs. The server retains sender_id; no member endpoint returns it. */
export type MessageLevel = 'anonymous' | 'hint' | 'named';
export type MessageState = 'new' | 'private' | 'approved';
export interface AllowedHints { section?: boolean; country?: boolean; letter?: boolean }
export interface MessageSender {
  level: MessageLevel;
  name?: string;
  avatar?: string;
  hints?: { section?: string; country?: string; letter?: string };
}
export interface WallMessage {
  id: string;
  text: string;
  sender: MessageSender;
  createdAt: string;
  source?: { eventId: string; name: string };
  approvedFromBoard: boolean;
}
export interface InboxMessage extends WallMessage { state: MessageState }
export interface InboxSnapshot {
  messages: InboxMessage[];
  counts: Record<MessageState, number>;
}
export interface WallSnapshot {
  person: import('./types').Person & { bio?: string };
  messages: WallMessage[];
  count: number;
  isOwner: boolean;
  writingPolicy: 'anyone' | 'named_only' | 'nobody';
}
export interface SendWallMessage {
  /** Required event context prevents wall discovery outside joined events. */
  eventId: string;
  recipientId: string;
  text: string;
  anonymityLevel: MessageLevel;
  /** Booleans only. Hint values are derived from the authenticated account. */
  allowedHints: AllowedHints;
  screeningAcknowledged?: boolean;
}
export type ReportReason = 'harassment' | 'hate' | 'sexual' | 'identity' | 'spam';
export interface MessageApi {
  /** GET /me/inbox. Counts exclude soft-deleted messages and blocked senders. */
  getInbox(): Promise<InboxSnapshot>;
  /** GET /events/:eventId/people/:personId/wall. Both people must be joined. */
  getWall(eventId: string, personId: string): Promise<WallSnapshot>;
  /** POST /messages/screen {text}. Delivery always rechecks on the server. */
  screenMessage(text: string, context?: 'thread'): Promise<{ warning: boolean }>;
  /** POST /messages/wall. Never returns private/muted status to the sender. */
  sendWallMessage(input: SendWallMessage): Promise<{ accepted: true }>;
  /** PUT /me/inbox/:id/state {state}. All three states are reversible. */
  updateInboxMessage(id: string, state: MessageState): Promise<InboxMessage>;
  /** DELETE /me/inbox/:id. Soft delete; reported content survives. */
  deleteInboxMessage(id: string): Promise<void>;
  /** POST /messages/:id/report {reason}. Identity is only available via audited admin endpoints. */
  reportMessage(id: string, reason: ReportReason): Promise<void>;
  /** POST /messages/:id/block. Never returns the sender's identity. */
  blockMessage(id: string): Promise<void>;
}
