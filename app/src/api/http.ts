import type { AccountSettings, BlockedEntry } from './settings';
import type { OpenThreadRequest, ThreadDetail, ThreadsSnapshot } from './threads';
import { Client } from '@stomp/stompjs';
import { Platform } from 'react-native';
import type { BoardSnapshot, SendBoardPost, RejectionReceipt } from './board';
import type { ReportReason } from './messages';
import {
  type CreateEventRequest, type EventSummary, type EventDetail, type EventJoinResult,
  ApiError,
  type ApiClient,
  type AuthResult,
  type LoginRequest,
  type Me,
  type ProfileRequest,
  type RegisterRequest,
  type SectionDetail,
  type SectionSummary,
  type Tokens,
} from './types';

/** What the server sends in an error body. Every field is optional on purpose. */
interface ErrorBody {
  code?: string;
  message?: string;
  field?: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /**
   * Auth endpoints answer 401 with "wrong password", not "session expired", so
   * they must never trigger a refresh or a sign-out.
   */
  auth?: boolean;
  /** Set once a refresh has already been spent on this call. */
  retried?: boolean;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * The real client. Small on purpose: one request helper, one refresh, no retry
 * queue, no interceptor stack. Everything it knows about the backend is in
 * `types.ts`.
 */
export class HttpApi implements ApiClient {
  openThread(body:OpenThreadRequest):Promise<{id:string}>{return this.request('/threads',{method:'POST',body});}
  getThreads():Promise<ThreadsSnapshot>{return this.request('/me/threads');}
  getThread(id:string):Promise<ThreadDetail>{return this.request('/threads/'+encodeURIComponent(id));}
  sendThreadMessage(id:string,body:{text:string;requestId:string;screeningAcknowledged?:boolean}):Promise<void>{return this.request('/threads/'+encodeURIComponent(id)+'/messages',{method:'POST',body});}
  markThreadRead(id:string,throughMessageId:string):Promise<void>{return this.request('/threads/'+encodeURIComponent(id)+'/read',{method:'PUT',body:{throughMessageId}});}
  revealInThread(id:string):Promise<void>{return this.request('/threads/'+encodeURIComponent(id)+'/reveal',{method:'POST'});}
  reportThread(id:string,reason:ReportReason):Promise<void>{return this.request('/threads/'+encodeURIComponent(id)+'/report',{method:'POST',body:{reason}});}
  blockThread(id:string,messageId:string):Promise<void>{return this.request('/threads/'+encodeURIComponent(id)+'/block',{method:'POST',body:{messageId}});}
  subscribeThreads(onChange:()=>void):()=>void {
    let active=true;const notify=()=>{if(active)onChange();};
    const client=new Client({brokerURL:this.baseUrl.replace(/^http/,'ws').replace(/\/+$/,'')+'/ws',
      reconnectDelay:5000,connectionTimeout:10000,heartbeatIncoming:10000,heartbeatOutgoing:10000,
      forceBinaryWSFrames:Platform.OS!=='web',appendMissingNULLonIncoming:Platform.OS!=='web',
      beforeConnect:()=>{client.connectHeaders=this.tokens?{Authorization:'Bearer '+this.tokens.accessToken}:{};},
      onConnect:()=>{client.subscribe('/user/queue/threads',notify);notify();}});
    client.activate();return()=>{active=false;void client.deactivate();};
  }

