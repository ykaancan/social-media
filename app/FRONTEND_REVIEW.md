# MVP frontend review

Reviewed 2026-09-10. Steps 1–7 are implemented against the development mock.
Step 8 automated and browser review is complete; native device sign-off remains pending.
This is not production or backend integration sign-off.

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

Android SDK and a Pixel_8 AVD are present, but `adb devices -l` returned no connected
devices. No Android runtime review was performed. No iOS runtime was available.

Start the emulator from Android Studio's Device Manager, then launch the app from
the `app` directory using the project's Expo workflow. Test both English and Turkish:

- Register/profile/pending and approved preview; logout and offline recovery.
- Create/join an event, camera permission and QR scanning, date/time controls,
  clipboard and sharing.
- Wall/inbox actions, moderation rejection undo, reply/reveal/block, settings,
  section change, export share sheet and failed deletion recovery.
- Native keyboard avoidance, Android back, safe-area insets, small-screen scrolling,
  larger system fonts, screen reader labels and reduced motion.
- Projector landscape/readability and awake behavior; background/resume behavior.

Repeat on an iPhone or an iOS simulator on a Mac. Record device/OS, locale, result
and any failure before changing Step 8 to fully signed off.

## Backend and release boundaries

Persistence, server authorization, screening, rate limits, audited identity access,
real deletion/export, push permission/token registration and delivery, and live
STOMP multi-device behavior still require backend implementation and integration.
The development mock is memory-only; it does not seed messages or conversations.
The minimal admin interface and published privacy/terms documents are outstanding.

No backend, migrations, admin interface or read-only design files changed in this
review. No intentional product-contract deviations. Changes have not been pushed.
