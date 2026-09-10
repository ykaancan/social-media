# MVP frontend progress

Updated 2026-09-10. This is the frontend-first sequence agreed in this task;
older source comments use superseded step numbers for the backend.

| Step | Scope | Status |
| --- | --- | --- |
| 1 | Design tokens, component library, gallery | Implemented |
| 2 | Onboarding, session, four-tab shell, section roster | Implemented against development mock |
| 3 | Events list, join/create, event detail and people, QR and sharing | Implemented against development mock |
| 4 | Public/owner walls, inbox, composer, message actions | Implemented against development mock |
| 5 | Board feed, moderation, co-moderators/controls, projector | Implemented against development mock |
| 6 | Private threads, unread badges, reveal | Implemented against development mock |
| 7 | Settings and safety | Implemented against development mock |
| 8 | Frontend completion review across devices and languages | Automated/browser review complete; native sign-off pending |

Backend and minimal admin web implementation follow the mobile frontend flows.

## Step 3 implementation

- Events list queries the API on focus and every 30 seconds while focused.
  Groups are Live, Upcoming, Archived. No event data is seeded automatically.
- CreateSheet submits scope, start/end timestamps, cover, name and board mode.
  It keeps the draft after errors and prevents duplicate submissions. Native
  date/time controls are provided for iOS/Android; the web preview has a text fallback.
- JoinSheet accepts typed codes or QR scans, handles invalid/already-joined codes,
  reports request failures, and opens the joined event. Camera access is requested
  only after the user chooses to allow it. QR payloads contain the six-character code.
- Event detail shows status, dates, scope, Board/People tabs, and a searchable
  joined roster. Member profiles expose name, avatar, bio and section/country.
  Their wall contents/actions belong to Step 4; board contents/actions to Step 5.
- Join-code screen renders an actual QR, copies the code, and invokes native
  sharing. After creation, Done opens the event. Pushed screens hide the tab bar.
- Event API types and HTTP routes are in `src/api/types.ts` and `src/api/http.ts`.
  The mock implements approval/membership checks, derived scope/country, exact
  counts, idempotent membership, and timed event statuses. These checks do not
  replace backend authorization or integration testing.
- Gallery includes generated QR, EventHeader, load/error states and interactive
  date-picker/scanner specimens. Added copy is paired in English and Turkish.

## Verification

- Jest: 315 tests passed across 31 suites. TypeScript and `git diff --check` passed.
  Events tests cover create/navigation, joining
  from a second account, roster search, errors, access rules, counts, status
  transitions, date presentation, HTTP mapping and scanner permission/parsing.
- Expo web export and iOS/Android Hermes bundle exports.
- Ran Expo and inspected gallery QR plus create, join-code and event detail/people
  views in the browser at 390 × 844, against the design handoff's layout rules.
- Physical camera scanning, native date-picker interaction, native clipboard/share
  sheets and full iOS/Android visual QA still require device testing. Bundle export
  is compilation verification, not a device installation or runtime check.

## Boundaries and deviations

No backend, migrations, design-reference edits, real content, or admin interface
were added. The existing root AGENTS.md was left untouched.

No intentional product-contract deviations in this step. The web date/time text
fallback is only for development preview; Stage 1 remains iOS/Android. New native
camera permission text in app.json is build configuration; in-app explanations
and permission actions are localized through the shared translation tables.

The development mock is memory-only. Restarting Metro or reloading the app can
discard mock accounts and events. Production requires EXPO_PUBLIC_API_URL.


## Step 4 implementation

- Public walls are reached through joined event rosters. The owner's Profile wall,
  Inbox New/Private/On wall filters and New badge share one inbox query, refreshed
  on focus, foregrounding, mutations and every 15 seconds while active.
- Messages move freely between new/private/approved. Approving publishes to the
  wall; keeping private takes it off. Soft deletion hides inbox/wall content;
  reports retain the original record. Blocking uses a message ID, hides that
  sender's content for the blocker, and prevents further writes to them.
- Wall composer remembers account-specific anonymity and allowed hint choices.
  Screening warning acknowledgement is tied to the exact draft. Delivery errors
  retain text, and duplicate submissions are guarded. Named-only/nobody policies
  are respected. All new product copy has matching English/Turkish keys.
- Message DTOs, HTTP methods and development mock live in src/api/messages.ts,
  http.ts and mock.ts. The mock snapshots sent anonymity, derives allowed hints
  from the sender's section and applies Turkish-aware muted words privately.
- Gallery includes MessageCard state/wall variants and interactive composer
  screening/error specimens using the existing design tokens and patterns.

### Step 4 verification and remaining work

- TypeScript, full Jest suite (326 tests across 32 suites), web and iOS/Android
  bundle exports. Tests cover DTO privacy, reversible states, reported soft-deleted
  content, blocking, muted-word delivery, screening, HTTP methods, failed drafts,
  and navigation integration that keeps the wall and New badge synchronized.
- Ran Expo and inspected gallery message cards and screening warning at 390 x 844
  against the existing card/composer patterns. Physical iOS/Android runtime and
  keyboard/accessibility testing remain part of the device completion review.
