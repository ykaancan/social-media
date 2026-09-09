/**
 * The API contract between the app and the future Spring Boot backend.
 *
 * Onboarding and Events are covered here; later frontend waves
 * extend this file rather than inventing a second client. The types are the
 * spec the backend implements — if the server disagrees with a comment here,
 * the comment is what was agreed, so fix the server or amend both.
 *
 * Two rules from CLAUDE.md shape almost every type below:
 *
 * - **[D11]** Country is never a field of its own. It is read through the
 *   user's section and means where the person sits in the network, not their
 *   nationality. So there is no `country` on `Me` or on `Person` — only on
 *   `SectionRef` / `SectionSummary`, and picking a section is what picks it.
 * - **Never fake anything** (principle 4). Counts on these types are real
 *   server counts; the client never fills a gap with a plausible number.
 */

/* ------------------------------------------------------------------ *
 * Account
 * ------------------------------------------------------------------ */

/**
 * Where an account sits in the approval flow.
 *
 * - `incomplete` — registered (email + password accepted, tokens issued) but
 *   the profile has not been sent yet. The app shows Profile setup and nothing
 *   else. This state never appears in the admin queue.
 * - `pending` — profile sent, waiting for a super_admin. The account cannot use
 *   the app yet [D7]: there is no approved-but-read-only state.
 * - `approved` — full member.
 * - `rejected` — an admin turned the profile down. The person may edit and
 *   resubmit, which returns them to `pending` (see `PUT /me/profile`).
 * - `banned` — an admin banned the account. Stage 1 has no designed screen for
 *   this; the app currently routes it to the Pending screen (RootNavigator TODO).
 */
export type AccountStatus = 'incomplete' | 'pending' | 'approved' | 'rejected' | 'banned';

/**
 * Roles are stored as data, never hardcoded to a user id, so a second admin can
 * be added without a code change. `event_moderator` is per-event in the
 * backend; it appears here because the same field carries it.
 */
export type Role = 'member' | 'event_moderator' | 'super_admin';

/**
 * A section as it is embedded in another object (a user, a person row).
 * [D11] The country rides along with the section and is never sent separately.
 */
export interface SectionRef {
  id: string;
  name: string;
  /** Where the section sits in the network — read-only in every UI. */
  country: string;
}

/**
 * The signed-in user. `name`, `bio`, `avatarUrl` and `section` are absent while
 * the account is `incomplete`; from `pending` onward `name` and `section` are
 * always present, because `PUT /me/profile` requires them.
 *
 * `email` is here because the user's own email is theirs to see. It is never
 * part of any other person's DTO.
 */
export interface Me {
  id: string;
  email: string;
  status: AccountStatus;
  role: Role;
  name?: string;
  /** One line, <= 80 characters. */
  bio?: string;
  /** Absolute URL of the server-resized avatar, or absent. */
  avatarUrl?: string;
  /** [D11] Carries the country. Absent only while `incomplete`. */
  section?: SectionRef;
}

/* ------------------------------------------------------------------ *
 * Sections and people
 * ------------------------------------------------------------------ */

/**
 * A section in the picker and in a roster header. Sections are membership tags,
 * not tenants: they have no administrative power.
 */
export interface SectionSummary {
  id: string;
  name: string;
  country: string;
  /** Real member count. The section page renders it verbatim. */
  memberCount: number;
}

/**
 * Another member, as any signed-in user may see them. Deliberately minimal: no
 * email, no status, no role — and no `country`, which is read off `section`
 * [D11].
 */
export interface Person {
  id: string;
  name: string;
  avatarUrl?: string;
  section: SectionRef;
}

/**
 * The section page. `roster` is the page of members the server chose to send
 * (the viewer first when it is their own section); `rosterTotal` is how many
 * members that roster is drawn from, so the "and N more" line is
 * `rosterTotal - roster.length` and is never guessed.
 */
export interface SectionDetail extends SectionSummary {
  roster: Person[];
  rosterTotal: number;
}

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

/**
 * Bearer credentials. The access token goes on every request; the refresh token
 * is spent at most once per 401, by the client, without user interaction. Both
 * live in the device keychain (`src/session/storage.ts`).
 */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** What register and login return: credentials plus the account they belong to. */
export interface AuthResult {
  tokens: Tokens;
  me: Me;
}

/**
 * Sign-up. Phone is optional in stage 1 — the admin approves by name and photo,
 * so a phone number is a contact route, not a verification step.
 */
export interface RegisterRequest {
  email: string;
  password: string;
  phone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * The profile the admin reviews. Sending it moves the account to `pending`.
 *
 * `photoUri` is a LOCAL file URI from expo-image-picker, not a URL. `HttpApi`
 * uploads it as multipart to `POST /me/photo` first and then sends the profile,
 * so the server never receives a file URI it cannot resolve.
 *
 * That avatar upload is the ONE image endpoint stage 1 allows. "Text only in
 * stage 1. No image or file upload endpoints" is about content — posts,
 * messages, threads — and stays absolute. Do not add a second one.
 */
export interface ProfileRequest {
  /** <= 40 characters, required. */
  name: string;
  /** [D11] Picking this picks the country too; the country row is read-only. */
  sectionId: string;
  /** <= 80 characters. */
  bio?: string;
  /** Local `file://` URI. Omit to keep the avatar the account already has. */
  photoUri?: string;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * The closed set of failures the onboarding UI distinguishes. Anything the
 * server says that does not map to one of these is `unknown` — the UI shows a
 * generic message rather than a raw server string, which could be untranslated
 * or leak internals.
 */
export type ApiErrorCode =
  /** 409 on register: that email already has an account. */
  | 'email_in_use'
  /** 401 on login: wrong email or password (never says which). */
  | 'invalid_credentials'
  /** fetch itself failed — offline, DNS, TLS. Nothing was delivered. */
  | 'network'
  /** 401 elsewhere: the session is gone. The client signs out. */
  | 'unauthorized'
  /** 422: a field the client should have caught. See `field`. */
  | 'validation'
  | 'unknown';

/**
 * Every rejection from an `ApiClient` is an `ApiError`. Callers switch on
 * `code`; `status` and `field` are for logs and for pointing at an input.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  /** The offending field on a `validation` error, when the server names one. */
  readonly field?: string;

