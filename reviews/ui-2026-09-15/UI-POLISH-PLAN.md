# UI audit and polish plan

Reviewed 2026-09-15. Step 2 deliverable: a prioritized implementation proposal,
not a claim that the UI has already changed.

## Direction

Keep the Barlow Condensed headlines, Figtree body, flat bordered cards, neutral
ink palette and event cover accents. The biggest improvement will come from
giving content more room, reducing competing controls, and making actions easier
to reach. Preserve the four tabs and all anonymity and moderation rules.

Design authority: `design/HANDOFF.md`, particularly sections 1.3–1.6 and 2.5,
plus the corresponding components and prototypes in `design/bundle`. The
prototype is a reference; AGENTS.md decisions supersede it. No edits to design.

## Evidence and limits

Visually inspected the running Expo web gallery and signed-out app. Saved
screenshots at 320×640, plus the earlier card capture at 390×844. The gallery
uses its existing specimen data; its examples are not real member content.
English onboarding/cards and Turkish composer, reply, creation, wall header,
thread rows and controls were sampled. This is not an exhaustive locale matrix.

Also read the implementation of the four tabs, event detail/board moderation,
profile setup, settings, threads and shared layout components. Authenticated
screen findings below are source-based unless a gallery screenshot is cited.
No accounts or content were created. Native keyboards, screen readers, large
system fonts, device safe areas, authenticated end-to-end screens and projector
readability at distance still need runtime review. Tablet review is not signed off.

## Prioritized backlog

### P1 — Comfortable interaction and stable layouts

**UI-01: Make every interactive target at least 44×44.**

`Chip.tsx` renders interactive chips at 26/32px with no larger press wrapper;
`Button.tsx` and `IconButton.tsx` use 36px small variants. `PostCard.tsx`
reaction pills are 32px tall and reaction choices are 36×32. These are used for
frequent actions, including reply and overflow. Preserve their visual dimensions
where useful, but provide non-overlapping 44px interaction areas. Allow button
height to grow when text scales. This implements HANDOFF's existing tap minimum.

Acceptance: inspect actual bounds and adjacent-target separation at 320 and 390;
test larger system text and keyboard focus on devices. Do not count overlapping
hit slop as a successful fix.

**UI-02: Separate sheet actions from long scrolling content.**

The small-phone composer and reply screenshots show Send below the initial
viewport. Scrolling reaches it successfully; this is friction, not a broken
button. `Sheet.tsx` puts all children into one scroller, and `Composer.tsx`
places Send after the preview and moderation explanation.

Add an optional shared sheet footer, migrate composer/reply first, then creation
and confirmations where appropriate. Keep the target and anonymity clear; keep
the screening warning visible before an acknowledged send. Retain the card
preview while reducing empty-preview height and redundant spacing.

Acceptance: the action remains reachable above a native keyboard, body content
can scroll completely, errors remain visible, and retained drafts survive failures.

**UI-03: Preserve conversation reading position.**

`ThreadScreen.tsx` calls `scrollToEnd` for every content-size change. A new
message or layout change can pull someone away from older messages. It also
reserves a fixed 240px at the bottom.

Only follow new messages when already near the bottom or after the user's own
send. Offer an accessible jump-to-latest action otherwise. Measure composer
height rather than assuming a fixed gap, including warning/error states.

Acceptance: receiving a message while reading history does not move the view;
own sends remain visible; the last bubble clears the composer and keyboard.

**UI-04: Keep loaded content during refresh failures.**

Events, Inbox and Profile replace their content when an error flag is set,
even if data is present. Threads and event detail already preserve content with
a retry notice. Standardize the latter pattern in shared components. Add visible
per-card pending feedback for inbox state changes; the current hook deduplicates
requests internally but does not expose that status to the card.

Acceptance: transient failures keep the last loaded list, first-load errors still
have retry, and mutations cannot appear to succeed before the server confirms.

### P2 — Stronger visual hierarchy

**UI-05: Compact inbox card actions.**

The English card screenshot shows a separate footer devoted to More, followed
by another row for Approve/Keep private. Move overflow into the header when a
card has no reactions/reply footer. Preserve sender, time, source and action
labels. Keep post text at the design's 18px and wall text at 22px.

Acceptance: short inbox messages consume less height without smaller text or
targets; long hints and translated actions wrap without collision.

**UI-06: Put the board feed ahead of moderator utilities.**

`BoardPanel.tsx` renders Projector, Board controls and Co-moderators as stacked
buttons before content. For moderators these compete with the board/queue.
The live-board reference uses a compact header projector action.

Compose a shared event action row/menu from existing controls. Keep Write as the
primary thumb action, Queue visible with its real count, and utilities readily
accessible without three full rows above the feed. Keep rejection undo for five
seconds and Rejected read-only.

Acceptance: the first content card appears earlier on small screens; no actions
are lost, permission rules stay unchanged, and controls have explicit labels.

**UI-07: Make screen spacing depend on actual chrome.**

