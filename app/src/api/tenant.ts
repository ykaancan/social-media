/**
 * API contract for organisations — decisions [D13]–[D19], plan in /TENANT_PLAN.md.
 *
 * STATUS: agreed, NOT implemented. Nothing imports this file yet, on purpose:
 * the types that REPLACE existing ones (`AccountStatus`, `Me`, `Person`,
 * `ProfileRequest`, the event types, `EventJoinResult`) are declared here under
 * the name they will have, and step T-3 moves them into `types.ts`, wires
 * `TenantApi` into `ApiClient`, and updates `HttpApi`, `MockApi` and the
 * screens in one change. Doing it now would break every screen that reads
 * `me.section` while the backend still serves the old shape.
 *
 * Backend steps T-1 and T-2 implement exactly what is written here. As with
 * `types.ts`: if the server disagrees with a comment in this file, the comment
 * is what was agreed.
 *
 * REST mapping (new and changed routes only):
 *
 *   POST /auth/register                 201 AuthResult. `me.emailConfirmed` is false and a
 *                                       confirmation link is mailed [D18]
 *   POST /auth/resend-confirmation      ALWAYS 202. Sends a new link if the signed-in account
 *                                       is unconfirmed; rate-limited
 *   GET  /confirm?token=…               server-rendered page, like /reset. Marks the email
 *                                       confirmed; a used or expired token says so
 *   PUT  /me/profile                    200 Me, status `active`. No `sectionId` any more [D15]
 *   POST /events/join {code}            200 EventJoinResult — see the new refusal reasons
 *   POST /organisations/join            200 Membership. {code, sectionId?}. Creates or
 *                                       re-submits the membership for the organisation the
 *                                       code's event belongs to [D17]
 *   GET  /organisations/{id}/sections   200 SectionSummary[]. Any active account: the
 *                                       section picker runs before a membership exists
 *   GET  /sections/{id}                 200 SectionDetail. Approved members of the section's
 *                                       organisation only; otherwise 404 [D15]
 *   PUT  /me/memberships/{organisationId}/section {sectionId}
 *                                       200 Me. [D7] one change per 30 days per organisation
 *   POST /events                        403 `event_creation_not_allowed` when the
 *                                       organisation's switch refuses this person [D16]
 *
 *   Removed: GET /sections (replaced by the per-organisation list), PUT /me/section.
 *
 * Admin page routes (called by /admin/index.html, not by the app):
 *
 *   super_admin only [D13]
 *   GET   /admin/api/organisations
 *   POST  /admin/api/organisations                 {name, approvalRequired, hasSections, eventCreation}
 *   PATCH /admin/api/organisations/{id}            {name?, approvalRequired?, eventCreation?}
 *   POST  /admin/api/organisations/{id}/admins     {email} — an existing active account;
 *                                                  creates or upgrades its membership to
 *                                                  approved + admin
 *   DELETE /admin/api/organisations/{id}/admins/{userId}   back to role `member`
 *
 *   organisation admin of {id}, or super_admin [D14]
 *   GET  /admin/api/organisations/{id}/members?status=pending
 *                                                  rows: userId, name, avatarUrl, bio, section,
 *                                                  status, submittedAt — never email or phone
 *   POST /admin/api/organisations/{id}/members/{userId}/approve   also joins the stored event [D17]
 *   POST /admin/api/organisations/{id}/members/{userId}/reject
 *
 *   Removed: POST /admin/api/users/{id}/approve and /reject (the account is no longer
 *   approved [D14]). /ban and /promote stay, super_admin only [D19].
 */

import type { SectionRef, SectionSummary } from './types';

/* ------------------------------------------------------------------ *
 * Account
 * ------------------------------------------------------------------ */

/**
 * [D14] Replaces the five-value status. Approval is no longer an account state.
 *
 * - `incomplete` — registered, profile not sent yet.
 * - `active` — profile sent. The account can use the app; which organisations
 *   it can enter is decided per membership.
 * - `banned` — platform-wide, set by a super_admin only [D19].
 */
export type AccountStatus = 'incomplete' | 'active' | 'banned';

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
 * Replaces `Me`. `section` is gone [D15]; `emailConfirmed` [D18] and
 * `memberships` [D14] are new. `memberships` lists every status, so the app can
 * show "waiting for X" and "X did not accept your request".
 */
export interface Me {
  id: string;
  email: string;
  /** [D18] False until the confirmation link is opened. The app shows only the confirm screen. */
  emailConfirmed: boolean;
  status: AccountStatus;
  role: 'member' | 'event_moderator' | 'super_admin';
  name?: string;
  bio?: string;
  avatarUrl?: string;
  memberships: Membership[];
}

/** Replaces `ProfileRequest`: the section is no longer part of the account profile [D15]. */
export interface ProfileRequest {
  name: string;
  bio?: string;
  photoUri?: string;
}

/**
 * Replaces `Person`. [D15] `section` is the person's section in the organisation
 * of the event (or section page) the list was read from, and is absent where
 * that organisation has no sections.
 */
export interface Person {
  id: string;
  name: string;
  avatarUrl?: string;
  section?: SectionRef;
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

/** Replaces `CreateEventRequest`. */
export interface CreateEventRequest {
  /** [D13] Must be an organisation whose membership has `canCreateEvents`. */
  organisationId: string;
  name: string;
  /** Required iff the organisation has sections; must be omitted otherwise. */
  scope?: 'section' | 'national';
  startsAt: string;
  endsAt: string;
  cover: 'magenta' | 'coral' | 'tangerine' | 'amber' | 'lime' | 'mint' | 'azure' | 'violet';
  boardMode: 'approve_first' | 'post_immediately';
}

/** Replaces `EventSummary`. `country` becomes optional: no sections, no country [D11]. */
export interface EventSummary extends Omit<CreateEventRequest, 'organisationId'> {
  id: string;
  organisation: OrganisationRef;
  status: 'live' | 'upcoming' | 'archived';
  section?: SectionRef;
  country?: string;
  closedAt?: string;
  memberCount: number;
  postCount: number;
}

/** Replaces `EventDetail`. Same fields; `people` uses the new `Person`. */
export interface EventDetail extends EventSummary {
  joinCode: string;
  isModerator: boolean;
  people: (Person & { bio?: string })[];
}

/**
 * Replaces `EventJoinResult`. Three new refusals, all [D17]:
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

/* ------------------------------------------------------------------ *
 * The client additions
 * ------------------------------------------------------------------ */

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
  /** PUT /me/memberships/:organisationId/section. Replaces `changeSection(sectionId)`. */
  changeSection(organisationId: string, sectionId: string): Promise<Me>;
}

/** New `ApiErrorCode` values T-3 adds to `types.ts`. */
export type TenantApiErrorCode =
  /** 403 on POST /events: the organisation's switch refuses this person [D16]. */
  | 'event_creation_not_allowed'
  /** 403 anywhere except the auth and /me routes: the email is not confirmed [D18]. */
  | 'email_unconfirmed';
