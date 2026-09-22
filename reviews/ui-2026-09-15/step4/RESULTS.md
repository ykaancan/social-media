# Step 4 — screen composition

Implemented and reviewed 2026-09-16. Changes remain local and uncommitted.

## Changes

- **UI-03:** Conversations follow incoming messages only near the end. Reading history is preserved, with a translated jump-to-latest action. A successful own send resumes following. Composer height and viewport changes are accounted for.
- **UI-04:** Events, Inbox and Profile retain loaded content after refresh failures and show the shared retry notice. Inbox state-change buttons show saving and are disabled until the request finishes; state/counts remain server-driven.
- **UI-06:** Shared EventActions places projector and permitted moderator utilities in a compact row. Queue, write, permission checks and rejection undo retain their behavior.
- **UI-07:** Screen measures its BottomBar instead of reserving 130px everywhere (240px in conversations). Screens without bottom actions use a modest gap plus the bottom safe area. Events empty content centers within available space. Events, Inbox and Threads use shared TabHeader.
- **UI-08:** Wall section/country uses the full header width beneath the identity row, allowing long membership labels to wrap without competing with the name. The existing approved count leads into wall content. Added a long-name/section specimen.
- **UI-09:** Sign-up no longer claims there are two fields or implies phone password recovery. Phone is explicitly optional in both languages. Event creation uses “Şubem” in Turkish.
- **UI-10:** Thread previews allow two lines. Translated accessibility labels distinguish conversations using their allowed sender display, event, unread count and update time. Anonymous labels do not read a name or hints.
- Gallery includes the new shared patterns and the saving state; no member data was created or seeded.

## Verification

- TypeScript check passed.
- Full frontend suite: **384 tests across 43 suites passed**. Includes real navigator tests using the test API for inbox/wall refresh failures, deferred server confirmation, board controls/moderation, threads and account flows. New scroll-policy and measured-bottom-clearance tests passed.
- Production bundle export passed for **web, Android and iOS** (`app/.expo/step4-final`). Export confirms compilation, not device execution.
- `git diff --check` passed.
- Gallery visually reviewed at **320×640** in English/Turkish and **390×844** in Turkish. Compact utilities fit on one row, saving actions remain legible, long identity/section text stays within bounds, and thread previews show two lines.
- Backend tests were not repeated: no backend or schema changes.

## Screenshots

- [Compact actions, English 320](actions-en-320.jpg)
- [Compact actions, Turkish 320](actions-tr-320.jpg)
- [Long wall identity, Turkish 320](wall-tr-320.jpg)
- [Composition and saving state, Turkish 390](composition-tr-390.jpg)
- [Thread rows, Turkish 320](threads-tr-320.jpg), compared with the [Step 2 thread specimen](../threads-tr-320.jpg).

The new long-identity specimen has no identical Step 2 fixture; it is a stress case, not a matched before/after comparison.

## Not done / limits

- Native iOS/Android keyboard, safe-area behavior, larger system fonts and screen-reader operation remain device checks. Browser measurements and test events do not sign those off.
- The authenticated screen matrix was exercised through automated navigator tests; a complete live-backend, authenticated visual walkthrough remains outstanding. Screenshots are dev-gallery specimens, not a production session.
- Tablet layout and physical projector readability remain unverified.
- No release, deployment, GitHub changes or next-step implementation was performed.

No product-contract deviations: design tokens and `/design` are unchanged; no Stage 2 features, identity-model changes or schema changes were introduced.
