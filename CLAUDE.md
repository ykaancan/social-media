# CLAUDE.md — [BRAND]

This file is read at the start of every Claude Code session. It is the product contract. When an instruction in a prompt conflicts with this file, stop and ask.

Rules marked **[D1]**–**[D12]** are decisions taken on 2026-09-06 that amend or extend the original brief, after reading the Claude Design prototype. The brief text below has been edited in place so no superseded sentence is left standing. The reasoning, the rejected alternatives and the "flip it if" conditions for each are in [`/DECISIONS.md`](DECISIONS.md); the record of the design bundle they came from is in [`/design/HANDOFF.md`](design/HANDOFF.md).

## Repo layout
- `/backend` — Spring Boot 3 (Java 21), PostgreSQL, Flyway, STOMP over WebSocket, FCM/APNs push.
- `/app` — Expo (React Native) + TypeScript, React Navigation, i18n (en default, tr).
- `/design` — the Claude Design hand-off bundle and `HANDOFF.md`. Read-only reference; never edit.
- `/admin` — minimal web page for super admin (approve users, reports queue). Plain, no design system needed.

## Engineering conventions
- Every content row (post, message, thread message) stores `sender_id` and `anonymity_level` (`anonymous` | `hint` | `named`) plus the hint fields the sender allowed. Anonymity is a display rule; the server always knows the sender.
- **[D5]** A thread message's stored `anonymity_level` is the level it was **sent at** and is never rewritten. The level new messages go out at lives on `thread_participant` (`thread_id`, `user_id`, `anonymity_level`, hint fields, `revealed_at`). Reveal updates the participant row and inserts a system message; it must never unmask messages already sent. Render every bubble from its own row, not from the participant's current level.
- API DTOs never expose `sender_id` or hidden hint fields unless the caller is `super_admin` viewing a report. Every such identity view is written to the audit log.
- Roles: `member`, `event_moderator`, `super_admin`. Stored as data, never hardcoded to a user id.
- Sections are membership tags (Country → Section → User). They have no administrative power.
- **[D11]** Country is **not** an independent field. It is read through the user's section, and means where the person sits in the network, not their nationality. The `country` hint must always be checkable against the sender's section.
- **[D7]** A user may change their own section. It does not re-enter the approval queue: log the change (user, from, to, timestamp) and rate-limit to one change per 30 days. There is no approved-but-read-only account state; `pending` means the account cannot use the app yet.
- Posts addressed to a person never enter a board moderation queue in any board mode.
- **[D9]** A creator's or co-moderator's post **to the room** publishes immediately in both board modes, recorded as `auto_approved_by_author`. Nothing else is exempt, and the post carries whatever anonymity level its author chose.
- **[D8]** Rejecting a queued post is final — there is no un-reject. Moderators keep a read-only Rejected list. A mis-tap is recovered through a 5-second undo on the rejection toast, before the sender is notified.
- **[D6]** Block never deletes another person's content. It writes a `block(blocker_id, blocked_id)` row; the server refuses every write from blocked to blocker in every surface, and the blocker's inbox, wall and thread list filter the blocked user out. Board posts stay on the board. Block is issued **by message id** so the client can block an anonymous sender without ever learning who they are; the blocked user is not told.
- **[D12]** Inbox messages have `state` (`new` | `private` | `approved`) and move freely in both directions; the wall is exactly `state = 'approved'`. Delete is a soft delete (`deleted_at`) so a reported message survives the recipient deleting it. **[D6]/[D12]** Never write UI copy claiming content was "removed" when it was hidden or soft-deleted.
- **[D10]** A recipient's muted words are separate from platform screening. Platform screening (see §5) decides delivery and warns the sender before send. Muted words never affect delivery: a match is stored, lands in `private`, and **suppresses the push notification**; the sender is never told. Match case-insensitively and Turkish-aware (`toLocaleLowerCase("tr")`, ı→i, NFD diacritic strip), substring, server-side — the same normalisation used for section and people search.
- Monetization gates (free inbox reads, cold-open limit, reveal) exist as server-side config flags, default OFF. Locked-card UI renders unlocked. Never fabricate counts, cards or hints. **[D3]** "Renders unlocked" means renders as an ordinary card: while the gate is off, `LockedCard` shows no hatch, no dashed border, no blurred bars and no lock badge. The locked treatment is built and tested, and appears the day the flag flips — nothing in stage 1 looks different for a reason the user cannot see.
- Text only in stage 1. No image or file upload endpoints.
- Every user-facing string goes through i18n with the same keys in `en.json` and `tr.json` (Turkish uses "sen"). The bundle's `strings/*.json` do not cover the copy the prototypes show — derive the key set from the prototypes and back-fill both tables (`/design/HANDOFF.md` §7 CC).
- Do not restyle the design system. Use the tokens and component names from `/design`. Do not add screens or features that are not in the brief's stage 1.
- **[D1]** The component library is the 22 named design-system components **plus** the recurring patterns the prototypes rebuild inline (`/design/HANDOFF.md` §2.5): Empty, Note, Row, Group, Back, PersonRow, ConfirmSheet, ReportSheet, MoreSheet, Composer, ReplySheet, PersonPicker, SectionSheet, JoinSheet, CreateSheet, ModsSheet, ControlsSheet, Swipe, TabBar, WallHeader. Screen steps compose; they do not invent local helpers. If a screen needs something the library lacks, add it to the library.
- **[D2]** The app shell is a four-tab bottom navigation: **Events · Inbox · Threads · Profile**. Profile is the owner's own wall. Tab badges: Inbox counts `new` messages, Threads counts unread. The tab bar is hidden whenever a screen is pushed on top of a tab.
- Account deletion is real deletion (KVKK). This is distinct from block **[D6]** and from inbox delete **[D12]**, which hide rather than destroy. Keyword + model screening runs server-side before delivery.

