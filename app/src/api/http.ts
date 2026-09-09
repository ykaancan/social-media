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
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
  getInbox(): Promise<import('./messages').InboxSnapshot> { return this.request('/me/inbox'); }
  getWall(eventId: string, personId: string): Promise<import('./messages').WallSnapshot> {
    return this.request(`/events/${encodeURIComponent(eventId)}/people/${encodeURIComponent(personId)}/wall`);
  }
  screenMessage(text: string): Promise<{ warning: boolean }> { return this.request('/messages/screen', { method: 'POST', body: { text } }); }
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
        if (!res.ok) return null;
        const tokens = await readJson<Tokens>(res);
        if (!tokens?.accessToken) return null;
        this.tokens = tokens;
        return tokens;
      } catch {
        // A network failure during refresh is not proof the session is gone,
        // but the call that triggered it has to fail; the next call retries.
        return null;
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