  private boardPath(id: string) { return '/events/' + encodeURIComponent(id); }
  getBoard(id: string): Promise<BoardSnapshot> { return this.request(this.boardPath(id) + '/board'); }
  sendBoardPost(input: SendBoardPost): Promise<{accepted:true}> { return this.request(this.boardPath(input.eventId) + '/posts',{method:'POST',body:input}); }
  reactToPost(eventId: string,id: string,emoji: string|null): Promise<void> { return this.request(this.boardPath(eventId) + '/posts/' + encodeURIComponent(id) + '/reaction',{method:'PUT',body:{emoji}}); }
  approvePosts(eventId: string,ids: string[]): Promise<void> { return this.request(this.boardPath(eventId) + '/moderation/approve',{method:'POST',body:{ids}}); }
  rejectPost(eventId: string,id: string): Promise<RejectionReceipt> { return this.request(this.boardPath(eventId) + '/posts/' + encodeURIComponent(id) + '/reject',{method:'POST'}); }
  undoRejection(eventId: string,undoToken: string): Promise<void> { return this.request(this.boardPath(eventId) + '/moderation/undo',{method:'POST',body:{undoToken}}); }
  hidePost(eventId: string,id: string): Promise<void> { return this.request(this.boardPath(eventId) + '/posts/' + encodeURIComponent(id) + '/hide',{method:'POST'}); }
  reportPost(eventId: string,id: string,reason: ReportReason): Promise<void> { return this.request(this.boardPath(eventId) + '/posts/' + encodeURIComponent(id) + '/report',{method:'POST',body:{reason}}); }
  updateBoardControls(eventId: string,changes: {boardMode?:'approve_first'|'post_immediately';endsAt?:string}): Promise<void> { return this.request(this.boardPath(eventId) + '/controls',{method:'PUT',body:changes}); }
  closeBoard(eventId: string): Promise<void> { return this.request(this.boardPath(eventId) + '/close',{method:'POST'}); }
  setModerator(eventId: string,personId: string,enabled: boolean): Promise<void> { return this.request(this.boardPath(eventId) + '/moderators/' + encodeURIComponent(personId),{method:enabled?'PUT':'DELETE'}); }
  subscribeBoard(eventId: string,onChange: () => void): () => void {
    let active=true;
    const notify=()=>{if(active) onChange();};
    const client = new Client({brokerURL:this.baseUrl.replace(/^http/,'ws').replace(/\/+$/,'') + '/ws',
      reconnectDelay:5000, connectionTimeout:10000, heartbeatIncoming:10000, heartbeatOutgoing:10000,
      forceBinaryWSFrames:Platform.OS !== 'web', appendMissingNULLonIncoming:Platform.OS !== 'web',
      beforeConnect:()=>{ client.connectHeaders=this.tokens?{Authorization:'Bearer '+this.tokens.accessToken}:{}; },
      onConnect:()=>{ client.subscribe('/topic/events/'+encodeURIComponent(eventId)+'/board',notify);
        client.subscribe('/user/queue/events/'+encodeURIComponent(eventId),notify); notify(); },
    });
    client.activate();
    return ()=>{active=false; void client.deactivate();};
  }