## Working rules for Claude Code
- One step per session. Summarize the plan, wait for "go", then implement.
- Schema changes only via Flyway migrations; never edit an applied migration.
- **[D1]** The app carries a dev-only **component gallery** screen listing every component in every variant — the RN equivalent of the bundle's `*.card.html` specimens. It is how "verified visually against the prototype" is proved: run Expo, screenshot the gallery, compare against `/design`. Keep it current as the library grows.
- Before finishing a step: run tests, list what was not done, list any deviation from this file.

---

# [BRAND] — Product Brief (Stage 1 MVP)

## 1. What it is

A mobile social app for the Erasmus / exchange-student community. Real, verified profiles; anonymous-by-choice actions. Two core surfaces: a personal **Wall** and time-boxed **Event Boards**. It productizes the anonymous paper board that appears at every ESN meeting and event.

- Platforms: iOS + Android (Expo / React Native). Backend: Spring Boot + PostgreSQL, WebSockets for live boards and threads.
- Languages: English (default), Turkish. All UI copy is i18n from day one.
- Audience: 18+ exchange students and student-network volunteers. Stage 1 users: volunteers at one national event in Türkiye (a few hundred people, all known to the admin).
- Independent product. Not affiliated with any organization; "Erasmus" only in descriptive copy, never in the brand name.

## 2. Product principles

1. **Real people, anonymous actions.** One verified account per person. Every post, comment and message carries its own anonymity level chosen by the sender. The server always knows the sender.
2. **Recipient curates what is public.** Anything written *to* a person lands privately first; they choose what goes on their public wall.
3. **Reading is free, exciting actions may cost.** Never paywall browsing or writing. Monetization gates exist in the model from day one but are OFF in stages 1–2.
4. **Never fake anything.** Message counts, locked cards and hints are always real. No seeded or synthetic content, ever.
5. **Safety is a product feature.** Recipient-side controls, filtering before delivery, reporting that deanonymizes to admins only.

## 3. Core model

### Anonymity levels (per action, chosen by sender)
- `anonymous` — no sender info shown.
- `hint` — shows one or more of: section, country, first letter of name (sender picks which).
- `named` — full name and avatar.

Recipients can unlock only what the sender allowed. The reveal/unlock action exists in the API but is free and unlimited in stage 1.

### Graph
- `Country` → `Section` → `User`.
- `Event` belongs to a `Section` or to the national level of a `Country`.
- `Event` has a join code + QR, a start and end time, and a status: `upcoming` / `live` / `archived`.
- **[D4]** There is no fourth status. A board a moderator ends early goes to `archived` immediately and stamps `closed_at` / `closed_by`; "Closed" is a label rendered when `closed_at` is set and `now() < ends_at`. Board writability is `status = 'live'`, with no second condition. Closing transitions every still-pending post to `rejected` with reason `board_closed`, so the sender sees the ordinary "Not published" card — never leave a post pending forever.

### Sections are membership tags, not tenants
- A user belongs to one section (self-selected at sign-up, confirmed by the admin on approval). Sections have no administrative power.
- **[D7]** Changing your section later is allowed, logged, and rate-limited to once per 30 days. It does **not** send you back to the approval queue. **[D11]** A section change is also a country change, and the UI says so.
- Every member can open their section page and see its roster. Cross-section rosters are visible too (needed for hints and for finding people at events).
- Section chat rooms are stage 2, not MVP.

