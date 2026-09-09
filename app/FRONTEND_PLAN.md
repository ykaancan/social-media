# MVP frontend progress

Updated 2026-09-09. This is the frontend-first sequence agreed in this task;
older source comments use superseded step numbers for the backend.

| Step | Scope | Status |
| --- | --- | --- |
| 1 | Design tokens, component library, gallery | Implemented |
| 2 | Onboarding, session, four-tab shell, section roster | Implemented against development mock |
| 3 | Events list, join/create, event detail and people, QR and sharing | Implemented against development mock |
| 4 | Public/owner walls, inbox, composer, message actions | Implemented against development mock |
| 5 | Board feed, moderation, co-moderators/controls, projector | Next |
| 6 | Private threads, unread badges, reveal | Pending |
| 7 | Settings and safety | Pending |
| 8 | Frontend completion review across devices and languages | Pending |

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