  getInbox(): Promise<import('./messages').InboxSnapshot> { return this.request('/me/inbox'); }
  getWall(eventId: string, personId: string): Promise<import('./messages').WallSnapshot> {
    return this.request(`/events/${encodeURIComponent(eventId)}/people/${encodeURIComponent(personId)}/wall`);
  }
  screenMessage(text: string, context?: 'thread'): Promise<{ warning: boolean }> { return this.request('/messages/screen', { method: 'POST', body: { text, ...(context ? {context} : {}) } }); }
  sendWallMessage(body: import('./messages').SendWallMessage): Promise<{ accepted: true }> { return this.request('/messages/wall', { method: 'POST', body }); }
  updateInboxMessage(id: string, state: import('./messages').MessageState): Promise<import('./messages').InboxMessage> {
    return this.request(`/me/inbox/${encodeURIComponent(id)}/state`, { method: 'PUT', body: { state } });
  }
  deleteInboxMessage(id: string): Promise<void> { return this.request(`/me/inbox/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  reportMessage(id: string, reason: import('./messages').ReportReason): Promise<void> {
    return this.request(`/messages/${encodeURIComponent(id)}/report`, { method: 'POST', body: { reason } });
  }
  blockMessage(id: string): Promise<void> { return this.request(`/messages/${encodeURIComponent(id)}/block`, { method: 'POST' }); }
  listMyEvents(): Promise<EventSummary[]> { return this.request('/events'); }
  createEvent(body: CreateEventRequest): Promise<EventDetail> {
    return this.request('/events', { method: 'POST', body });
  }
  joinEvent(code: string): Promise<EventJoinResult> {
    return this.request('/events/join', { method: 'POST', body: { code } });
  }
  getEvent(id: string): Promise<EventDetail> {
    return this.request(`/events/${encodeURIComponent(id)}`);
  }
  private readonly baseUrl: string;
  private tokens: Tokens | null = null;
  private unauthorized: (() => void) | undefined;
  /** In-flight refresh, so two parallel 401s spend one refresh token. */
  private refreshing: Promise<Tokens | null> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setTokens(tokens: Tokens | null): void {
    this.tokens = tokens;
  }

  onUnauthorized(cb: () => void): void {
    this.unauthorized = cb;
  }

  /* ---------------- auth ---------------- */

  register(req: RegisterRequest): Promise<AuthResult> {
    return this.request<AuthResult>('/auth/register', { method: 'POST', body: req, auth: true });
  }

  login(req: LoginRequest): Promise<AuthResult> {
    return this.request<AuthResult>('/auth/login', { method: 'POST', body: req, auth: true });
  }

  async logout(): Promise<void> {
    try {
      await this.request<void>('/auth/logout', { method: 'POST', auth: true });
    } catch {
      // Best effort. The session is cleared locally either way; a token the
      // server could not revoke expires on its own.
    }
  }

  async forgotPassword(email: string): Promise<void> {
    await this.request<void>('/auth/forgot-password', { method: 'POST', body: { email }, auth: true });
  }

  getSettings():Promise<AccountSettings>{return this.request('/me/settings');}
  updateSettings(input:Partial<Pick<AccountSettings,'writingPolicy'|'mutedWords'|'notifications'>>):Promise<AccountSettings>{return this.request('/me/settings',{method:'PATCH',body:input});}
  getBlocked():Promise<BlockedEntry[]>{return this.request('/me/blocks');}
  unblock(id:string):Promise<void>{return this.request('/me/blocks/'+encodeURIComponent(id),{method:'DELETE'});}
  async editProfile(input:Omit<ProfileRequest,'sectionId'>):Promise<Me>{const {photoUri,...body}=input;if(photoUri)await this.uploadPhoto(photoUri);return this.request('/me/profile',{method:'PATCH',body});}
  changeSection(sectionId:string):Promise<Me>{return this.request('/me/section',{method:'PUT',body:{sectionId}});}
  exportAccount():Promise<Record<string,unknown>>{return this.request('/me/export');}
  deleteAccount():Promise<void>{return this.request('/me',{method:'DELETE'});}

  /* ---------------- me ---------------- */

  me(): Promise<Me> {
    return this.request<Me>('/me');
  }

  /**
   * Uploads the photo first (multipart, avatar only) so that `PUT /me/profile`
   * only ever carries JSON. If the upload fails the profile is not sent — the
   * person retries the whole step rather than landing in the queue without the
   * picture they chose.
   */
  async submitProfile(req: ProfileRequest): Promise<Me> {
    const { photoUri, ...profile } = req;
    if (photoUri) await this.uploadPhoto(photoUri);
    return this.request<Me>('/me/profile', { method: 'PUT', body: profile });
  }

  private async uploadPhoto(uri: string): Promise<void> {
    const form = new FormData();
    // React Native's FormData takes this {uri,name,type} shape; the DOM lib
    // types only know Blob, hence the cast.
    form.append('photo', {
      uri,
      name: 'avatar.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    await this.request<{ avatarUrl: string }>('/me/photo', { method: 'POST', body: form });
  }

  /* ---------------- sections ---------------- */

  listSections(): Promise<SectionSummary[]> {
    return this.request<SectionSummary[]>('/sections');
  }

  getSection(id: string): Promise<SectionDetail> {
    return this.request<SectionDetail>(`/sections/${encodeURIComponent(id)}`);
  }

  /* ---------------- plumbing ---------------- */

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, auth = false, retried = false } = options;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (this.tokens) headers.Authorization = `Bearer ${this.tokens.accessToken}`;

    let res: Response;
    try {
      res = await fetch(joinUrl(this.baseUrl, path), {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      });
    } catch (err) {
      // fetch only rejects when the request never completed.
      throw new ApiError('network', err instanceof Error ? err.message : 'network request failed');
    }

    if (res.ok) return (await readJson<T>(res)) as T;

    if (res.status === 401 && !auth) {
      if (!retried && (await this.refresh())) {
        return this.request<T>(path, { ...options, retried: true });
      }
      this.tokens = null;
      this.unauthorized?.();
      throw new ApiError('unauthorized', 'session expired', 401);
    }

    throw await toApiError(res, auth);
  }

  /** One refresh at a time. Returns the new tokens, or null when the session is gone. */
  private refresh(): Promise<Tokens | null> {
    const refreshToken = this.tokens?.refreshToken;
    if (!refreshToken) return Promise.resolve(null);

    this.refreshing ??= (async () => {
      try {
        const res = await fetch(joinUrl(this.baseUrl, '/auth/refresh'), {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (res.status===401||res.status===403) return null;
        if (!res.ok) throw new ApiError('network','refresh temporarily unavailable',res.status);
        const tokens = await readJson<Tokens>(res);
        if (!tokens?.accessToken) throw new ApiError('unknown','invalid refresh response');
        this.tokens = tokens;
        return tokens;
      } catch (error) {
        // Transient failures preserve credentials so the next request can retry.
        throw error instanceof ApiError?error:new ApiError('network','refresh unavailable');
      } finally {
        this.refreshing = null;
      }
    })();

    return this.refreshing;
  }
}

async function readJson<T>(res: Response): Promise<T | undefined> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('unknown', 'malformed response body', res.status);
  }
}

/** Maps a non-2xx response onto the closed `ApiErrorCode` set. */
async function toApiError(res: Response, auth: boolean): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = ((await readJson<ErrorBody>(res)) ?? {}) as ErrorBody;
  } catch {
    // A body we cannot read never changes the status-derived code below.
  }
  const message = body.message;

  if (res.status === 409) return new ApiError('email_in_use', message, 409, body.field);
  if (res.status === 422) return new ApiError('validation', message, 422, body.field);
  if (res.status === 401) {
    // Only reachable for `auth` endpoints; elsewhere `request` handled 401.
    return new ApiError(auth ? 'invalid_credentials' : 'unauthorized', message, 401, body.field);
  }
  return new ApiError('unknown', message, res.status, body.field);
}