`Screen.tsx` reserves 130px below every body, including screens without an
overlaid action bar. Events also gives its empty state 88px top padding.
Use explicit inset/empty-layout variants rather than one fixed value everywhere.
Keep natural breathing room on the wall, but avoid unexplained blank scroll tails.
Move duplicated tab-header layout into the component library as required by D1.

Acceptance: the last row clears the real bottom chrome, empty content balances
within available space, and pushed screens do not inherit tab-only padding.

**UI-08: Strengthen the wall as a personal collection.**

The current header already has a strong name, avatar, section and count. At
320px the short sample name wraps to two lines; long names/sections need explicit
stress specimens. Keep this identity hierarchy, then establish one consistent
transition into the wall cards and approved count. Use spacing and typography,
not invented trophies, decoration, counts or extra profile actions.

Acceptance: long names remain legible, section/country does not overflow, and
the first message feels connected to the header in empty and populated states.

### P2 — Clear language and accessibility

**UI-09: Correct onboarding and reduce internal terminology.**

Sign-up says “Two fields” above three fields (one optional). The phone helper
says “For the day you forget the one above,” implying phone password recovery,
while recovery currently uses email. Use an explicit optional label and explain
only supported behavior. Turkish event creation currently says “Section'ım”; use
natural Turkish consistently. Preserve “sen” and paired translation keys.

Acceptance: both locales describe the same real flow, optional fields are clear,
and membership country is never described as nationality.

**UI-10: Make thread rows distinguishable without revealing identity.**

`ThreadRow.tsx` gives every row the same accessibility label, “Open thread.”
Compose a useful translated label from allowed sender display, event context,
unread count and time. Consider a two-line message preview at narrow widths:
the screenshot truncates most of the sample message after one line.

Acceptance: a screen-reader user can distinguish conversations; the label never
includes an ID, hidden hint or newly revealed identity for historical content.

**UI-11: Make the gallery a stronger regression tool.**

Add long names/sections, all permitted hint combinations, multi-digit counts,
long Turkish actions, slow mutations, retained lists with refresh errors, and
small-screen sheet footer specimens. Existing fixtures sometimes contain English
sample content in Turkish mode; that is not automatically an untranslated UI bug.
Keep specimen labels separate from product copy.

Acceptance: each shared-component change has a before/after capture using the
same viewport, locale, data and state; verify native text scaling separately.

## Coverage by surface

| Surface | Evidence this pass | Planned improvement / remaining check |
|---|---|---|
| Splash and sign-up | Running app, English 320px | UI-09; keyboard and Turkish screen check remain |
| Profile setup / pending | Source and gallery patterns | UI-01/07/08/09; actual upload/pending layout remains |
| Events | Source, gallery event/create specimens | UI-04/07; populated tab runtime remains |
| Board / moderation | Source, Turkish controls gallery | UI-06; live queue and undo on devices remain |
| Inbox | Source, English card gallery | UI-04/05; full filtered list runtime remains |
| Profile / visitor wall | Source, Turkish header gallery | UI-08; populated wall runtime remains |
| Composer / reply | Turkish gallery, 320px scroll check | UI-02; native keyboard remains |
| Threads | Source, Turkish row/bubble gallery | UI-03/10; history and incoming-message runtime remains |
| Settings / section | Source, shared row/picker gallery | UI-01/07/09; full screen and long labels remain |
| Projector | Source/reference and existing specimens | Physical landscape, long content and distance sign-off remain |

## Implementation order

1. **Step 3: Shared components.** UI-01, UI-02, UI-05 and UI-11. This gives the
   largest visible gain across screens. Verify old/new gallery captures and
   meaningful interaction regressions before moving on.
2. **Step 4: Screen composition.** UI-03, UI-04, UI-06–UI-10. Complete the
   authenticated screen matrix while applying these changes.
3. Continue the agreed safety, release and pilot steps. UI polish does not
   substitute for those checks.

No new features, design-token changes, seeded member content or design-reference
edits are proposed. No app source changed in this audit. Step 1's existing
uncommitted changes are retained.

Verification: gallery and translation-key suites passed (7 tests across 2 suites).
`git diff --check` passed. No product-contract deviations introduced. Full tests
were not repeated for this documentation-only change; Step 1 records the full
381 frontend / 294 backend baseline.

## Screenshot index

- `cards-en-390.jpg`: separate inbox overflow/action rows.
- `composer-tr-320.jpg`: initial small-phone composer.
- `composer-tr-320-bottom.jpg`: Send remains reachable after scrolling.
- `reply-tr-320.jpg`: context card plus input and anonymity controls.
- `create-tr-320.jpg`: creation density and Turkish scope wording.
- `splash-en-320.jpg`, `signup-en-320.jpg`: actual signed-out app.
- `wall-tr-320.jpg`: profile identity hierarchy.
- `threads-tr-320.jpg`: compact previews and anonymous/named rows.
- `controls-tr-320.jpg`: control specimen; its fixed time options are gallery
  data, not evidence that the real event controls expose the same options.