- Private replies and conversations remain Step 6; board-origin messages and
  moderation remain Step 5. Settings editing remains Step 7.
- Production persistence, authorization, keyword/model screening, actual push
  delivery and admin report handling require the backend. The development mock
  accepts injected screening/policy functions for tests; its default screening
  allows content and is not a production safety service. It seeds no messages.
- No intentional product-contract deviations; no backend, migrations or design
  reference files changed. Step 5 has not been started.


## Step 5 implementation

- Event detail now composes Board, Queue (moderators only) and People tabs.
  Live boards support room/person composing, per-post anonymity, real reactions,
  reporting and moderator hiding. Upcoming/archived boards remain read-only.
- Room posts queue in approve-first mode; creator/co-moderator room posts publish
  immediately with an internal auto_approved_by_author record. A mode change
  affects future posts and preserves the existing queue.
- Person-targeted board posts go through Inbox, never through the moderator
  queue. Recipient approval publishes them to the wall and board; moving back
  to Private or soft-deleting withdraws public display. Reports retain content.
- Queue supports approve/reject buttons, swipe decisions, selected batch approval,
  and read-only Approved/Rejected lists. Rejection has a server-contract undo
  token expiring after five seconds. The sender stays pending during that window;
  afterwards rejection is final and Rewrite creates a new post.
- Creator can add/remove joined co-moderators. Moderators can change mode/end time
  and close the live board. Close stamps closedAt/closedBy, archives immediately
  and rejects every pending room post with board_closed, including scheduled
  rejections. Finite end timestamps remain required.
- The HTTP adapter includes authenticated STOMP invalidation subscriptions, fresh
  credentials on reconnect and cleanup on blur/background. Authorized REST
  snapshots reconcile the board after events; a five-second active polling
  fallback covers missed events and timed status transitions. Socket frames carry
  no content. The mock supplies subscription notifications without a server.
- Projector route requests native landscape, hides the status/tab bars and keeps
  the native display awake while focused. It fits a 1920 x 1080 dark canvas and
  cycles published posts one at a time to accommodate the full 280-character
  limit. Pause/Next/Exit controls are available; reduced motion disables automatic
  cycling. Hidden, pending and rejected posts never enter its rendered feed.
- Gallery adds UnpublishedPost and ProjectorStage specimens. Added product copy
  is paired in English/Turkish. Existing design files were not edited.

### Step 5 verification and boundaries

- Full Jest suite: 343 tests across 35 suites; TypeScript and diff checks pass.
  Added tests cover room/person visibility, DTO privacy, moderation permissions,
  rejection deadlines/undo, conflicting batch approvals, close/archival, reactions,
  preserved reports, HTTP mapping, STOMP credentials/reconnect/cleanup, projector
  cycling and full-navigation compose/approve/undo/close/projector flows.
- Web and iOS/Android Hermes bundle exports pass. Expo browser checks exercised
  signup, event creation and posting at 390 x 844, the rejected-card gallery, and
  the projector at 1920 x 1080. These are not physical-device runtime checks.
- Production persistence, server authorization, durable rejection scheduling,
  actual push notifications and a deployed STOMP broker remain backend work.
  The WebSocket client is tested with a mocked transport; no live server exists
  yet. Device orientation, sleep prevention and real multi-device updates need
  iOS/Android testing. Private replies/reveal remain Step 6; Settings is Step 7.
- Product-contract deviations: none intentional. The old prototype's co-moderator
  restriction on board settings is superseded by the brief's role definition;
  UI copy now matches that permission. Its optional No end control is replaced
  in the app flow by a dated end-time picker, consistent with time-boxed events.
- No backend, migrations, admin interface or automatic seeded messages were added.


## Step 6 implementation

- Private replies open from accessible published board posts or recipient Inbox
  messages. The first reply uses the shared anonymity selector and 280-character
  limit. No profile cold-DM action or Requests tab was added.
- Threads list shows the other participant, last message, event source for masked
  participants and real unread counts. The shell badge shares that query. Opening
  a foreground thread acknowledges only its loaded message watermark; later
  arrivals remain unread until loaded. Focus, foreground, private STOMP
  invalidations and active polling reconcile authorized snapshots.
- Thread detail pins the original post snapshot, renders each bubble from its
  own sent identity, and provides a 500-character composer. Screening warnings
  require acknowledgement for the exact draft. Failed requests retain drafts;
  stable request keys prevent duplicate retries and reset after successful sends.
- Reveal is confirmed with a named preview, updates future sending identity and
  adds one localized system row. Historical messages and the original post keep
  their sent anonymity. Reveal is one-way and idempotent.
- Whole-thread reporting and message-reference blocking are wired. Blocking hides
  the blocker's thread list and shared Inbox/wall content, refuses further writes
  to them, and retains board posts and reported records. It does not notify or
  identify the blocked sender.
- Thread API DTOs, HTTP contracts and in-memory mock are implemented. Gallery now
  contains 58 components, including ThreadRow and ThreadComposer, plus a thread
  header variant. New product strings have matching English/Turkish keys.

