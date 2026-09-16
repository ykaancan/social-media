# MVP frontend review

Reviewed 2026-09-10; status lines updated 2026-09-14. Steps 1–7 are implemented,
and every flow was later walked on an Android emulator against the real backend
(`backend/BACKEND_PLAN.md`, B-1 to B-6). Physical-device sign-off remains pending.

## Fixes from this review

- Offline startup now shows a translated retry state instead of a blank screen.
- Transient token-refresh failures preserve the session for retry. An explicit
  refresh rejection still signs out.
- Restricted accounts see restriction copy instead of approval-queue promises.
  The mock refuses profile resubmission by restricted accounts. The gallery includes
  this PendingState variant.
- Section rosters open another member's wall only through a supplied shared event.
  The owner's row opens their Profile tab; other rows remain non-interactive.
  The backend must enforce access and supply the optional `wallEventId` contract.

## Verification

- Full Jest run: **375 tests, 40 suites passed**.
- TypeScript no-emit check passed.
- Web export and Android/iOS Hermes bundle exports passed, output under
  `.expo/step8-final`. Exports verify compilation, not native runtime behavior.
- English/Turkish translation key and interpolation parity passes. Static scanning
  found no missing literal translation keys in production source.
- New regressions cover offline boot retry and restricted-account routing in both
  languages, token-refresh recovery/rejection, shared-event roster access, and
  moderation → private reply → reveal → block flows in both languages.
- Existing suites cover onboarding, events, walls/inbox, moderation/projector,
  threads and settings, including API/mock rules and navigation. These are not
  live multi-device or deployed-server tests.
- Ran Expo gallery in the browser. Checked the Turkish reply sheet at 320 × 640
  and 768 × 1024: narrow content scrolls to the send action and tablet content fits.
  Earlier step reviews include English/Turkish specimens at 390 × 844. This is
  sampled responsive review, not an exhaustive native screen matrix.

## Remaining device sign-off

Done since this review, on the Pixel_8 emulator against the real server, in
English and Turkish: register, profile, pending and approved; join by code;
walls, inbox and approve-to-wall; live board, queue, reject with undo, close;
reply from a post, live counterpart reply, reveal; settings and section change;
projector mode in landscape; cold start in Expo Go.

Still pending, and on the founder list in `RELEASE.md`:

- A physical Android phone: camera permission and QR scanning, clipboard and
  sharing, export share sheet, native keyboard avoidance, Android back,
  safe-area insets, larger system fonts, screen reader labels, reduced motion,
  background/resume, and a real push notification (needs a development build,
  not Expo Go).
- An iPhone or an iOS simulator on a Mac: the whole matrix above.

Record device/OS, locale, result and any failure before changing Step 8 to
fully signed off.

## Backend and release boundaries

The boundaries this review listed (persistence, server authorization,
screening, rate limits, audited identity access, real deletion and export, push
registration and delivery, live STOMP multi-device behaviour, the admin page)
are implemented and merged as backend steps B-1 to B-6. What remains before a
first event is the founder's list in `RELEASE.md`: brand name, published
privacy and terms documents, domain and server, SMTP, Expo and store
credentials, and the device checks above.