### Roles
- `member` — default.
- `event_moderator` — creator of an event/board plus any co-moderators they add: approve/reject queued room posts, hide posts, close board, set end time. Cannot see identities, cannot ban, never sees posts addressed to a person.
- `super_admin` — the only role that approves registrations, handles reports, views sender identity, and bans. Held by the founder in stage 1; stored as a role, not a hardcoded user, so a second trusted admin can be added later without code changes.

### Onboarding and verification
- Register with email + phone or social login; profile fields: name, photo, section, one-line bio. **[D11]** Country is derived from the section, shown read-only, and never picked.
- Account is `pending` until approved by an admin. Invite chain stored: who vouched for whom (inviter id on the user record). Invite-based onboarding is stage 2, but the field exists now.

### Entitlement layer (present, switched off)
- `free_inbox_reads` per period — messages beyond N appear as **locked cards**. Stage 1: N = unlimited.
- `cold_open_limit` per day — stage 1 unused (no cold DMs).
- `reveal` action on hint-level content — stage 1 free.
- All limits are server-side config flags.

## 4. Stage 1 screens (design these, in this order)

### 4.1 Onboarding
Splash → sign up → profile setup (photo, name, section picker, bio; **[D11]** country is a read-only row filled from the section) → "pending approval" state with what happens next → approved.

### 4.2 Profile & Wall (public)
- Header: photo, name, section · country, bio.
- Wall: the messages this person chose to publish, newest first. Each card shows sender at the anonymity level the sender chose (anonymous icon / hint chips / name + avatar).
- Primary action for visitors: **Write on the wall** — opens the composer (see 4.6).
- **[D2]** The owner reaches their inbox from the Inbox tab, badged with the unread count — not from an "Inbox (n)" button on the wall.

### 4.3 Inbox (private, owner only)
- List of messages sent to me, newest first. Each card: content, sender at their chosen anonymity level, time, source (which event, if any).
- Per card: **Approve to wall** / **Keep private** / **Delete** / **Reply privately** / Report / Block.
- **[D12]** A message is `new`, `private` or `approved`, and moves freely in both directions: the inbox is filtered **New** (default, and the only state the badge counts) / **Private** / **On wall**, and a wall card can be taken back off the wall. The wall is exactly `approved`. "On wall" is a view of the private inbox, not a public surface — keep that clear in the copy. Delete is a soft delete.
- **Locked card state** (design it now, ships unlocked): blurred content, real metadata visible — anonymity level, message length, time, "from someone at [event]". Unlock CTA placeholder. In stage 1 every card renders unlocked.

### 4.4 Events
- My events list: live events on top, upcoming, then archived.
- Join by code or QR scan. Create event: name, section/national, start, end, cover color, **board mode**: `approve_first` (default) or `post_immediately`. Creator can add co-moderators (members of the event) who share the queue.
- Event detail: board tab + people tab (joined members, tap → profile).

### 4.4b Section page
- Section name, country, member count, roster (photo, name, tap → profile). Reached from any profile's section chip or from Settings.
- No posting surface in stage 1; leave room for a "Room" tab (stage 2).