### Step 6 verification and boundaries

- Jest: 355 tests across 37 suites pass (full run followed by the corrected
  navigation-suite rerun). Coverage includes immutable reveal history, origin
  access, DTO privacy, retry deduplication, consecutive identical sends, monotonic
  read watermarks, screening and lengths, cross-surface blocking, HTTP/private
  STOMP contracts, retained failed drafts and real-navigation reply/reveal/block
  and unread badge flows. TypeScript and diff checks pass.
- Web, Android and iOS Hermes bundle exports pass. Ran Expo and visually checked
  thread rows, hint header, composer warning and retained-error draft at 390 x 844,
  including English and Turkish, against the thread prototype/component tokens.
- Backend persistence, authorization, actual keyword/model screening, rate limits,
  push delivery and a deployed STOMP broker remain backend work. The development
  mock is memory-only and does not seed messages or conversations. Live multi-device
  updates and native keyboard/accessibility checks remain device-review work.
- Step 7 Settings and safety is next and has not been started. No backend, admin,
  migrations or read-only design references changed. No intentional deviations
  from the product contract.


## Step 7 implementation

- Profile now opens Settings through its gear button. Pushed settings pages hide
  the bottom tabs and compose the existing screen, group, row and sheet patterns.
- Writing permissions (anyone / named only / nobody), Turkish-aware muted words
  and three notification preferences save through the authenticated settings API.
  Muted matches are delivered to Private and suppress push, without telling the
  sender. Changes do not rewrite messages already delivered.
- Blocked list uses opaque block IDs and the sender display allowed when blocking.
  Anonymous blocks never become named profile rows. Unblock restores visibility
  of existing content and allows future writes; it does not recreate content.
- Approved profile editing saves name, bio and the existing avatar workflow without
  reapproval. Section changes use a separate endpoint, derive the country, record
  an audit entry and enforce one change per 30 days. The UI explains both the
  country change and continued approval; profile submission cannot bypass the limit.
- Language selection switches every translated label and persists on the device.
  Logout clears the local session. Account deletion requires two confirmations,
  including DELETE / SİL, and only signs out after successful deletion. Failure
  retains the session and permits retry. The mock actually deletes account data,
  authored messages/posts, conversations, blocks, reports and personal audit rows.
  Other members' posts stay; an event whose creator deletes their account archives
  and resolves pending posts, with no invented replacement creator.
- Export my data requests privacy-filtered account data and opens the native share
  sheet. Production export completeness and storage are backend responsibilities.
  Privacy/terms links use EXPO_PUBLIC_PRIVACY_URL and EXPO_PUBLIC_TERMS_URL (HTTPS),
  documented in .env.example; unavailable documents are shown honestly as unpublished.
- Added ChoiceRow and BlockedRow to the component library/gallery, plus a typed
  ConfirmSheet specimen. Gallery now covers 60 components. New copy is paired in
  English and Turkish. Muted words use removable outline chips.

### Step 7 verification and boundaries

- Full Jest suite: 366 tests across 38 suites pass. TypeScript, diff checks and
  web/Android/iOS Hermes bundle exports pass. Tests cover permissions, muted-word
  normalization and push suppression, private block DTOs/unblock, section audit
  and exact 30-day boundary, immutable sent hints, export privacy, real deletion
  and preserved event content, HTTP routes, Settings navigation, profile editing,
  typed deletion confirmation and keeping the session after a failed deletion.
- Ran Expo and reviewed Settings, writing choices, language switching, Turkish
  typed confirmation and gallery ChoiceRow/BlockedRow at 390 x 844 against the
  settings prototype and existing tokens. Native keyboards, screen readers and
  platform share/notification behavior remain in the Step 8 device review.
- Production persistence, push permission/token registration and delivery, audited
  backend deletion/export and actual published legal documents remain outstanding.
  This step does not implement a backend, migrations, admin UI or legal compliance
  registration. Legal links need real published URLs before release.
- No intentional product-contract deviations. The prototype's reapproval on section
  changes is superseded by D7/D11; named rows for anonymous blocks would violate D6.
  Notification controls cover the three Stage 1 categories in the brief; the
  prototype's extra event-reminder category is not added.
- Step 8 review results are recorded below. Changes remain uncommitted and have not been pushed.


## Step 8 review

- Fixed offline startup recovery, transient token-refresh session loss, restricted-account copy and section-roster navigation within shared events. Added the restricted PendingState variant to the gallery.
- Full Jest suite: 375 tests across 40 suites pass. TypeScript and whitespace checks pass. Web, Android and iOS bundle exports pass.
- Added English/Turkish navigation regressions and checked responsive gallery sheets in the browser. Native runtime validation remains pending: no Android device/emulator was connected, and no iOS runtime was available.
- See [FRONTEND_REVIEW.md](FRONTEND_REVIEW.md) for evidence, remaining device checks and backend boundaries. No intentional product-contract deviations; no backend, admin, migration or design-reference changes in this review.
