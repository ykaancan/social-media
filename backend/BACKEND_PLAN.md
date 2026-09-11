# [BRAND] backend plan

Written 2026-09-11, after the frontend review (`app/FRONTEND_REVIEW.md`). The
frontend is complete against `MockApi`; this document is the plan for the
Spring Boot backend that replaces it. It is written so that one build step can
be handed to an implementation agent per session, as `app/FRONTEND_PLAN.md`
was for the app.

**The contract is already written.** `app/src/api/types.ts`, `messages.ts`,
`board.ts`, `threads.ts`, `settings.ts` are the DTOs and routes; `http.ts` is the
exact wire behaviour (headers, status-code mapping, STOMP destinations);
`mock.ts` is the behavioural spec (every rule, every status code, every
ordering). The server implements those files; it does not reinterpret them. If
the server has to disagree with a comment there, amend both sides in the same
commit.

---

## 1. Decisions taken as lead

Each decision is fixed unless its flip condition is met. Numbered **[B1]**–**[B14]**
so later steps can cite them.

- **[B1] Stack.** Spring Boot 3.5.x, Java 21 via Gradle toolchain (the machine
  has JDK 25; the foojay resolver plugin downloads 21 so the build never depends
  on the host JDK), Gradle Kotlin DSL with the wrapper, PostgreSQL 16, Flyway,
  Spring Security, Spring WebSocket/STOMP, Spring Data JPA for entities plus
  hand-written JPQL/SQL for every list query that carries a privacy rule. Docker
  Compose runs Postgres locally; Testcontainers runs it in tests. *Flip if:* the
  team standardises on Maven or a managed database that forbids extensions.

- **[B2] IDs are UUIDs** (`gen_random_uuid()`), generated in the database.
  The app treats every id as an opaque string. "Newest first" is
  `ORDER BY created_at DESC, id DESC`. Thread messages also carry a per-thread
  `seq` so the read watermark and "unread" are integer comparisons, never
  timestamp comparisons.

- **[B3] Auth.** Access token = signed JWT (HS256 with a 256-bit secret from
  configuration, 15 minutes, `sub` = user id, `role` claim). Refresh token =
  opaque random 256-bit value, stored **hashed** (SHA-256), 30-day expiry,
  rotated on every `/auth/refresh`, revoked on `/auth/logout`. Passwords are
  BCrypt (strength 12). Login and register return the same `AuthResult`. The
  WebSocket `CONNECT` frame carries the same bearer token in its `Authorization`
  header; there is no cookie auth for the app. *Flip if:* more than one
  backend instance needs to verify tokens without the shared secret (then RS256).