### 4.5 Live Event Board
- Feed of posts, newest first, live-updating (WebSocket).
- Two post types: **to the room** (visible to all joined members) and **to a person** (goes to that person's inbox; appears on the board only if they approve it — shown as "approved from the board" on their wall).
- **Board mode**: in `approve_first`, room posts wait in the creator's queue until released; in `post_immediately` they appear at once. Posts to a person never enter the creator's queue in either mode — only the recipient decides on those. **[D9]** A moderator's own post to the room publishes immediately in both modes.
- **Moderation queue** (creator and co-moderators): one-thumb approve/reject per card, batch approve, count badge, live updates. Rejected posts are invisible to everyone except the sender, who sees "not published". The queue is a core screen; design it for speed. **[D8]** Rejection is final: the moderator's Rejected list is read-only, the sender's recovery path is **Rewrite**, and a mis-tap is undone within 5 seconds from the rejection toast.
- Sender shown at chosen anonymity level. Reactions (single emoji set), reply privately, report.
- Moderator controls: hide post, close board.
- **Projector mode**: a full-screen, large-type, auto-scrolling read-only view for showing the board on an event screen. Design this — it is the "aha" moment at the event.
- Archived state: read-only, still visible to members.

### 4.6 Composer (shared)
- Text only. Target: this wall / this board / this person.
- Anonymity selector: anonymous · hint (pick: section / country / first letter) · named. Remembers last choice.
- Pre-send screening: if the keyword/model filter flags it, show a "this may not be delivered" warning; delivery is decided server-side.

### 4.7 Thread ("reply privately")
- Opened only from a post or inbox message in stage 1; no cold DMs from profiles.
- Sender's anonymity level persists in the thread. Sender has a **Reveal myself** action; recipient can reply without knowing who it is.
- Block / report from the thread header. Text only.
- Requests tab is NOT in stage 1 (comes with cold DMs in stage 2), but design the thread list so a "Requests" tab can be added above it.

### 4.8 Settings & safety
- Who can write to me: anyone / named only / nobody.
- Blocked list, muted words. **[D10]** A muted word never blocks delivery: the message is stored, filed to `private`, and its push is suppressed; the sender is never told. **[D7]** Change section lives here too, with no re-approval.
- Notifications toggles (push is on by default for inbox, threads, board mentions).
- Delete account (real deletion).

### 4.9 Admin (minimal, can be a plain web page, not a designed mobile screen)
- Approve/reject pending registrations.
- Reports queue: content, reporter, sender identity (audit-logged), actions: dismiss / hide / warn / ban.

## 5. Safety rules (server-side, stage 1)
- Keyword + model screening on every post/message before delivery; hard-block list, soft-flag list.
- Per-sender rate limits on anonymous posts and thread openings.
- Report → content and sender id visible to super admin only; every identity view is audit-logged.
- Block is absolute: blocked user cannot write to the blocker in any surface, including anonymously. **[D6]** Absolute means refused server-side, not deleted: existing content is hidden from the blocker, board posts stay on the board, and a report filed before the block still shows the admin everything. Block is issued by message id; the blocker never learns who an anonymous sender was.
- Text only. No images or GIFs anywhere in stage 1.
- KVKK: privacy policy, VERBİS registration, data export and deletion.

## 6. Explicit non-goals for stage 1
- No cold DMs from profiles, no requests tab.
- No interested/mutual-match feature.
- No payments, no store IAP, no reveals as a paid action.
- No browsing walls outside events (discovery), no search.
- No images/GIFs, no voice.
- No section administration of any kind; no section chat rooms.
- No web client for members.

## 7. Later stages (for context only; do not design now)
- **Stage 2**: cold DMs + requests tab + recipient settings; interested/mutual reveal (opt-in profile toggle); browse walls beyond events; invite chain live; event archive browsing; admin dashboard; invite-based onboarding; section chat rooms (text, member-only, moderated by super admin).
- **Stage 3**: monetization ON — locked cards beyond N, hints/reveals, per-event pass, priority first message; IAP via RevenueCat or similar; founder grandfathering for beta users.
- **Stage 4**: other countries via sections, GIFs/images inside open threads, sponsor-branded boards, section-level tools.

## 8. Success metrics for the first event
- Share of attendees who register and get approved.
- Posts per attendee on the live board.
- Inbox messages per user; approve-to-wall rate.
- Threads opened from posts.
- App opens 7 days after the event ends.

## 9. Design direction
- Mobile-first, one-handed. Bright, high-energy, "event night" feel; not a dating-app aesthetic, not corporate.
- The wall should feel like a trophy shelf; the board should feel like a live crowd.
- Anonymity level must be visible at a glance on every card (icon + chips), never ambiguous.
- Locked card must be visually distinct even though it ships unlocked.
- Projector mode: dark background, large type, readable from 15 meters.
- Placeholders: brand name `[BRAND]`, no logo. Neutral primary color; the design system will be set in Claude Design first.

## 10. Notes for the Claude Code handoff
- Expo (React Native), TypeScript, React Navigation, i18n (en/tr), WebSocket client.
- Spring Boot 3, PostgreSQL, STOMP over WebSocket, Flyway migrations, push via FCM/APNs.
- Schema must include from migration 1: anonymity level on every content row, sender id on every content row, section/country graph (section = membership tag), event status + end time, roles (member / event_moderator / super_admin), inviter id, entitlement counters, report + identity-view audit log.
- Also from migration 1: **[D4]** `event.closed_at` / `closed_by` and a post rejection reason; **[D5]** `thread_participant` (level, hint fields, `revealed_at`) alongside the per-message level; **[D6]** `block(blocker_id, blocked_id, created_at)`; **[D12]** `inbox_message.state` and `deleted_at`; **[D7]** a section-change audit row. Country is derived through the section, not stored on the user **[D11]**.
- All monetization gates are config flags; default off.
