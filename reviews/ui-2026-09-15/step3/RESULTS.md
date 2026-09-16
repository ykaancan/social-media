# Step 3 — shared-component polish

Implemented September 15; verification record finalized September 16, 2026.

## Changes

- Buttons, icon buttons, interactive chips and reaction controls reserve at
  least 44×44 layout space for touch targets. Their smaller visual treatments
  remain, without overlapping hit slop. Button labels and source chips can wrap
  and grow instead of relying on a fixed height.
- Sheet has an optional footer outside its body scroller. Composer and private
  reply use it for Send, screening warnings and delivery errors. Existing
  acknowledgement, busy, retry and retained-draft behavior is preserved.
- Cards without reactions or reply controls put More beside the timestamp,
  eliminating the otherwise empty footer row. Cards with board interactions
  keep their reaction/reply footer.
- Long hint chips stay within their available width and truncate visually;
  their allowed full value remains in the accessibility label. Source chips
  wrap. The gallery includes a separate long-hints/source inbox specimen.

## Verification

- TypeScript passed.
- Fresh production bundle export passed for web, Android and iOS on September
  16 (`app/.expo/step3-final`). This checks compilation, not device behavior.
- Full frontend suite: 382 tests across 42 suites passed. Updated tests cover
  expandable chip dimensions, footer placement of warning/error feedback,
  screening acknowledgement and the working inbox overflow/action controls.
- Ran Expo and visually compared gallery specimens with the previous audit
  captures and HANDOFF's existing type, color, spacing and touch-target rules.
- English cards checked at 390×844; Turkish composer, screening warning, private
  reply and long inbox content checked at 320×640.
- Measured long-card action targets: 44px high, with no horizontal card overflow.
  The warning-state Send button measured 288×52 at y=564 in a 640px viewport.
- Whitespace validation passed. No backend or migration changes; backend tests
  were not rerun for this frontend-only change.

## Before / after

| State | Before | After |
|---|---|---|
| English cards, 390px | [Before](../cards-en-390.jpg) | [After](cards-en-390.jpg) |
| Turkish composer, 320px | [Before](../composer-tr-320.jpg) | [After](composer-tr-320.jpg) |
| Turkish private reply, 320px | [Before](../reply-tr-320.jpg) | [After](reply-tr-320.jpg) |

[Screening warning](warning-tr-320.jpg) keeps acknowledgement visible.
[Long inbox card](long-card-tr-320.jpg) demonstrates wrapping source metadata.

## Remaining work and boundaries

Native keyboards, screen readers, large system fonts and device safe areas are
not signed off by browser screenshots or bundle exports. Footer migration in
other sheets is deferred until their individual flow review. Additional slow
mutation and refresh-error gallery specimens belong with Step 4's screen-state
changes. This is not a claim that every interactive element in the app has been
audited; this pass covers the named shared controls.

No design tokens, read-only design references, API behavior or translation keys
changed. No product-contract deviations introduced. Changes remain local and
uncommitted, alongside the existing Step 1 work. Step 4 (screen composition,
thread reading position, refresh recovery and copy) has not started.
