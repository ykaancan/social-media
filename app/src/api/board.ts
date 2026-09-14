import type { EventDetail, Person } from './types';
import type { MessageSender, ReportReason, SendWallMessage } from './messages';

export type BoardState = 'pending' | 'approved' | 'rejected';
export interface BoardPost {
  id: string;
  text: string;
  sender: MessageSender;
  createdAt: string;
  state: BoardState;
  mine: boolean;
  reactions: Record<string, number>;
  myReaction?: string;
  recipient?: Person;
  rejectionReason?: 'moderator' | 'board_closed';
}
export interface BoardSnapshot {
  event: EventDetail;
  posts: BoardPost[];
  ownUnpublished: BoardPost[];
  /** Room posts only; empty for non-moderators. No sender IDs in any list. */
  queue: BoardPost[];
  pendingCount: number;
  reviewed: BoardPost[];
  creator?: Person;
  moderators: Person[];
  canManageModerators: boolean;
}
export type SendBoardPost = Omit<SendWallMessage, 'recipientId'> & { recipientId?: string };
export interface RejectionReceipt { undoToken: string; undoUntil: string }
/** Mutations are REST; STOMP carries invalidations only, never private content.
 * GET /events/:id/board; POST /events/:id/posts; PUT /events/:id/posts/:post/reaction
 * POST /events/:id/moderation/approve {ids}; POST .../posts/:post/reject
 * POST /events/:id/moderation/undo {undoToken}; POST .../posts/:post/hide or report
 * PUT /events/:id/controls {boardMode?,endsAt?}; POST /events/:id/close
 * PUT/DELETE /events/:id/moderators/:person
 */
export interface BoardApi {
  getBoard(id: string): Promise<BoardSnapshot>;
  sendBoardPost(input: SendBoardPost): Promise<{ accepted: true }>;
  reactToPost(eventId: string, postId: string, emoji: string | null): Promise<void>;
  approvePosts(eventId: string, ids: string[]): Promise<void>;
  rejectPost(eventId: string, id: string): Promise<RejectionReceipt>;
  undoRejection(eventId: string, token: string): Promise<void>;
  hidePost(eventId: string, id: string): Promise<void>;
  reportPost(eventId: string, id: string, reason: ReportReason): Promise<void>;
  updateBoardControls(eventId: string, changes: { boardMode?: 'approve_first' | 'post_immediately'; endsAt?: string }): Promise<void>;
  closeBoard(eventId: string): Promise<void>;
  setModerator(eventId: string, personId: string, enabled: boolean): Promise<void>;
  subscribeBoard(eventId: string, onChange: () => void): () => void;
}
