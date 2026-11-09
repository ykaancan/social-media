# Tenant plan — organisations own events, approval is per organisation

Status: **step T-0 done 2026-11-09 (contract and decisions written); waiting for "go" on step T-1**. No backend, schema or screen code is built.
Written 2026-11-09 from a read of `V1__schema.sql`, `V2__reference_data.sql`,
`ApprovedMemberFilter`, `EventService`, `EventAccess`, `ProfileService`,
`SectionService`, `SharedEventLookup` and `RootNavigator.tsx`.

## 1. What the code does today (verified in the files above)

| Topic | Today |
|---|---|
| Approval | `app_user.status` is `incomplete / pending / approved / rejected / banned`. `ApprovedMemberFilter` returns `403 approval_required` on every member route unless the account is `approved`. One super admin approves every account. |
| Section | `app_user.section_id`. Profile setup requires a section. One country (`TR`) and 26 ESN sections are seeded. |
| Events | Any approved account can create an event. The event takes the creator's section (`event.section_id`, not null). People join with the 6-character code. |
| Hints | Every content row stores `sender_section_id`, the sender's section at send time. The `section` and `country` hints are read from it. |
| Walls | A wall is reached through an event both people are in (`SharedEventLookup`, `inbox_message.event_id`). |
| Section roster | `/sections` lists every section to any signed-in account. |
| Email | The address is **not confirmed**. There is no confirmation code or link at sign-up. |
| Phone | `app_user.phone` is an optional text field, not verified. |

## 2. Decisions already taken (2026-11-09, Kaan)

- Organisations (tenants) own events. We create each organisation ourselves when onboarding a client.
- Approval is switched on or off per organisation and applies to the membership, not the account.
- Email is enough to sign up. SMS verification is optional and gives a verified badge (not part of this plan).
- Keyword screening stays. No model screening.

## 3. Proposed model

### New tables (migration `V4`)

`organisation`
- `id`, `name`, `approval_required` (boolean), `has_sections` (boolean), `created_at`, `created_by`

`organisation_member`
- `organisation_id`, `user_id` (primary key together)
- `status`: `pending / approved / rejected`
- `role`: `member / admin`
- `section_id` (nullable; required when the organisation has sections) — see decision Q1
- `submitted_at`, `approved_at`, `approved_by`

### Changed tables

- `section` gets `organisation_id` (not null).
- `event` gets `organisation_id` (not null). `event.section_id` becomes nullable, because a bar has no sections.
- `app_user.status` keeps `incomplete` and `banned`; `pending / approved / rejected` are replaced by one value `active`. Ban stays platform-wide and stays with the super admin.
- `section_change` gets `organisation_id`, so the 30-day limit [D7] is counted per organisation.
- `audit_log.action` gets `create_organisation`, `assign_organisation_admin`, `approve_member`, `reject_member`.

### Existing rows (the same migration)

- One organisation "ESN Türkiye" is created with `approval_required = true`, `has_sections = true`.
- All 26 sections and all existing events are attached to it.
- Every existing account with a section gets a membership in it: status copied from the account status, section copied from the account.
- Account status `pending / approved / rejected` → `active`.
- Per my September notes the app has never been deployed, so this only touches development databases. Not re-checked today.

### Rules

1. **Signing up.** Sign up → name, photo, bio → the app opens. No section is asked, nobody waits.
2. **Entering an organisation.** There is no organisation search. A person enters an organisation by using an event join code that belongs to it.
   - Approval off: the membership is created `approved` and the person joins the event in the same request.
   - Approval on: the person picks a section (if the organisation has sections), the membership is created `pending`, and the event is **not** joined yet. After the organisation's admin approves, the person enters the code again (or the pending request remembers the event — small choice, see Q6).