- **[B4] Sender identity is stored, hint values are derived at read time.**
  Every content row stores `sender_id`, `anonymity_level`, three booleans
  `hint_section`, `hint_country`, `hint_letter`, and `sender_section_id` — the
  section the sender belonged to **when they sent**. The section chip and the
  country chip are rendered from that snapshot section, so a later section
  change [D7] does not rewrite history and [D11] stays checkable (country is
  always the snapshot section's country). Name, avatar and first letter for
  `named`/`letter` are read live from the user row: named means "this person",
  and a renamed person is still that person. *Flip if:* the admin needs the
  name as it was at send time — then add a `sender_name` snapshot column; the
  DTO does not change.

- **[B5] Event status is derived, never stored.** `status` is computed from
  `closed_at`, `starts_at`, `ends_at` and `now()` in one SQL expression used by
  every event query, exactly as `eventDto` in the mock does. Board writability
  is `status = 'live'` [D4]. A housekeeping job (`@Scheduled`, every 5 s) does
  the two things a derived status cannot: it finalises rejections whose 5-second
  undo window has passed, and it rejects still-pending posts with
  `board_closed` once `ends_at` has passed, then publishes the invalidations and
  pushes. Both transitions are also applied lazily inside the board read, so a
  stopped scheduler can only delay notifications, never correctness.

- **[B6] Rejection undo is a row, not a timer.** `board_post.rejection_undo_token`
  (random), `rejection_undo_until`, `rejected_by`. While `undo_until > now()`
  the post is still `pending` for the sender and hidden from the queue; undo
  clears the three columns; expiry (lazy or by the job) sets `state = rejected`,
  `rejection_reason = moderator` and notifies the sender. Undo is accepted only
  from the moderator who rejected, before the deadline — same as the mock.

- **[B7] Idempotency keys are a table.** `request_key(user_id, key, fingerprint_hash,
  result_id, created_at)` backs `POST /threads` and `POST /threads/{id}/messages`.
  Same key + same fingerprint returns the prior result; same key + different
  fingerprint is `409`. Keys older than 7 days are purged by the housekeeping job.

- **[B8] Push goes through the Expo push service** behind a `PushSender`
  interface, with a durable `push_outbox` table drained by the housekeeping job.
  The app is Expo; Expo's service delivers to FCM and APNs with one server
  credential and no certificate handling, which is the right cost for a
  few-hundred-user first event. The app currently registers **no** device
  token, so the push step adds `expo-notifications` and
  `PUT /me/devices { token, platform, locale }` to the app (the one frontend
  change this plan makes). Push copy is server-side i18n (`en`/`tr`) keyed by the
  device's registered locale. *Flip if:* the app leaves the Expo toolchain, or
  Expo's service becomes a delivery bottleneck — then implement direct FCM/APNs
  senders behind the same interface.

- **[B9] Screening is keyword lists as data, with a pluggable model hook.**
  `screening_term(term, normalized, severity hard|soft)` managed on the admin
  page; matching uses the same normaliser as muted words. `hard` refuses
  delivery (422 `delivery_unavailable`), `soft` warns; a soft match delivered
  with `screeningAcknowledged` is stored with `screening_flag = soft` and
  appears in the admin "flagged" list. A `ContentScreener` interface has the
  keyword implementation now; a model-backed implementation is a later,
  flag-gated sub-step and not part of any stage-1 build step below. *Flip if:*
  the first event shows keyword screening is not enough.

- **[B10] Avatars are files on disk**, resized server-side to 512×512 JPEG,
  served from `/media/avatars/{uuid}.jpg` by the backend, path configurable.
  Account deletion deletes the file. *Flip if:* more than one instance or a CDN
  is needed — then S3-compatible storage behind the same `AvatarStore`
  interface.

- **[B11] The admin page is one static HTML file** in `/admin`, served by the
  backend at `/admin/`, calling JSON endpoints under `/admin/api/*` with the
  same bearer token from `/auth/login`. No build step, no framework. The first
  `super_admin` is created by configuration: on startup, the account whose
  email equals `BRAND_BOOTSTRAP_ADMIN_EMAIL` is promoted to `super_admin` and
  `approved`. The role is data; a second admin is promoted from the admin page.

- **[B12] STOMP uses Spring's simple in-memory broker**, raw WebSocket at
  `/ws` (no SockJS — the client uses `@stomp/stompjs` 7 with binary frames on
  native), heartbeats 10 s/10 s to match the client. Destinations, exactly as
  `http.ts` subscribes: `/topic/events/{id}/board` (any change on that board;
  `SUBSCRIBE` is refused unless the caller is a member), `/user/queue/events/{id}`
  (changes to the caller's own posts on that board), `/user/queue/threads`
  (any change to a thread the caller is in, including read watermarks). Frames
  carry an **empty body**; clients refetch. *Flip if:* a second instance is
  deployed — then a RabbitMQ STOMP relay.

- **[B13] Reference data is real and comes from a migration.** `country` and
  `section` rows for Türkiye's ESN sections are inserted by `V2__reference_data.sql`.
  The list is public and the founder confirms it before the first deploy; a
  wrong or missing section is a new migration, not a hand edit. **Nothing else
  is seeded**: no people, no events, no messages (principle 4). The nine
  prototype sections in `app/src/dev/fixtures.ts` are gallery fixtures and never
  reach the database.

- **[B14] Error contract.** Every non-2xx body is `{ "code", "message", "field"? }`.
  Status codes are what `http.ts` already maps: `401` = session gone (auth
  endpoints: wrong credentials), `409` = conflict (the client maps every 409 to
  `email_in_use`; only register shows it to the person, everywhere else the UI
  refetches, so this is acceptable and must not be "fixed" server-side), `422` =
  validation or refused delivery, `403` = not allowed (including
  `approval_required` for non-approved accounts on member routes), `404` = not
  visible to you (used deliberately where "exists but not yours" must not be
  distinguishable), `429` = rate limit / section-change cooldown. Messages are
  short English strings for logs; the app never shows them.

---

## 2. Schema (Flyway `V1__schema.sql`)

One migration for the whole stage-1 model, as the brief §10 requires. Types in
Postgres terms; every timestamp is `timestamptz`; every enum is a `CHECK`
constraint on `text` (easier to extend than a Postgres enum).

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `country` | `code` PK (ISO-3166), `name` | Stage 1 has one row: `TR` / `Türkiye`. |
| `section` | `id`, `name`, `country_code` FK, `created_at` | [D11] country reached only through this. |
| `app_user` | `id`, `email` (unique on `lower(email)`), `password_hash`, `phone`, `status` (`incomplete/pending/approved/rejected/banned`), `role` (`member/super_admin`), `name`, `bio`, `avatar_key`, `section_id` FK null, `inviter_id` FK null, `created_at`, `submitted_at`, `approved_at`, `approved_by`, `banned_at` | `event_moderator` is never stored here; it is `event_member.is_moderator`. Real deletion removes the row. |
| `refresh_token` | `id`, `user_id`, `token_hash` unique, `expires_at`, `revoked_at`, `created_at` | [B3] |
| `password_reset_token` | `id`, `user_id`, `token_hash`, `expires_at`, `used_at` | 1-hour tokens. |
| `user_settings` | `user_id` PK, `writing_policy` (`anyone/named_only/nobody`), `muted_words text[]`, `muted_words_normalized text[]`, `notify_inbox`, `notify_threads`, `notify_board_mentions` | Row created with the account. |
| `section_change` | `id`, `user_id`, `from_section_id`, `to_section_id`, `changed_at` | [D7] audit + 30-day rule (`sectionChangeAvailableAt` = last `changed_at` + 30 d). |
| `device` | `id`, `user_id`, `push_token` unique, `platform`, `locale`, `created_at`, `last_seen_at` | [B8] |
| `event` | `id`, `name`, `scope` (`section/national`), `section_id` FK (creator's section, always stored), `starts_at`, `ends_at`, `cover`, `board_mode`, `join_code` unique (6 chars, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), `creator_id` FK null, `closed_at`, `closed_by`, `created_at` | [D4] no status column. DTO exposes `section` only when `scope = section`; `country` always from `section`. |
| `event_member` | `event_id`, `user_id`, `is_moderator`, `joined_at` PK(event,user) | Creator row has `is_moderator = true`; `canManageModerators` = `creator_id = viewer`. |
| `inbox_message` | `id`, `sender_id`, `recipient_id`, `event_id`, `text` (≤ 280), anonymity columns [B4], `state` (`new/private/approved`), `state_changed_at`, `from_board`, `muted_match`, `push_suppressed`, `screening_flag`, `deleted_at`, `created_at` | [D12]. Wall = `state = approved AND deleted_at IS NULL`. |
| `board_post` | `id`, `event_id`, `sender_id`, `text` (≤ 280), anonymity columns, `state` (`pending/approved/rejected`), `approval_kind` (`auto_approved_by_author/immediate/moderator`), `rejection_reason` (`moderator/board_closed`), `rejected_by`, `rejected_at`, `rejection_undo_token`, `rejection_undo_until`, `hidden_at`, `hidden_by`, `inbox_message_id` FK null, `created_at` | A post to a person has `inbox_message_id` set and is published on the board iff that message is `approved` and not deleted. |
| `post_reaction` | `post_id`, `user_id`, `emoji` PK(post,user) | Emoji set `🔥 😂 ❤️ 👀 😳`. |
| `thread` | `id`, `origin_kind` (`inbox/post`), `origin_inbox_message_id`, `origin_post_id`, `event_id`, `created_at`, `last_message_at` | `source` = event name. |
| `thread_participant` | `thread_id`, `user_id`, anonymity columns, `revealed_at`, `read_through_seq` PK(thread,user) | [D5] current sending level; never used to render old bubbles. |
| `thread_message` | `id`, `thread_id`, `seq`, `sender_id`, `text` (≤ 500), anonymity columns, `system` (`revealed` or null), `created_at` | [D5] level at send time, never rewritten. |
| `request_key` | `user_id`, `key`, `fingerprint_hash`, `result_id`, `created_at` PK(user,key) | [B7] |
| `block` | `id`, `blocker_id`, `blocked_id`, `display_level`, display hint columns, `display_section_id`, `created_at` unique(blocker,blocked) | [D6]. `id` is the opaque `BlockedEntry.id`; the display columns are the identity the blocked person had already allowed. |
| `report` | `id`, `reporter_id`, `target_kind` (`inbox_message/board_post/thread`), `target_id`, `reason`, `status` (`open/dismissed/hidden/warned/banned`), `resolved_by`, `resolved_at`, `created_at` | Survives recipient soft-delete; removed only by real deletion. |
| `audit_log` | `id`, `actor_id`, `action` (`identity_view/approve_user/reject_user/ban_user/warn_user/hide_content/promote_admin`), `subject_user_id`, `subject_kind`, `subject_id`, `details jsonb`, `created_at` | Every identity view writes a row before the response is built. |
| `screening_term` | `id`, `term`, `normalized`, `severity` (`hard/soft`), `created_by`, `created_at` | [B9] |
| `entitlement_usage` | `user_id`, `period_start`, `inbox_reads`, `cold_opens` PK(user,period) | Brief §3 counters; unused while flags are off. |
| `push_outbox` | `id`, `user_id`, `kind`, `locale`, `payload jsonb`, `created_at`, `sent_at`, `attempts`, `last_error` | [B8] |

`V2__reference_data.sql` inserts `country` and `section` rows [B13].

Indexes that matter: `inbox_message(recipient_id, deleted_at, created_at desc)`,
`board_post(event_id, state, created_at desc)`, `thread_participant(user_id)`,
`thread_message(thread_id, seq)`, `block(blocker_id)`, `block(blocked_id)`,
`event_member(user_id)`, `refresh_token(token_hash)`, `push_outbox(sent_at)
where sent_at is null`.

---

## 3. Rule inventory the server must reproduce

Taken from `mock.ts`. Each line is a test case in the backend suite.

**Accounts.** Register: email `/.+@.+\..+/`, password ≥ 8, duplicate email
(case-insensitive) → 409 `email_in_use`; new account `incomplete`, `member`.
Login: wrong email and wrong password give the same 401. Forgot password: 202
always; sends a reset email (SMTP when configured, otherwise logs the link);
the link opens a plain server-rendered reset page. `/me`: any status.
`PUT /me/profile`: name 1–40, bio ≤ 80, section must exist; `banned` → 403;
`approved` → 422 (use edit/section endpoints); otherwise sets `pending` and
`submitted_at`. `PATCH /me/profile`: approved only; name/bio; no section, no
status change. `POST /me/photo`: multipart `photo`, JPEG/PNG ≤ 5 MB, resized,
returns `{ avatarUrl }`. Member routes require `approved` → else 403
`approval_required`.

**Sections.** `GET /sections`: all, with real `memberCount` (approved members).
`GET /sections/{id}`: roster = viewer first if it is their section, then
approved members by name (page of 50), `rosterTotal` = approved member count,
`wallEventId` = an event both viewer and that member have joined (prefer live).

**Events.** Create: name 2–40, `ends_at > starts_at`, scope/mode/cover in
their sets; section derived from creator; creator joins as moderator; join code
unique. Join: code normalised (`upper`, strip spaces/dashes); not found →
`{ok:false, not_found}`; already joined → `{ok:false, already_joined, eventName}`.
`GET /events` = joined events, all statuses. `GET /events/{id}` requires
membership, else 404. `people` = full roster, viewer first, with `bio`.
`postCount` = published board posts.

**Walls and inbox.** `getWall`: viewer and target both joined to that event,
target approved, else 404; messages = `approved`, not deleted, sender not
blocked by viewer; `count` = that list's length; `writingPolicy` from target's
settings. Send: recipient approved, not self, both joined, recipient has not
blocked sender, policy `nobody` → 403, `named_only` and level ≠ named → 403;
text 1–280; level valid; hint level needs ≥ 1 hint; hard screening or
unacknowledged soft → 422; muted-word match → `state = private`,
`push_suppressed`; else `new`; push suppressed also when `notify_inbox` is off;
the sender always gets `{accepted:true}`. Inbox: recipient's non-deleted,
non-blocked messages newest first, `counts` per state over that same list.
State change: any of the three, reversible; a board-origin message's state
change also invalidates the board. Delete: `deleted_at`. Report: one per
(message, reporter). Block by message id: writes `block` with the sender's
allowed display; never returns identity.

**Boards.** Read requires membership. Send requires `live`. To a person:
delivered as an inbox message (`from_board`) plus a `board_post` linked to it,
never queued. To the room: creator/co-moderator → `approved`,
`auto_approved_by_author` [D9]; `post_immediately` → `approved`, `immediate`;
`approve_first` → `pending`. Snapshot: `posts` = published (approved room
posts not hidden, plus linked person posts whose message is approved and not
deleted); `ownUnpublished` = viewer's room posts not approved;
`queue` (moderators) = pending room posts with no active undo; `pendingCount`
= pending including those in an undo window; `reviewed` = non-pending, not
hidden; `creator`, `moderators`, `canManageModerators`. Approve: all ids must
be pending room posts of this event with no undo in progress, else 409 and
nothing changes. Reject: as [B6]; returns `{undoToken, undoUntil}`. Undo: same
moderator, before deadline, else 409. React: published post, emoji in set or
null to clear. Hide: moderators, published room posts only. Report: published
post, valid reason. Controls: not archived (409); `endsAt` finite and after
`max(now, starts_at)`; mode change affects future posts only. Close: live
only; stamps `closed_at/closed_by`; pending → `rejected/board_closed`.
Moderators: creator only, target must be a member and not the creator, not
archived.

**Threads.** Open: `requestId` required ≤ 100 [B7]; origin `inbox` = a message
the viewer received (visible), origin `post` = a published post on a board the
viewer belongs to; origin author ≠ viewer, approved, no block in either
direction, else 403; text 1–280 + screening; hint validity; participants =
viewer at chosen level, author at the origin's level; first message appended;
both notified. List: threads the viewer is in, minus those where the viewer
blocked the other; newest last message first; `unreadCount` = other's
messages with `seq > read_through_seq`. Detail: same access, 404 when blocked;
`origin`, `mySender`, `canReveal = level ≠ named`, `blockMessageId` = first
message by the other participant, else the origin id. Send: other has not
blocked viewer and is approved (403); requestId idempotent; text 1–500 +
screening; level = participant's current level. Read: watermark only moves
forward; unknown id → 422. Reveal: idempotent; sets participant to `named`,
`revealed_at`, appends a `system = revealed` row with empty text. Report:
whole thread. Block: message must be the other participant's (or the origin).

**Settings.** Get/patch: policy in set; muted words ≤ 100, each 1–40 chars,
trimmed, Turkish-lowercased, de-duplicated by normalised form; notifications
three booleans; partial patch, atomic. Blocked list: `{id, sender}` from the
block row's display columns. Unblock: own row only (404 otherwise). Section
change: section exists; same section is a no-op; cooldown → 429; writes
`section_change`; returns `Me` with the new section. Export: profile,
settings, blocks, inbox (as DTOs), sent messages, posts, threads, section
changes — no hidden ids anywhere. Delete: real deletion, in one transaction,
in the order the mock uses: threads the user is in (and their messages and
keys), messages sent or received, board posts authored, reactions, reports
filed by or targeting deleted content, blocks in both directions, settings,
devices, tokens, section changes, event memberships; events the user created
keep their posts, lose `creator_id`, are closed if still open, and their
pending posts become `board_closed`; the avatar file is removed; finally the
user row. Both boards and threads affected are invalidated.

**Normaliser.** `normalizeForSearch` in `app/src/utils/text.ts` is the
reference: Turkish-aware lowercase (`İ→i`, `I→ı` first), then `ı→i`, NFD, strip
U+0300–U+036F. Implement it once in Java (`TextNormalizer`) and use it for muted
words, screening terms, section search and people search. Test with the same
inputs as the app's `text` tests.

---

## 4. Build steps (one per session)

Every step: Flyway is only added to, never edited once applied; tests run
green with Testcontainers; the app is pointed at the local server with
`EXPO_PUBLIC_API_URL` and the affected flows are exercised on the emulator;
the step's section is appended to this file with what was verified, what was
left out, and any deviation from `CLAUDE.md`.

| Step | Scope | Delivers |
| --- | --- | --- |
| **B-1** | Foundation | Gradle project, Docker Compose Postgres, `V1__schema.sql` (whole §2) and `V2__reference_data.sql`, security + JWT + refresh rotation, `/auth/*` incl. forgot/reset pages, `/me`, `PUT`/`PATCH /me/profile`, `/me/photo`, `/sections`, error contract [B14], `TextNormalizer`, admin page with the approve/reject queue and admin bootstrap [B11], CI workflow (`gradle test`). Verified by onboarding end-to-end on the emulator against the real server. |
| **B-2** | Events, walls, inbox | `/events*`, `/events/{id}/people/{id}/wall`, `/me/inbox*`, `/messages/*`, keyword screening [B9], muted words, blocks and reports (member side), `/me/settings`, `/me/blocks`. Steps 3–4 of the app work against the server. |
| **B-3** | Live boards | `/events/{id}/board`, posts, reactions, moderation (approve/reject/undo/hide/report), controls, close, moderators, STOMP broker + invalidations [B12], housekeeping job [B5]. Step 5 of the app works, including two devices seeing each other's posts live. |
| **B-4** | Threads | `/threads*`, `/me/threads`, request keys [B7], reveal [D5], read watermark, thread report/block, `/user/queue/threads`. Step 6 of the app works. |
| **B-5** | Safety, settings, push, admin | Section change + audit, export, real deletion, rate limits (anonymous posts per hour, thread openings per day — values in configuration), push: `device` registration + `expo-notifications` in the app + Expo sender + outbox [B8], admin reports queue with audited identity view and dismiss/hide/warn/ban, screening-term management. Step 7 of the app works; a push arrives on the emulator. |
| **B-6** | Release readiness | Dockerfile, production configuration profile (secrets from environment, HTTPS behind a reverse proxy), backup note, the full app test matrix from `FRONTEND_REVIEW.md` run against the deployed server on Android, load check of one board with a few hundred members, and the founder's sign-off list. |

Order matters: B-2 before B-3 because a board post to a person is an inbox
message; B-3 before B-4 because a thread's origin is a post or a message.

---

## 5. Project layout (created in B-1)

```
backend/
  build.gradle.kts, settings.gradle.kts, gradle/ (wrapper)
  docker-compose.yml            # postgres:16 for local dev
  src/main/java/app/brand/
    Application.java
    config/        # security, jackson, websocket, scheduling, properties
    common/        # ApiException + handler [B14], TextNormalizer, Ids, Clock
    auth/          # tokens, login/register/refresh/logout/forgot/reset
    user/          # app_user, settings, profile, photo, section change, export, deletion
    section/       # sections + rosters
    event/         # events, membership, join codes, moderators, controls, close
    message/       # inbox/wall messages, screening, muted words
    board/         # board posts, queue, reactions, housekeeping
    thread/        # threads, participants, messages, request keys
    safety/        # blocks, reports, rate limits, screening terms
    push/          # devices, outbox, Expo sender, i18n copy
    realtime/      # STOMP config, auth interceptor, invalidation publisher
    admin/         # /admin/api/* + audit
  src/main/resources/
    application.yml, application-dev.yml
    db/migration/V1__schema.sql, V2__reference_data.sql
    messages_en.properties, messages_tr.properties   # push copy only
    templates/                # forgot/reset pages (Thymeleaf, plain)
  src/test/java/...           # Testcontainers integration tests per module
admin/
  index.html                  # [B11], copied to static/admin/ at build
```

Package name `app.brand` is a placeholder like `[BRAND]`; rename once the
brand exists (one `sed`, one commit).

---

## 6. Things that need the founder, not an agent

- The confirmed list of Türkiye ESN sections for `V2__reference_data.sql` [B13].
- SMTP credentials for password-reset mail, or accept "log the link" until launch.
- An Expo account access token for push [B8] and the app's `projectId`.
- Where the server runs (a single container host with managed Postgres is
  enough for stage 1) and the domain, so `EXPO_PUBLIC_API_URL` and the
  privacy/terms URLs can be set.
- KVKK documents: privacy policy and terms URLs; VERBİS is outside the code.

None of these block B-1 through B-4.

---

## B-1 record (2026-09-11)

**Built.** Gradle 9.1 project (Boot 3.5.16, Java 21 via foojay toolchain),
Compose Postgres, `V1__schema.sql` (all 23 stage-1 tables) and
`V2__reference_data.sql` (TR + 26 ESN Türkiye sections, founder to confirm),
error contract [B14], `TextNormalizer`, JWT + hashed rotating refresh [B3],
approved-member guard, `/auth/*` with server-rendered forgot/reset pages,
`/me`, `PUT`/`PATCH /me/profile`, `POST /me/photo` (sniffed, resized 512 px
JPEG, filesystem `AvatarStore` [B10]), `/media/avatars/*`, `/sections`,
`/sections/{id}` with `wallEventId`, admin bootstrap [B11], `/admin/api/users*`
(list/get/approve/reject/ban/promote, audited), the static `/admin/index.html`,
and `.github/workflows/backend.yml`.

**Verified.** `./gradlew test`: 87 tests, 0 failures (auth 20, normaliser 16,
migration 5, profile 12, avatar 9, sections 9, admin 16). On the Pixel_8
emulator against the real server (`EXPO_PUBLIC_API_URL=http://10.0.2.2:8080`):
register → profile setup with the server's section list and derived country →
"You're in the queue" → approved through `/admin/api/users/{id}/approve` →
the app's 30 s `/me` poll moved it into the four-tab shell. The admin page
logged in, listed the pending and approved rows, and the bootstrap promoted the
configured email on the second start.

**Deviations, all deliberate.** `audit_log.subject_user_id` and
`screening_term.created_by` are `ON DELETE SET NULL` (RESTRICT would block KVKK
deletion of anyone an admin ever acted on). Passwords are capped at 72
characters (BCrypt limit) as a 422, not a 500. Authorisation re-reads the
`app_user` row on every request so a ban or approval is immediate; the JWT
role claim is informational. UUIDs for JPA inserts come from Hibernate (same
v4 values; the column defaults remain for SQL). No CHECK on
`post_reaction.emoji` (one emoji carries a variation selector; the set lives in
code). WebP is accepted alongside JPEG/PNG via `imageio-webp`. `/admin/` is a
tiny controller rather than a static handler so the directory URL resolves.

**Not done (later steps).** Everything under B-2 onward. The Profile tab shows
"Couldn't load this" against this server because `GET /me/inbox` is B-2.
Thread `seq` must start at 1 (the participant watermark defaults to 0), and
B-2 must always set `inbox_message.event_id`, which the schema leaves nullable.
Dev-loop notes: the worktree's app needs its own `npm ci`; Expo runs on port
8082 (8081 belongs to the main checkout); `adb shell input text` drops
everything after a space.

---

## B-2 record (2026-09-11)

**Built.** `event/` (events, membership, join codes, derived status in one SQL
expression and one Java method, `EventAccess` with 404-not-403 membership and
`requireLive` → 409 `board_read_only`, real `postCount` over the published
rule), `content/` (`Anonymity` embeddable, `AllowedHints`, `SenderPresenter`
rendering chips from the snapshot section and name/avatar/letter live [B4]),
`safety/` (`KeywordScreener` behind `ContentScreener` with a 30 s term cache
[B9], `POST /messages/screen`, `BlockService`, `RecipientPolicy`,
`ReportService` shared by later steps), `message/` (`GET /me/inbox`, wall read
inside an event, `POST /messages/wall` with the mock's refusal order and one
403 code, state changes, soft delete, report, block by message id, Spring
events `InboxMessageDelivered` / `InboxMessageChanged` for B-3 and B-5), and
`settings/` (`GET`/`PATCH /me/settings`, `GET /me/blocks`, `DELETE /me/blocks/{id}`).

**Verified.** `./gradlew test`: 147 tests, 0 failures (B-1's 87 plus events
11, screening 6, safety 7, messages 18, settings 18). On the emulator against
the real server: Ece joined Deniz's live event by code, the Inbox tab badged
the hint-level message from Deniz with the sender's section and country chips
and the event source, Approve to wall moved it to On wall, and the Profile
wall showed it with "1 on the wall". Through the API: anonymous message
delivered and approved, the wall readable by a member and 404 to a
non-member, `named_only` refusing an anonymous send with the single
`delivery_unavailable` code, a muted word filing a delivered message to
Private with the sender still told `accepted`, block by message id hiding the
sender's messages and refusing further sends, the blocked list showing only
the allowed display, unblock, and Turkish text round-tripping intact.

**Deviations, all deliberate.** `EventMember` has no JPA association to the
user (a composite-key mapping conflict); rosters load people in one extra
query. `EventService.create` runs one transaction per join-code attempt via
`TransactionTemplate`. `postCount`'s linked-post branch does not check
`hidden_at` (hide applies to room posts only; B-3 owns it). Live events sort
by `starts_at` descending among themselves. The settings PATCH body is bound
as JSON so a wrongly typed notification value can still name its `field`. A
missing `user_settings` row reads as defaults without being created.
`sectionChangeAvailableAt` is the cooldown's end and is emitted as a literal
`null`. No V3 migration was needed. Two test classes now clean up their rows
so the "nothing is seeded" assertion is order-independent.

**Not done (later steps).** The event detail screen in the app cannot open
against this server yet because it composes `GET /events/{id}/board` (B-3), so
walls were exercised through the API. No push rows are written yet; the
delivery event carries `pushSuppressed` for B-5. Note for B-3: the
`KeywordScreener` cache is only invalidated by `invalidate()`, which the admin
term endpoints in B-5 must call. Session note: a PC shutdown interrupted the
messages agent after it had finished; the disk state was complete and the
suite green on restart.
