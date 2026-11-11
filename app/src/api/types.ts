import type { SettingsApi } from './settings';
import type { ThreadApi } from './threads';
import type { BoardApi } from './board';
import type { MessageApi } from './messages';
/**
 * The API contract between the app and the Spring Boot backend.
 *
 * Onboarding, organisations and Events are covered here; the other surfaces
 * extend it from `messages.ts`, `board.ts`, `threads.ts` and `settings.ts`
 * rather than inventing a second client. The types are the spec the backend
 * implements — if the server disagrees with a comment here, the comment is what
 * was agreed, so fix the server or amend both.
 *
 * The organisation types ([D13]–[D19], plan in `/TENANT_PLAN.md`) were agreed in
 * `tenant.ts` in step T-0 and moved here in step T-3.
 *
 * Two rules from CLAUDE.md shape almost every type below:
 *
 * - **[D11]** Country is never a field of its own. It is read through a
 *   section and means where the person sits in the network, not their
 *   nationality. So there is no `country` on `Me` or on `Person` — only on
 *   `SectionRef` / `SectionSummary`, and picking a section is what picks it.
 *   [D15] The section lives on a membership, not on the account.
 * - **Never fake anything** (principle 4). Counts on these types are real
 *   server counts; the client never fills a gap with a plausible number.
 */

/* ------------------------------------------------------------------ *
 * Account
 * ------------------------------------------------------------------ */

/**
 * [D14] Approval is no longer an account state.
 *
 * - `incomplete` — registered, profile not sent yet. The app shows Profile
 *   setup (after the email is confirmed [D18]) and nothing else.
 * - `active` — profile sent. The account can use the app; which organisations
 *   it can enter is decided per membership.
 * - `banned` — platform-wide, set by a super_admin only [D19]. Restricted
 *   account copy in the onboarding shell; no member routes.
 */
export type AccountStatus = 'incomplete' | 'active' | 'banned';

/**
 * Roles are stored as data, never hardcoded to a user id, so a second admin can
 * be added without a code change. `event_moderator` is per-event in the
 * backend; it appears here because the same field carries it.
 */
export type Role = 'member' | 'event_moderator' | 'super_admin';

/**
 * A section as it is embedded in another object (a membership, a person row).
 * [D11] The country rides along with the section and is never sent separately.
 */
export interface SectionRef {
  id: string;
  name: string;
  /** Where the section sits in the network — read-only in every UI. */
  country: string;
}

/** An organisation as it is embedded in a membership or an event. */
export interface OrganisationRef {
  id: string;
  name: string;
  /** [D15] False for an organisation with no sections (a bar, a club). */
  hasSections: boolean;
}

/** [D14] `pending` and `rejected` exist only where the organisation has approval on. */
export type MembershipStatus = 'pending' | 'approved' | 'rejected';

/** The signed-in user's place in one organisation. Never sent about anyone else. */
export interface Membership {
  organisation: OrganisationRef;
  status: MembershipStatus;
  /** [D14] `admin` approves members of this organisation and nothing else [D19]. */
  role: 'member' | 'admin';
  /** [D15] Present iff the organisation has sections. Carries the country [D11]. */
  section?: SectionRef;
  /** [D16] The server's answer to "may this person create an event here?". */
  canCreateEvents: boolean;
  /** [D7] ISO time the section may next be changed, or null when it may be changed now. */
  sectionChangeAvailableAt: string | null;
  /**
   * [D17] While `pending`: the name of the event the request came from, which
   * approval will join automatically. Absent otherwise.
   */
  pendingEventName?: string;
}

/**
 * The signed-in user. `name`, `bio` and `avatarUrl` are absent while the
 * account is `incomplete`. [D15] There is no account-level section; each
 * membership carries its own. [D14] `memberships` lists every status, so the
 * app can show "waiting for X" and "X did not accept your request"; it is
 * always present (empty for none).
 *
 * `email` is here because the user's own email is theirs to see. It is never
 * part of any other person's DTO.
 */