3. **Access check.** `ApprovedMemberFilter` changes to: account must be `active`. The membership check moves to event join. Every board, wall and people route already requires event membership (`EventAccess.requireMember`), so nothing else needs a second check.
4. **Hints.** `sender_section_id` is taken from the sender's membership in the event's organisation. In an organisation without sections, the `section` and `country` hints are not offered; `first letter` is.
5. **Sections.** The section list of an organisation is readable by any active account, because the picker runs before a membership exists (today `/sections` is already readable by any signed-in account). A section's roster is readable only by approved members of that organisation.
6. **Admin page.** Super admin: create organisation, set `approval_required`, assign admins. Organisation admin: the same page shows only their organisation's pending members, with approve / reject.

### Not changed

Inbox, wall states, threads, reveal, block, muted words, keyword screening, push outbox, account deletion and export logic keep their rules. Deletion and export only gain the new membership rows.

## 4. Contract rules in `CLAUDE.md` this amends

| Rule | Change |
|---|---|
| §3 Graph `Country → Section → User` | `Organisation → (Country → Section) → Membership → User`; sections are optional per organisation |
| §3 Onboarding "Account is pending until approved by an admin" | Pending is a membership state, only in organisations with approval on |
| [D7] "`pending` means the account cannot use the app yet" | "…cannot enter that organisation yet" |
| [D11] country is read through the user's section | …through the membership's section |
| §3 Roles: `super_admin` "the only role that approves registrations" | Organisation admins approve their own members; super admin keeps reports, identity views and bans |
| §4.1 Onboarding screens | Section picker and Pending state move from sign-up to the first join of an approval organisation |
| §6 "No section administration of any kind" | Unchanged: an organisation admin is not a section admin |

These become new decisions D13 onward in `DECISIONS.md`, written before any code.

## 5. Decisions Q1–Q6 (decided 2026-11-09, Kaan accepted the recommendations)

- **Q1 Section lives on the membership**, not on the account. A section belongs to one organisation, so a person in two organisations with sections has two. `app_user.section_id` is no longer read. Cost: `section` appears in 45 backend files and 50 app files; most are display code that keeps working, but `AppUser.section`, profile setup, settings and the hint snapshot all change.
- **Q2 Event creation is a per-organisation switch**: organisation admins only, or any approved member. Stored on `organisation` as `event_creation` (`admins` | `members`). "ESN Türkiye" is migrated as `members`, which is today's behaviour.
- **Q3 Reports stay with the super admin only**, because a report shows the sender's identity. Organisation admins approve and reject their own members and nothing else.
- **Q4 Email is confirmed at sign-up with a confirmation link.** An account whose email is not confirmed cannot enter the app. Checked in T-0: the backend already has `spring-boot-starter-mail` and `MailResetLinkSender`, which sends by SMTP when `BRAND_MAIL_ENABLED=true` and writes the link to the log when it is false (the default). The confirmation link uses the same path. SMTP credentials are not configured anywhere yet.
- **Q5 The profile's "section · country" line.** Inside an event, it shows the section from the person's membership in that event's organisation. On your own Profile tab, it shows only if you have exactly one membership with a section.
- **Q6 After approval the person is joined automatically** to the event their request came from. The pending membership stores that event id.

## 6. Steps (one per session, each waits for "go")

| Step | Content | Agents (Opus), file ownership |
|---|---|---|
| T-0 | Lead only: write D13+ into `DECISIONS.md` and `CLAUDE.md`, update the API contract in `app/src/api/types.ts`, list the acceptance tests | none |
| T-1 | Backend: `V4` migration, organisation + membership entities, account status change, filter change, admin API for organisations and member approval | A: `user`, `security`, `auth` · B: new `organisation` package, `admin` |
| T-2 | Backend: events, join flow, sections, hint snapshot, settings section change, export and deletion | A: `event`, `section` · B: `content`, `settings`, `user` export/deletion, `board`/`message`/`thread` call sites |
| T-3 | App: mock API, sign-up without section, join flow with section pick and pending state, settings, strings in `en.json` and `tr.json`, gallery | A: `api`, `session`, onboarding · B: events, settings, components |
| T-4 | Admin page: organisations, organisation-admin queue | one agent, `admin/index.html` |