  constructor(code: ApiErrorCode, message?: string, status?: number, field?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.field = field;
    // `extends Error` loses the prototype under some transpile targets; this
    // keeps `instanceof ApiError` honest on Hermes and in jest.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/** Narrowing helper — `instanceof` plus the code check in one call. */
export function isApiError(err: unknown, code?: ApiErrorCode): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}

/* ------------------------------------------------------------------ *
 * Validation limits
 * ------------------------------------------------------------------ */

/**
 * Server-enforced, mirrored client-side so the person is told before they send.
 * The client never relaxes these; the server never trusts them.
 */
export const LIMITS = {
  nameMax: 40,
  bioMax: 80,
  passwordMin: 8,
  /** Deliberately loose: the admin, not a regex, decides whether a person is real. */
  emailPattern: /.+@.+\..+/,
} as const;

/* ------------------------------------------------------------------ *
 * The client
 * ------------------------------------------------------------------ */

/**
 * REST mapping implemented by `HttpApi` and mimicked by `MockApi`:
 *
 *   POST /auth/register        201 AuthResult (status `incomplete`); 409 -> email_in_use
 *   POST /auth/login           200 AuthResult; 401 -> invalid_credentials
 *   POST /auth/refresh         200 Tokens; spent at most once per 401, by the client
 *   POST /auth/logout          204, revokes the refresh token. Best effort: the
 *                              client signs out locally even when this fails
 *   POST /auth/forgot-password ALWAYS 202, whether or not the address exists —
 *                              the response must not let anyone probe for accounts
 *   GET  /me                   200 Me. This is what the Pending screen polls
 *   PUT  /me/profile           200 Me; sets status to `pending`. A `rejected`
 *                              account resubmitting also returns to `pending`
 *   POST /me/photo             multipart field `photo`; 200 { avatarUrl }.
 *                              Avatar only, server-resized — the one image
 *                              endpoint stage 1 allows
 *   GET  /sections             200 SectionSummary[] — every member may read all
 *                              sections (hints and event people need them)
 *   GET  /sections/{id}        200 SectionDetail
 *
 * Validation (server-enforced, mirrored client-side — see `LIMITS`):
 * name <= 40, bio <= 80, password >= 8, email matches /.+@.+\..+/.
 */
export interface ApiClient extends MessageApi {
  /** Approved members only. GET /events returns joined events, never discovery. */
  listMyEvents(): Promise<EventSummary[]>;
  /** POST /events. Creator joins and becomes this event's moderator. */
  createEvent(request: CreateEventRequest): Promise<EventDetail>;
  /** POST /events/join { code }. Membership is idempotent. */
  joinEvent(code: string): Promise<EventJoinResult>;
  /** GET /events/:id. Membership required, including archived boards. */
  getEvent(id: string): Promise<EventDetail>;
  /** Creates an `incomplete` account and signs it in. */
  register(req: RegisterRequest): Promise<AuthResult>;
  login(req: LoginRequest): Promise<AuthResult>;
  /** Best-effort server-side revoke. Never rejects for a network failure. */
  logout(): Promise<void>;
  /** Always resolves: the server answers 202 whether or not the address exists. */
  forgotPassword(email: string): Promise<void>;
  me(): Promise<Me>;
  /** Sends the profile for review; the returned `Me` is `pending`. */
  submitProfile(req: ProfileRequest): Promise<Me>;
  listSections(): Promise<SectionSummary[]>;
  getSection(id: string): Promise<SectionDetail>;
  /** Sets (or clears) the bearer credentials used by subsequent calls. */
  setTokens(tokens: Tokens | null): void;
  /**
   * Called when the session is gone for good — a 401 no refresh could fix. The
   * session provider signs out on it. At most one callback; the last wins.
   */
  onUnauthorized?(cb: () => void): void;
}

export interface CreateEventRequest {
  name: string;
  scope: 'section' | 'national';
  /** ISO timestamps. Scope's section/country is derived from the creator. */
  startsAt: string;
  endsAt: string;
  cover: 'magenta' | 'coral' | 'tangerine' | 'amber' | 'lime' | 'mint' | 'azure' | 'violet';
  boardMode: 'approve_first' | 'post_immediately';
}

export interface EventSummary extends CreateEventRequest {
  id: string;
  status: 'live' | 'upcoming' | 'archived';
  section?: SectionRef;
  country: string;
  closedAt?: string;
  memberCount: number;
  postCount: number;
}

export interface EventDetail extends EventSummary {
  joinCode: string;
  isModerator: boolean;
  /** Complete joined roster for Stage 1. No sender identities or private fields. */
  people: (Person & { bio?: string })[];
}

export type EventJoinResult =
  | { ok: true; event: EventDetail }
  | { ok: false; reason: 'not_found' | 'already_joined'; eventName?: string };

import type { MessageApi } from './messages';