export interface Me {
  id: string;
  email: string;
  /** [D18] False until the confirmation link is opened. The app shows only the confirm screen. */
  emailConfirmed: boolean;
  status: AccountStatus;
  role: Role;
  name?: string;
  /** One line, <= 80 characters. */
  bio?: string;
  /** Absolute URL of the server-resized avatar, or absent. */
  avatarUrl?: string;
  memberships: Membership[];
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
 * [D11]. [D15] `section` is the person's section in the organisation of the
 * event (or section page) the list was read from, and is absent where that
 * organisation has no sections or their membership there is not approved.
 */
export interface Person {
  id: string;
  name: string;
  avatarUrl?: string;
  section?: SectionRef;
}

/**
 * The section page. `roster` is the page of members the server chose to send
 * (the viewer first when it is their own section); `rosterTotal` is how many
 * members that roster is drawn from, so the "and N more" line is
 * `rosterTotal - roster.length` and is never guessed.
 */
export interface SectionDetail extends SectionSummary {
  /** Server supplies an accessible shared event for wall navigation, or no link. */
  roster: (Person & {wallEventId?:string})[];
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
 * Sign-up. Phone is optional in stage 1 — a contact route, not a verification
 * step.
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
 * The profile. Sending it makes the account `active` [D14]. [D15] The section
 * is no longer part of the account profile.
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
  /** <= 80 characters. */
  bio?: string;
  /** Local `file://` URI. Omit to keep the avatar the account already has. */
  photoUri?: string;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * The closed set of failures the UI distinguishes. Anything the server says
 * that does not map to one of these is `unknown` — the UI shows a generic
 * message rather than a raw server string, which could be untranslated or leak
 * internals.
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
  /** 403 on POST /events: the organisation's switch refuses this person [D16]. */
  | 'event_creation_not_allowed'
  /** 403 anywhere except the auth and own-/me routes: the email is not confirmed [D18]. */
  | 'email_unconfirmed'
  /** 403 on member routes: the account is `incomplete` or `banned` [D14]. */
  | 'account_not_active'
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
  /** Deliberately loose: a regex does not decide whether a person is real. */
  emailPattern: /.+@.+\..+/,
} as const;

/* ------------------------------------------------------------------ *
 * The client
 * ------------------------------------------------------------------ */

/**
 * REST mapping implemented by `HttpApi` and mimicked by `MockApi`:
 *
 *   POST /auth/register        201 AuthResult (status `incomplete`, `emailConfirmed`
 *                              false); a confirmation link is mailed [D18]; 409 -> email_in_use
 *   POST /auth/resend-confirmation
 *                              ALWAYS 202. Sends a new link if the signed-in account
 *                              is unconfirmed; one per 60 seconds [D18]
 *   GET  /confirm?token=…      server-rendered page, like /reset. Marks the email
 *                              confirmed; a used or expired (24 h) token says so
 *   POST /auth/login           200 AuthResult; 401 -> invalid_credentials
 *   POST /auth/refresh         200 Tokens; spent at most once per 401, by the client
 *   POST /auth/logout          204, revokes the refresh token. Best effort: the
 *                              client signs out locally even when this fails
 *   POST /auth/forgot-password ALWAYS 202, whether or not the address exists —
 *                              the response must not let anyone probe for accounts
 *   GET  /me                   200 Me, at any status and confirmed or not. This is
 *                              what the Confirm-email screen re-reads
 *   PUT  /me/profile           200 Me, status `active`. No `sectionId` [D15]
 *   POST /me/photo             multipart field `photo`; 200 { avatarUrl }.
 *                              Avatar only, server-resized — the one image
 *                              endpoint stage 1 allows
 *   POST /events/join {code}   200 EventJoinResult, including the three
 *                              membership refusals [D17]
 *   POST /organisations/join   200 Membership. {code, sectionId?}. Creates or
 *                              re-submits the membership for the organisation the
 *                              code's event belongs to [D17]; 404 unknown code;
 *                              422 on `sectionId`
 *   GET  /organisations/{id}/sections
 *                              200 SectionSummary[]. Any active account: the
 *                              section picker runs before a membership exists
 *   GET  /sections/{id}        200 SectionDetail. Approved members of the section's
 *                              organisation only; otherwise 404 [D15]
 *   PUT  /me/memberships/{organisationId}/section {sectionId}
 *                              200 Me. [D7] one change per 30 days per organisation (429)
 *   POST /events               403 `event_creation_not_allowed` when the
 *                              organisation's switch refuses this person [D16]
 *
 *   Removed in T-3: GET /sections (replaced by the per-organisation list),
 *   PUT /me/section.
 *
 * Errors on member routes: `403 email_unconfirmed` until the email is confirmed,
 * then `403 account_not_active` while `incomplete` or `banned`.
 *
 * Validation (server-enforced, mirrored client-side — see `LIMITS`):
 * name <= 40, bio <= 80, password >= 8, email matches /.+@.+\..+/.
 */
/**
 * The client additions for organisations ([D13]–[D18]), agreed as `TenantApi` in
 * step T-0 and part of `ApiClient` since T-3.
 */
export interface TenantApi {
  /** POST /auth/resend-confirmation. Always resolves [D18]. */
  resendConfirmation(): Promise<void>;
  /** GET /organisations/:id/sections. The picker for `requestMembership`. */
  listOrganisationSections(organisationId: string): Promise<SectionSummary[]>;
  /**
   * POST /organisations/join. Returns the membership: `approved` (and the event
   * is joined) where approval is off, `pending` where it is on.
   */
  requestMembership(request: MembershipRequest): Promise<Membership>;
  /** PUT /me/memberships/:organisationId/section. Also declared on `SettingsApi`. */
  changeSection(organisationId: string, sectionId: string): Promise<Me>;
}

export interface ApiClient extends MessageApi, BoardApi, ThreadApi, SettingsApi, TenantApi {
  /** GET /events returns joined events, never discovery. */
  listMyEvents(): Promise<EventSummary[]>;
  /** POST /events. Creator joins and becomes this event's moderator. */
  createEvent(request: CreateEventRequest): Promise<EventDetail>;
  /** POST /events/join { code }. Membership of the event is idempotent. */
  joinEvent(code: string): Promise<EventJoinResult>;
  /** GET /events/:id. Membership required, including archived boards. */
  getEvent(id: string): Promise<EventDetail>;
  /** Creates an `incomplete`, unconfirmed account and signs it in. */
  register(req: RegisterRequest): Promise<AuthResult>;
  login(req: LoginRequest): Promise<AuthResult>;
  /** Best-effort server-side revoke. Never rejects for a network failure. */
  logout(): Promise<void>;
  /** Always resolves: the server answers 202 whether or not the address exists. */
  forgotPassword(email: string): Promise<void>;
  me(): Promise<Me>;
  /** Sends the profile; the returned `Me` is `active`. */
  submitProfile(req: ProfileRequest): Promise<Me>;
  getSection(id: string): Promise<SectionDetail>;
  /**
   * PUT /me/devices. Active accounts only, and an upsert by token: calling it
   * again with the same token is free, and a token that moves to another account
   * re-binds rather than notifying the person who used to hold the phone.
   */
  registerDevice(input: DeviceRegistration): Promise<void>;
  /**
   * DELETE /me/devices/:token. Sign-out, best effort — nothing waits for it, and
   * the server also drops a token the push provider reports as gone.
   */
  unregisterDevice(token: string): Promise<void>;
  /** Sets (or clears) the bearer credentials used by subsequent calls. */
  setTokens(tokens: Tokens | null): void;
  /**
   * Called when the session is gone for good — a 401 no refresh could fix. The
   * session provider signs out on it. At most one callback; the last wins.
   */
  onUnauthorized?(cb: () => void): void;
}

/* ------------------------------------------------------------------ *
 * Events and organisations
 * ------------------------------------------------------------------ */

export interface CreateEventRequest {
  /** [D13] Must be an organisation whose membership has `canCreateEvents`. */
  organisationId: string;
  name: string;
  /** Required iff the organisation has sections; must be omitted otherwise (P9). */
  scope?: 'section' | 'national';
  /** ISO timestamps. A section event takes the creator's section in that organisation. */
  startsAt: string;
  endsAt: string;
  cover: 'magenta' | 'coral' | 'tangerine' | 'amber' | 'lime' | 'mint' | 'azure' | 'violet';
  boardMode: 'approve_first' | 'post_immediately';
}

/** `country` is optional: no sections, no country [D11]. */
export interface EventSummary extends Omit<CreateEventRequest, 'organisationId'> {
  id: string;
  organisation: OrganisationRef;
  status: 'live' | 'upcoming' | 'archived';
  /** [D11] Present only for a section-scoped event. */
  section?: SectionRef;
  /** [D11] Present only when the event has a section; it is read off it. */
  country?: string;
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

/**
 * Three membership refusals, all [D17]:
 *
 * - `membership_required` — the code is valid, the person is not in the event's
 *   organisation, and that organisation needs a section pick, an approval, or
 *   both before they can enter. The app shows the join sheet and then calls
 *   `requestMembership`. (An organisation that needs neither never answers
 *   this: the membership is created and the event joined in this same call.)
 * - `membership_pending` — already asked, still waiting.
 * - `membership_rejected` — the organisation's admin said no. The person may
 *   ask again with `requestMembership`.
 */
export type EventJoinResult =
  | { ok: true; event: EventDetail }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'already_joined'; eventName: string }
  | {
      ok: false;
      reason: 'membership_required' | 'membership_pending' | 'membership_rejected';
      organisation: OrganisationRef;
      approvalRequired: boolean;
      eventName: string;
    };

/** POST /organisations/join. */
export interface MembershipRequest {
  /** The event join code the person entered. It names the organisation and the event. */
  code: string;
  /** Required iff the organisation has sections. */
  sectionId?: string;
}

/**
 * One phone this account wants notifications on. `locale` is the app's current
 * language and decides which of the two languages the server writes the push copy
 * in — nothing about a notification is rendered in the app.
 */
export interface DeviceRegistration {
  /** The Expo push token. Opaque; the app never parses it. */
  token: string;
  platform: 'ios' | 'android' | 'web';
  locale: 'en' | 'tr';
}