After each step the lead reads the diff, runs the backend and app test suites, and records what was not done.

## 7. API contract

The contract is [`app/src/api/tenant.ts`](app/src/api/tenant.ts): the route list is in its header comment, the types below it. Nothing imports it yet. The types that replace existing ones (`Me`, `Person`, `AccountStatus`, the event types) are declared there and move into `types.ts` in T-3, together with the mock, the HTTP client and the screens, so the app keeps compiling against the current backend until then.

## 8. Details the lead filled in — approved by Kaan 2026-11-09

These are not covered by Q1–Q6. P1–P10 were approved as written. One point inside P7 is still open:

- **P7, read after approval:** today's queue row (`AdminUserDto`) shows id, **email**, **phone**, name, bio, photo, section, status, role, created / submitted / approved times. Its own comment says it is the only place an email or phone is shown to someone other than the owner. "The same fields" would therefore show members' email and phone to organisation admins, who are clients, not us. **Decided 2026-11-09 (Kaan): organisation admins do not see email or phone.** The organisation member list returns only user id, name, photo, bio, section, membership status and submitted time, to organisation admins and to the super admin alike on that route. The super admin's existing account list keeps email and phone. Acceptance test 10 also asserts that the member list response has no `email` and no `phone` field.

| # | Detail | Proposal | Based on |
|---|---|---|---|
| P1 | Order at sign-up | Confirm email first, then profile setup | Q4 says an unconfirmed account cannot enter the app |
| P2 | Confirmation link lifetime | 24 hours | No basis in the code. The password-reset link lasts 1 hour; a sign-up mail is often opened later |
| P3 | Resend limit | One resend per 60 seconds per account | No basis in the code. Needed so the resend route cannot be used to send mail in bulk |
| P4 | Existing development accounts | The migration marks them confirmed | Otherwise every test account is locked out |
| P5 | Bootstrap super admin (`BRAND_BOOTSTRAP_ADMIN_EMAIL`) | Marked confirmed and `active` at startup | Today the bootstrap approves that account at startup |
| P6 | Assigning an organisation admin | By email of an existing active account; gives it an approved membership with role `admin` | The first admin cannot enter through an event code, because no event exists yet |
| P7 | What an organisation admin sees about a pending member | The same fields the super admin's approval queue shows today | Not yet read field by field; T-1 lists them before building |
| P8 | Rejected member | May ask again; the membership returns to `pending` | Same rule a rejected account has today (`ProfileService.submit`) |
| P9 | `event.scope` | Nullable; required only in an organisation with sections | `section` / `national` have no meaning for a bar |
| P10 | An organisation's `has_sections` after creation | Cannot be changed | Changing it would leave memberships without a section or sections without an owner |

## 9. Acceptance tests

Each line is one test the step must add and pass. Existing tests that assert the old rules are rewritten, not deleted.

### T-1 backend: accounts, organisations, memberships
1. `V4` applied to a database holding V1–V3 data: one organisation "ESN Türkiye" exists; every section and event points at it; every account that had a section has one membership with the same section and the mapped status; no account has status `pending`, `approved` or `rejected`.
2. Register returns `emailConfirmed = false`; with mail disabled the confirmation link is logged and the log line does not contain the address.
3. An unconfirmed account gets `403 email_unconfirmed` on a member route and `200` on `GET /me`.
4. Opening the link confirms the email; opening it again, or after expiry, does not.
5. Resend twice within the limit sends one mail; the response is `202` both times.
6. `PUT /me/profile` without a section returns status `active`; a confirmed `active` account passes the access filter with no membership at all.
7. A banned account is refused on member routes, as today.
8. Only a `super_admin` can create an organisation, change its switches, or assign and remove its admins; each writes an audit row.
9. Assigning an admin by an email that has no active account is refused; assigning an existing member upgrades the same membership row.
10. An organisation admin can list, approve and reject pending members of their own organisation, and gets `404` for another organisation's.
11. An organisation admin gets `403` on reports, identity views, ban and promote.
12. Approving writes `approved_at` / `approved_by` and an audit row, and enqueues the approval push.

### T-2 backend: events, join, sections, hints
13. Join code of an open organisation without sections: membership `approved` and event joined in one call.
14. Join code of an approval organisation: `membership_required`; no membership row and no event membership are created by that call.
15. `POST /organisations/join` without `sectionId` in an organisation with sections is a validation error; with a section of another organisation, too.
16. After `POST /organisations/join` in an approval organisation: membership `pending`, event not joined, a second join attempt answers `membership_pending`.
17. Approval joins the stored event; if that event was deleted or does not exist any more, approval still succeeds.
18. A rejected member answers `membership_rejected` on join and can ask again, returning to `pending`.
19. `POST /events` with `event_creation = admins`: a member gets `403 event_creation_not_allowed`, an admin succeeds. With `members`: an approved member succeeds, a pending one does not.
20. An event in an organisation without sections is created with no scope and no section, and its DTO has no `section` and no `country`.
21. A message and a post written in an event snapshot `sender_section_id` from the sender's membership in that event's organisation, not from any other membership.
22. In an organisation without sections, a `section` or `country` hint in the request is refused; `first letter` is accepted.
23. A person with sections in two organisations shows the right one in each event's people list.
24. Section change is limited to one per 30 days per organisation: changing in organisation A does not block a change in organisation B.
25. A section roster returns `404` to an active account that is not an approved member of that organisation; the organisation's section list returns `200`.
26. Account export contains the memberships; account deletion removes them and still succeeds for an organisation admin.
27. Every existing board, inbox, wall, thread, block and report test still passes with accounts set up through memberships.

### T-3 app
28. Navigator: unconfirmed → confirm screen only; `incomplete` → profile setup with no section field; `active` with no membership → the four tabs with an empty Events tab.
29. Join sheet: `membership_required` for an organisation with sections shows the section picker with the read-only country row; without sections it does not.
30. A pending membership shows a waiting card naming the organisation and the event; a rejected one shows the ask-again action.
31. Create event: not offered when no membership has `canCreateEvents`; asks for the organisation only when more than one does; hides section/national for an organisation without sections.
32. Composer: `section` and `country` hints are not offered in an event of an organisation without sections.
33. Settings: change section is listed per organisation that has sections, with each one's own next-change date.
34. Own Profile tab shows the section line only with exactly one membership that has a section.
35. `en.json` and `tr.json` have the same keys; the gallery shows every new or changed component state.
36. `MockApi` implements every route in `tenant.ts` and the mock's behaviour tests cover lines 13–19 above.

### T-4 admin page
37. A super admin sees the organisation list, can create one and assign an admin by email.
38. An organisation admin signing in to the page sees only their organisation's pending members and no reports tab.

## 10. Step records

### T-0 — 2026-11-09, lead only
- Written: decisions 13–20 in `DECISIONS.md`; 22 amendments tagged [D13]–[D20] in `CLAUDE.md` and the same 22 in `AGENTS.md`; the contract `app/src/api/tenant.ts`; sections 7–9 of this file.
- Verified in code: every inbox message is written from an event (`MessageService.deliver` refuses a request without `eventId`), so the section snapshot always has one organisation to read from; the mail path for Q4 exists.
- Deviation from the plan: the contract went into a new file `tenant.ts` instead of editing `types.ts`, so the app still compiles against the current backend. `types.ts` is changed in T-3.
- Added beyond Q1–Q6: decision 20 (keyword screening only), which Kaan stated in the brainstorm on the same day.
- Not done: proposals P1–P10 in section 8 are not approved yet.

## 11. Not in this plan

Verified badge and SMS, "verified only" writing setting, message requests, removing a member from an organisation, organiser statistics, payments. Each is its own later step.
