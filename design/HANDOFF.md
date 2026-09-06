# [BRAND] — Design hand-off

**Source:** Claude Design project `53473b1a-7982-4553-910f-db1346106023` — "Design system for event platform" (owner: Kaan Can Yıldırım), read via the `claude_design` MCP on 2026-09-06.

This file is the written record of that project. It is a **reference, not a decision**: where the prototype and `CLAUDE.md` disagree, both readings are recorded in §7 and left unresolved.

## 0. What the bundle actually contains

| Area | Files | Status |
|---|---|---|
| Tokens | `styles.css` + `tokens/{fonts,colors,typography,spacing,motion,themes}.css` | Complete, authoritative |
| Components | 22 components in `components/{core,anonymity,cards,projector}/` — each `.jsx` + `.d.ts` + `.prompt.md` | Complete |
| Guidelines | 14 specimen cards in `guidelines/` | Restate the tokens; three carry extra rules (noted below) |
| Strings | `strings/en.json`, `strings/tr.json` | **Incomplete** — see §7 (CC) |
| Screens | 9 `*.dc.html` wrappers → 8 `prototypes/*.jsx` apps | Complete, but internally inconsistent — see §6 |
| Docs | `readme.md`, `SKILL.md`, `uploads/product-brief.md` | `product-brief.md` is identical to the brief in `CLAUDE.md` |
| Runtime | `support.js`, `guidelines/dev-loader.js` | Claude Design canvas runtime (`dc-runtime`) + in-browser Babel shim. **Not product code. Do not port.** |

The `*.dc.html` files are 12-line wrappers. Each loads `styles.css`, Lucide UMD, Babel standalone and `dev-loader.js`, then mounts one `prototypes/*.jsx` at `hint-size="100%,908px"`. All screen content lives in the `.jsx`. The one exception is `Test Script.dc.html`, which is a static document (§6.9).

Every prototype renders a 390×844 phone frame plus a white "Demo controls" aside. **The frame chrome, the status bar (`21:41`, Signal/Wifi/Battery), the `#e8e8e8` page background and the aside are prototype scaffolding — not part of the product.**

---

## 1. Foundations — tokens

### 1.1 Fonts (`tokens/fonts.css`)

Google Fonts, one `@import`: **Barlow Condensed** 600/700/800 (display) and **Figtree** 400/500/600/700 (body). Both ship latin-ext, so `ş ğ İ ı ç ö ü` render natively. `readme.md` → Caveats: **self-host both in the Expo app.**

```
--font-display: "Barlow Condensed", "Arial Narrow", sans-serif-condensed, sans-serif
--font-body:    "Figtree", "Helvetica Neue", Arial, sans-serif
```

### 1.2 Ink scale — the primary (`tokens/colors.css`)

Pure neutral, zero chroma. **The primary colour *is* ink.**

```
--ink-0   #ffffff   --ink-400 #8a8a8a   --ink-800 #262626
--ink-50  #f4f4f4   --ink-500 #6b6b6b   --ink-900 #171717
--ink-100 #e9e9e9   --ink-600 #505050   --ink-950 #0b0b0b
--ink-200 #d4d4d4   --ink-700 #383838
--ink-300 #b3b3b3
```

Semantic aliases (light app theme):

```
--bg / --surface / --surface-raised -> --ink-0     --text         -> --ink-900
--bg-sunken / --surface-muted        -> --ink-50    --text-2       -> --ink-500
--border                             -> --ink-100   --text-3       -> --ink-400
--border-strong                      -> --ink-200   --text-inverse -> --ink-0

--primary --ink-900 | --primary-hover --ink-800 | --primary-press --ink-950 | --on-primary --ink-0
--focus-ring: 0 0 0 3px rgba(23,23,23,.18)
```

### 1.3 The 8 event cover colours

The **only** saturated colour in the app. One per event. Ink text sits on all of them (`--on-cover: --ink-950`).

| Token | oklch | Soft tint token | Soft oklch |
|---|---|---|---|
| `--cover-magenta` | `0.68 0.19 350` | `--cover-magenta-soft` | `0.95 0.04 350` |
| `--cover-coral` | `0.68 0.19 25` | `--cover-coral-soft` | `0.95 0.04 25` |
| `--cover-tangerine` | `0.72 0.19 60` | `--cover-tangerine-soft` | `0.96 0.04 60` |
| `--cover-amber` | `0.80 0.17 90` | `--cover-amber-soft` | `0.97 0.05 90` |
| `--cover-lime` | `0.78 0.19 130` | `--cover-lime-soft` | `0.96 0.05 130` |
| `--cover-mint` | `0.76 0.15 170` | `--cover-mint-soft` | `0.96 0.04 170` |
| `--cover-azure` | `0.68 0.17 240` | `--cover-azure-soft` | `0.95 0.03 240` |
| `--cover-violet` | `0.64 0.19 295` | `--cover-violet-soft` | `0.95 0.04 295` |

Canonical order (used by the splash colour strip and the create-event picker): magenta, coral, tangerine, amber, lime, mint, azure, violet.

**The `--event` / `--event-soft` indirection is the core mechanism.** A screen inside an event sets those two variables once on its root; every child component reads `var(--event)`. `EventCard` sets them for its own children. React Native has no CSS custom properties — this needs an event-colour React context in the RN port, and every `tone="event"` / `variant="event"` component must consume it.

`guidelines/colors-event.html`: *"Never use covers for anonymity, status or errors."*

### 1.4 Fixed colours (never change per event)

```
--live        oklch(0.72 0.19 145)   --live-soft    oklch(0.95 0.06 145)   --success -> --live
--danger      oklch(0.60 0.22 27)    --danger-soft  oklch(0.95 0.04 27)
--warning     oklch(0.80 0.16 80)    --warning-soft oklch(0.97 0.05 80)
```

Anonymity — constant across events:

```
--anon-anonymous     --ink-900             --anon-anonymous-bg --ink-100
--anon-hint          oklch(0.50 0.16 295)  --anon-hint-bg      oklch(0.95 0.04 295)
--anon-named         --ink-900             --anon-named-bg     transparent
```

Locked card:

```
--locked-bg     --ink-50
--locked-border --ink-300
--locked-hatch  repeating-linear-gradient(135deg, transparent 0 10px, rgba(23,23,23,.04) 10px 12px)
--locked-blur   7px
```

Elevation — flat by default. Cards are white with a 1px `--border` hairline and **no shadow**. Only three things float:

```
--shadow-sheet 0 -12px 40px rgba(11,11,11,.16)
--shadow-toast 0 8px 24px rgba(11,11,11,.22)
--shadow-fab   0 6px 18px rgba(11,11,11,.24)
```

No gradients, no textures, no illustrations, no blur/glass.

### 1.5 Type scale (`tokens/typography.css`)

```
--display-xl  800 64px/0.92 display      --title          600 20px/1.25 body
--display-lg  800 44px/0.95 display      --title-sm       600 17px/1.30 body
--display-md  700 32px/1.00 display      --body           400 16px/1.45 body
--display-sm  700 24px/1.05 display      --body-strong    600 16px/1.45 body
--display-tracking      -0.01em          --body-sm        400 14px/1.40 body
--display-caps-tracking  0.02em          --body-sm-strong 600 14px/1.40 body
                                         --caption        500 12px/1.30 body
--post        500 18px/1.35 body         --caption-caps   700 11px/1.20 body
--post-lg     500 22px/1.30 body         --caption-caps-tracking 0.08em
                                         --meta-nums      "tnum" 1, "cv11" 1
```

Projector (sized for a 1080p screen read from 15 m):

```
--projector-post        700 72px/1.10 body
--projector-post-short  700 96px/1.05 body   <- use for posts of 60 characters or fewer
--projector-meta        700 40px/1.10 display
--projector-title       800 120px/0.90 display
```

`--post` is deliberately larger than `--body`: post text is the hero of every card. `--meta-nums` (tabular numerals) applies to times, counts and join codes.

### 1.6 Spacing, radius, layout (`tokens/spacing.css`)

4px base: `--s-1 4 · --s-2 8 · --s-3 12 · --s-4 16 · --s-5 20 · --s-6 24 · --s-8 32 · --s-10 40 · --s-12 48 · --s-16 64`

```
--screen-x   16px   horizontal screen inset
--card-pad   16px
--stack-gap  12px   gap between cards in a feed
--tap-min    44px   minimum hit target
--thumb-zone 96px   bottom band reserved for the single primary action
```

Radius — medium-rounded:

```
--r-xs 4 · --r-sm 6 · --r-md 10 · --r-lg 14 · --r-xl 20 · --r-pill 999
--r-card -> --r-lg (14) · --r-input -> --r-md (10) · --r-button / --r-chip -> pill
--r-sheet 20px 20px 0 0
--border-w 1px · --border-w-strong 2px
```

From `guidelines/spacing-layout.html`:
- 16px hatched insets left and right.
- 12px between cards.
- 96px bottom band holds **one** primary pill (52px) plus safe area.
- Every target at least 44px.
- **Headers are display type, left-aligned. Never centred titles.**
- **Bottom sheets instead of modals. No floating side navigation.**

### 1.7 Motion (`tokens/motion.css`)

```
--dur-fast  120ms   press feedback, hover
--dur-base  200ms   chips, toggles, fades
--dur-slow  320ms   cards entering, sheets
--dur-pulse 1600ms  live dot
--ease-out    cubic-bezier(0.2, 0.8, 0.2, 1)
--ease-in-out cubic-bezier(0.65, 0, 0.35, 1)
--ease-pop    cubic-bezier(0.34, 1.56, 0.64, 1)   reaction bursts, count bumps
--press-scale 0.97
```

Five keyframes:

| Name | What it does |
|---|---|
| `live-pulse` | Expanding ring on the live dot, 0 to 10px spread, `color-mix(--live 55%)`. Loops forever while an event is live. |
| `post-in` | New card: `translateY(-14px) scale(.98)` + fade, to rest. 320ms. |
| `react-burst` | 1 to `scale(1.45) rotate(-8deg)` at 35%, back to 1. Overshoot pop. |
| `count-bump` | `translateY(-4px)` at 40%, back to 0. Queue badges, reaction counts. |
| `projector-in` | `translateY(40px)` + fade, to rest. 600ms per `readme.md`. |

`@media (prefers-reduced-motion: reduce)` zeroes `--dur-fast`, `--dur-base`, `--dur-slow`. `--dur-pulse` is deliberately **not** zeroed.

Hover darkens (primary to ink-800, ghost to ink-50); press scales down. **No colour change on press.**

The `live-pulse` keyframe reads `var(--live)`. The prototypes re-tint it for the amber "waiting for approval" dot by locally overriding `"--live": "var(--warning)"` — a CSS-variable trick with no RN equivalent; parameterise the colour instead.

### 1.8 Projector — the only dark scope in stage 1 (`tokens/themes.css`)

Scope: `[data-theme="projector"]` on the root of the projector view only. **There is no app-wide dark mode in stage 1** (`guidelines/colors-projector.html`: *"Projector only in stage 1. No app-wide dark mode."*).

```
--bg --ink-950 · --bg-sunken #000 · --surface --ink-900 · --surface-raised --ink-800
--surface-muted --ink-900 · --border --ink-800 · --border-strong --ink-700
--text #fafafa · --text-2 --ink-300 · --text-3 --ink-500 · --text-inverse --ink-950
--primary #fafafa · --primary-hover --ink-100 · --primary-press --ink-200 · --on-primary --ink-950
--anon-anonymous #fafafa · --anon-anonymous-bg --ink-800
--anon-hint oklch(0.82 0.10 295) · --anon-hint-bg oklch(0.30 0.06 295)
--locked-bg --ink-900 · --locked-border --ink-600
--locked-hatch repeating-linear-gradient(135deg, transparent 0 10px, rgba(250,250,250,.05) 10px 12px)
color-scheme: dark
```

Canvas 1920x1080, 72px vertical / 96px horizontal padding, 56–64px between posts, 2–3 posts per screen, event colour as a vertical bar per post. Header: event name at `--projector-title`, a pulsing `--live` dot and "Live · {n}" at `--projector-meta`.

### 1.9 Iconography

**Lucide**, `unpkg.com/lucide@0.460.0` UMD in the prototype; **`lucide-react-native` with the same PascalCase names in the app**. Stroke 2 at 18–22px, 2.25 at 16px or below, 1.75 at 28px or above.

Fixed meanings (`readme.md`):

```
VenetianMask anonymous · Sparkles hint · User named
MapPin section · Flag country · CaseUpper first letter
Lock / LockOpen locked card · Radio live/board · ListChecks queue
Projector projector mode · Reply reply privately
BadgeCheck approved from board · TriangleAlert screening warning
```

Also used across the prototypes: `ArrowLeft ArrowRight ArrowUp ArrowDown Check X Plus Ellipsis ChevronRight ChevronDown Share QrCode ScanLine LogIn LogOut PenLine Pencil Camera Send Clock CalendarDays Users Inbox StickyNote MessagesSquare MessageSquare MessageSquareLock MessageSquareOff Settings Settings2 ShieldCheck Shield Zap Square Eye EyeOff Ban Flag Trash2 Tag Pin Bell Languages VolumeX UserPen UserPlus FileText ExternalLink Info Eraser RotateCcw BellRing FastForward Signal Wifi BatteryFull`.

No icon font, no custom SVGs, no illustrations. Unicode `·` separates metadata. Emoji **only** as the fixed reaction set 🔥 😂 ❤️ 👀 😳, and only as reactions — UI chrome never adds emoji (user-written content may contain anything).

### 1.10 Voice and copy rules (`readme.md`, `guidelines/brand-voice.html`)

- Warm, direct, second person. Short sentences. Say what happens next.
- **No exclamation marks. No hype words** ("amazing", "unlock your…"). No marketing.
- English: sentence case everywhere, **including buttons** ("Approve to wall", "Keep private"). Contractions fine.
- Turkish: casual **sen**, never siz. Sentence case. Community loanwords stay ("Section", "admin", "QR"). Apostrophes on proper-noun suffixes ("İzmir'den", "Section'ın"). Uppercase via `toLocaleUpperCase("tr")` so i becomes İ.
- Anonymity is named plainly: Anonymous / Hint / Named — Anonim / İpucu / İsimli. **Never** "secret", "mystery", "crush".
- Honesty copy: counts, lengths and sources are always real. "164 characters · from someone at National Platform".
- Safety copy is calm: "This might not be delivered" — not "blocked", not "violation".
- Numbers: tabular numerals. Relative times short — `now / 2m / 1h / 3d` and `şimdi / 2dk / 1sa / 3g`.
- Dates: day + 3-letter month from `dates.monthsShort` ("14 Nov" / "14 Kas"). Multi-day uses an en dash with **no spaces**: "14–16 Nov"; cross-month "30 Nov–2 Dec". Year only when part of the event name.
- **One locale per surface.** Every date, month abbreviation, label and chip on one screen comes from the same table. Never "Kas" next to an "Upcoming" pill.
- Wordmark: no logo exists. Wherever a mark would go, set `[BRAND]` in display type, uppercase, `--display-tracking`. Three shown treatments: plain `--display-xl`; `--display-md` white on `--ink-900` with 8px radius; `--display-md` ink on `--cover-lime`.

---

## 2. Component library — 22 components

All live under `components/`. Each has a `.jsx` (web, uses a `ensureStyle()` helper from `core/styleInject.js` to inject a scoped CSS string), a `.d.ts` (the API — quoted below) and a `.prompt.md` (usage notes). `styleInject.js` is web-only and has no RN equivalent; the CSS strings in each `.jsx` are the pixel-level source of truth when porting.

### 2.1 `components/core/` (11)

**`Icon`** — Lucide by PascalCase name.
`{ name: string; size?: number /*20*/; strokeWidth?: number /*2*/; color?: string; style? }`
Use for every glyph in the product.

**`Button`** — pill button. One primary (ink) per screen, in the thumb zone.
`{ children; variant?: "primary"|"secondary"|"ghost"|"danger"|"event" /*primary*/; size?: "sm"|"md"|"lg" /*md=44px, lg=52px*/; icon?; iconRight?; loading?; disabled?; full?; onClick?; type?; style? }`
`event` picks up `--event`. `loading` swaps the icon for a spinner.

**`IconButton`** — round icon-only. Always pass `label` (aria). `lg` is the FAB.
`{ icon; label; variant?: "ghost"|"filled"|"outline"|"event"; size?: "sm"|"md"|"lg"; badge?: number; onClick?; disabled?; style? }`

**`Input`** — text field / textarea with label, hint, error, character counter.
`{ label?; value?; onChange?(v); placeholder?; multiline?; rows?; hint?; error?; maxLength?; type?: "text"|"email"|"tel"|"password"; autoFocus?; style?; inputStyle? }`

**`Chip`** — pill chip; static tag, or a toggle when `onClick` is given.
`{ children; icon?; selected?; tone?: "neutral"|"outline"|"event"|"live"; size?: "sm"|"md"; onClick?; style? }`

**`Switch`** — toggle, optionally a full settings row.
`{ checked?; onChange?(b); label?; description?; style? }`

**`Tabs`** — `underline` for page sections, `segmented` for mode switches.
`{ items: { id; label; count?; hot?; disabled? }[]; value; onChange?(id); variant?: "underline"|"segmented"; style? }`
`hot` marks a queue that needs attention (red count badge).

**`Toast`** — bottom toast; position above the thumb zone.
`{ message; action?; onAction?; tone?: "neutral"|"warn"|"danger"|"live"; icon?: string|null; style? }`
`warn` is specified for the pre-send screening warning; `live` for "n new posts" nudges.

**`Sheet`** — bottom sheet, **the app's only dialog**. Positions absolutely inside a `position:relative` screen container.
`{ open?; title?; onClose?; children?; style? }`

**`Avatar`** — round; falls back to a tinted initial, hue derived from the name.
`{ name?; src?; size?: "xs"|"sm"|"md"|"lg"|"xl"|number; style? }`
**Only shown when the anonymity level is `named`.**

**`StatusPill`** — uppercase pill. `live` pulses green.
`{ status?: "live"|"upcoming"|"archived"|"pending"|"rejected"|"onwall"; label?; size?: "md"|"lg"; style? }`
Always pass the localized `label`.

### 2.2 `components/anonymity/` (3)

**`AnonymityBadge`** — sender identity at the sender-chosen level. Goes on **every** card, thread and projector post. Never render a sender without it.
`{ level?: "anonymous"|"hint"|"named"; name?; avatar?; hints?: { section?; country?; letter? }; labels?: { anonymous?; hint? }; size?: "sm"|"md"|"lg"|"xl"; showLevel? /*true*/; style? }`
Sizes: `sm` in dense lists and threads, `md` on cards, `lg` on projector (`ProjectorPost.prompt.md`) / `xl` (`readme.md` — see §7 note).
Rendering, from `AnonymityBadge.jsx`:
- **anonymous** — solid `--anon-anonymous` circle with a white `VenetianMask`; 22/28/44/60px for sm/md/lg/xl; icon 13/16/22/30 at stroke 2.25; plus an uppercase `--caption-caps` level label unless `showLevel={false}`.
- **hint** — `--anon-hint-bg` circle with an `--anon-hint` `Sparkles`, same sizes, followed by one `HintChip` per allowed clue (section, country, letter, in that order). If no clues are set it falls back to the word "Hint".
- **named** — `Avatar` (xs/sm/lg/60) + name at `--body-sm-strong`, growing to 24px at `lg` and 36px/700 at `xl`.

**`HintChip`** — one clue. **Dashed border = clue, never identity.**
`{ kind?: "section"|"country"|"letter"; value?; size?: "sm"|"md"|"lg"|"xl"; style? }`

**`AnonymitySelector`** — the composer's three-way picker with a live "They'll see" preview.
`{ value?; onChange?(level); hintFields?: { section?; country?; letter? }; onHintFieldsChange?(f); me?: { name?; avatar?; section?; country? }; labels?: Record<string,string>; style? }`
Remembers the last choice at app level (pass it back in as `value`). Prototype default: `anonymous` with `{ section: true }`.

### 2.3 `components/cards/` (7)

**`PostCard`** — the message card used on walls, boards and the inbox. Same shell everywhere; context changes the footer.
`{ text; sender?: { level; name?; avatar?; hints? }; time?; source?; approvedFromBoard?; reactions?: Record<emoji, number>; myReaction?; onReact?(emoji); onReply?; onMore?; actions?: { label; icon?; onClick?; variant? }[]; large?; entering?; eventOutline?; labels?; style? }`
Also exports `REACTIONS: string[]` — the fixed set 🔥 😂 ❤️ 👀 😳.
`large` for the wall (short posts); `eventOutline` outlines the card in `--event` (used for "my own post" on a board and for the pinned origin post in a thread); `entering` plays `post-in`; `approvedFromBoard` shows the `BadgeCheck` "Approved from the board" chip.

**`LockedCard`** — inbox message beyond the free-read limit. Content hidden, **metadata real**. Ships `unlocked` in stage 1.
`{ level?; hints?; length?; text?; unlocked?; children?; time?; source?; onUnlock?; labels?; style? }`
From `LockedCard.jsx` — the honesty maths:
- `length` defaults to `text.length`; `perLine = 42`; line count `n = clamp(ceil(length / 42), 1, 6)`; every line 100% wide except the last, whose width is `max(18, round(((length % 42) || 42) / 42 * 100))`%.
- Lines: 11px tall, 6px radius, `--ink-400` at 42% opacity, 10px gap, `filter: blur(var(--locked-blur))`, `user-select:none; pointer-events:none`.
- Shell: `--locked-bg` + `--locked-hatch`, 1.5px dashed `--locked-border`, `--r-card`, 16px padding.
- Badge: 32px circle top-right, `--ink-900` (`--ink-700` when unlocked), `Lock` / `LockOpen` at 16px stroke 2.5, with a 4px ring in `--locked-bg`.
- Meta line: **bold real character count** + "characters", then `·` + "from someone at **{source}**".
- Locked state ends with a full-width secondary "Unlock" button. **`unlocked` keeps the same hatched shell, swaps to `LockOpen`, shows readable text and renders no Unlock button** — the slot stays reserved in code.

**`QueueCard`** — moderation queue, built for one thumb. Approve is the big green target on the right; **the only place green is a button**.
`{ index?; text; sender?; time?; state?: "pending"|"approved"|"rejected"; selectable?; selected?; onSelect?; onApprove?; onReject?; labels?; style? }`
`approved`/`rejected` animate the card out. `selectable` replaces the action row with a check circle and makes the whole card a toggle.

**`EventCard`** — event tile. Live = full cover colour; upcoming = white with a cover-tinted date block; archived = ink-50, desaturated.
`{ name; status?: "live"|"upcoming"|"archived"; locale?: "en"|"tr" /*en*/; cover?; coverSoft?; day?; month?: number|string; dayEnd?; monthEnd?: number|string; timeRange?; scope?; memberCount?; postCount?; compact?; onPress?; labels?: { live?; upcoming?; archived? }; style? }`
Also exports `EVENT_MONTHS: { en; tr }` and `EVENT_LABELS: { en; tr }`.
**The only component with a `locale` prop.** `locale` switches month abbreviation, status label and the `lang` attribute together. Pass `month` as a number 1–12 so it localizes; localize `scope` yourself. The date block grows to fit a range in all three states ("14–16" over "NOV"; cross-month ranges put the months on the day line).

**`JoinCodeBlock`** — join code + QR, shown to the creator and on the event detail.
`{ code /*6 alphanumerics, rendered "K7Q 4ZM"*/; qrSrc?; eventColorSoft?; onCopy?; onShare?; labels?; style? }`
The QR is a labelled placeholder; the app generates the real one.

**`ThreadBubble`** — private thread bubble. Their side carries the `AnonymityBadge`.
`{ text; mine?; system?; time?; sender?; labels?; style? }`
Column with `gap: 8px`. Show `sender` on the first bubble of each run. `system` is a centred line, e.g. "Deniz revealed themselves".

**`PendingState`** — pending-approval body: display title, numbered progress steps, a note.
`{ title; subtitle?; steps: { label; description?; done?; current? }[]; note?; style? }`

### 2.4 `components/projector/` (1)

**`ProjectorPost`** — one board post at 1920x1080, dark. Wrap in `data-theme="projector"` and set `--event`.
`{ text; sender?; time?; reactions?; labels?; style? }`
Event-coloured bar, sender badge, 72–96px text. Stack 2–3 per screen with 64px gaps; auto-scroll newest to top.

### 2.5 Recurring inline patterns that are **not** in the library

Every prototype rebuilds these locally, with drift between files. They should become real components in the RN library before any screen work starts:

`Empty` (icon circle + centred sentence, optional `--event-soft` tint) · `Note` (icon + text on `--surface-muted`, `--r-md`) · `Row` (settings list row: icon, label, value, chevron/external, `danger`) · `Group` (bordered card wrapping a list of Rows) · `Back` (header with back IconButton + optional display title) · `PersonRow` (avatar, name + `· you`, section, chevron) · `ConfirmSheet` (body + danger button + ghost Cancel) · `ReportSheet` (post preview + five reason chips + danger Report) · `MoreSheet` (post preview + action list) · `Composer` · `ReplySheet` · `PersonPicker` · `SectionSheet` · `JoinSheet` · `CreateSheet` · `ModsSheet` · `ControlsSheet` · `Swipe` (pointer-based swipe-to-decide) · `TabBar` (bottom nav) · `WallHeader` (avatar, name, section chip, bio) · `Projector` (full-screen host) · push-notification preview card · coach-mark bubble with a CSS triangle tail.

---

## 3. String tables

`strings/en.json` and `strings/tr.json` carry **the same keys**, with `{n}` / `{name}` / `{word}` placeholders. Full key inventory:

| Group | Keys |
|---|---|
| `_meta` | `locale`, `register`, `brand` |
| `common` | `next back done cancel save delete report block copy copied share more close retry you justNow minutesShort hoursShort daysShort` |
| `anon` | `anonymous hint named anonymousSub hintSub namedSub showThem section country letter preview fromSomeone revealMyself revealed` |
| `onboarding` | `splashTitle splashSub signUp logIn profileTitle name photo section country bio bioPlaceholder pendingTitle pendingSub stepSent stepReview stepReviewDesc stepIn pendingNote approvedTitle approvedSub` |
| `wall` | `title empty emptyOwner writeOnWall inbox inboxCount approvedFromBoard from` |
| `inbox` | `title empty approveToWall keepPrivate replyPrivately onWall keptPrivate deleted locked unlock chars fromSomeoneAt` |
| `events` | `title live upcoming archived national join joinCode enterCode scanQr create name scope starts ends coverColor boardMode approveFirst approveFirstDesc postImmediately postImmediatelyDesc coModerators addCoModerator board people queue members posts closeBoard closed qrPlaceholder projector` |
| `section` | `title members room roomSoon` |
| `board` | `empty newPosts show toTheRoom toAPerson inQueue notPublished hidden hide react reply` |
| `queue` | `title approve reject approveAll empty waiting` |
| `composer` | `toThisWall toThisBoard toPerson placeholderWall placeholderBoard send sent sentToQueue sentToInbox screeningWarning screeningDetail` |
| `thread` | `title requests placeholder revealConfirm blocked` |
| `settings` | `title whoCanWrite anyone namedOnly nobody blocked mutedWords addWord notifications notifInbox notifInboxDesc notifThreads notifBoard language mySection deleteAccount deleteConfirm` |
| `dates` | `monthsShort` (12-item array), `rangeSeparator` (`–`) |
| `status` | `live upcoming archived pending rejected onwall` |
| `report` | `title reason sent` |

Turkish notes worth keeping: "Section" is left untranslated (`anon.section`, `section.title`, `settings.mySection` = "Section'ım"), `common.report` = "Şikâyet et" (with the circumflex), `wall.from` = "Kaynak:" (a labelled prefix, unlike the English "From"), `inbox.fromSomeoneAt` = "şuradaki birinden:", time suffixes `dk / sa / g`.

**Keys currently unused by every prototype:** `wall.inboxCount`, `wall.from`, `section.room`, `section.roomSoon`, `board.hide`, `board.hidden`, `board.inQueue`, `queue.approveAll`, `events.qrPlaceholder`, `events.closed`, `composer.screeningWarning`, `composer.screeningDetail`, `composer.sentToQueue`, `thread.requests`, `thread.blocked`, `anon.revealed`, `anon.fromSomeone`, `settings.mySection`, `settings.deleteConfirm`, `status.onwall`, `common.retry`. Several of these correspond to features the prototype never built — see §7.

**The tables do not cover the copy the prototypes actually show.** See §7 (CC).

---

## 4. Prototype cast and fixtures

Shared across every prototype, so it can be reused in dev seeds (never in production — brief principle 4):

**People.** Deniz Aksoy (ESN Ankara, Türkiye — the default persona, a `member`) · Kaan Yılmaz (ESN İzmir — creator of National Platform 2026) · Şeyma Kaya (ESN İzmir) · Giulia Ferri (ESN Bologna, Italy) · Ahmet Yıldız (ESN İzmir) · Lena Novak (ESN Brno, Czechia) · İrem Doğan (ESN Boğaziçi) · Mateo Ruiz (ESN Sevilla, Spain) · Ece Kara (ESN Ankara — co-moderator) · Jonas Weber (ESN Köln, Germany) · Burak Şen and Marco Riva (blocked-list fixtures).

**Sections.** ESN Ankara 212 · ESN İzmir 148 · ESN Boğaziçi 176 · ESN METU 131 (Türkiye) · ESN Bologna 264 · ESN Milano 310 (Italy) · ESN Sevilla 198 (Spain) · ESN Brno 122 (Czechia) · ESN Köln 241 (Germany).

**Events.**

| id | Name | Status | Cover | Dates | Scope | Mode | Code |
|---|---|---|---|---|---|---|---|
| `np` | National Platform 2026 | live | magenta | 14–16 Nov, "Fri–Sun", ends 02:00 | National | approve_first | `NPL026` (full-app) / `ESN026` (events proto) |
| `cap` | Cappadocia Trip | upcoming | mint | 30 Nov–2 Dec, "Mon–Wed" | ESN Ankara | post_immediately | `H3LLON` |
| `izm` | İzmir Welcome Night | upcoming | azure | 22 Nov, 20:00–01:00 | ESN İzmir | approve_first | `K7Q4ZM` |
| `kar` | Ankara Karaoke | archived | lime | 03 Oct, 21:00–01:00 | ESN Ankara | post_immediately | `KAR4OK` |
| `reg` | Regional Platform | archived | violet | 4–6 Apr, "Fri–Sun" | National | approve_first | `REG026` |

**Join-code alphabet:** `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — 6 characters, I/O/0/1 excluded. Worth keeping server-side.

**Report reasons** (identical in three prototypes, invented by the design): Harassment or bullying · Hate or discrimination · Sexual content · Reveals someone's identity · Spam.

**Character limits the prototypes impose:** name 40 · bio 80 · event name 40 · post / wall message / reply-to-start-thread 280 · in-thread message 500 · muted word 30 · password minimum 8.

---

## 5. Design-system non-negotiables (`SKILL.md`)

1. Anonymity level visible on every card, via `AnonymityBadge`.
2. Locked cards visually distinct but honest, via `LockedCard`.
3. One saturated colour per event, via `--event`.
4. Projector mode dark and readable from 15 m.
5. All copy in both `strings/en.json` and `strings/tr.json`, Turkish in "sen".
6. One locale per surface — dates, month abbreviations, labels and chips switch together.
7. Events span one night (`day` + `month`) or several days (`dayEnd`, `monthEnd`) in **every** status.

---

## 6. Screens — one section per file

### 6.1 `Onboarding.dc.html` → `prototypes/onboarding-app.jsx`

Eight screens: `splash | signup | login | profile | pending | events | me | section`.

- **Splash.** `[BRAND]` at `--display-xl` uppercase, headline "Say it. Keep your name out of it." at 40px, sub "Anonymous notes for exchange students, at the events you're actually at.", then the 8-cover colour strip (22x6px bars). Bottom: "Sign up" (lg primary) + "Log in" (lg ghost).
- **Sign up / Log in.** Shared screen. Mini colour strip, display title, one-line sub ("Two fields and you're nearly in." / "Good to see you again."). Two secondary buttons with inline brand SVGs: Continue with Apple, Continue with Google (both toast a placeholder). "or the classic way" divider. Email, Password (hint "8 characters minimum." once typing starts), and on sign-up an optional Phone with hint "Optional. For the day you forget the one above." Log-in adds a ghost "Forgot password". Continue is disabled until `/.+@.+\..+/` and password length ≥ 8. Footer ghost swaps between the two modes.
- **Profile setup.** Photo picker (60px dashed circle with `Camera`, plus a 24px ink badge showing `Plus`/`Pencil`), caption "Real face, please. An admin checks it once." · Name (max 40) · **Your section** — a bordered row opening `SectionSheet`, caption "A tag, not a gatekeeper. Sections have no admins." · **Country** — a **read-only, `--surface-muted`** row with a `Lock` icon, "Filled from your section" · One-line bio (max 80) · **live "Your wall header" preview** (`WallHeader`: avatar, name, section chip, bio) that fills in as you type. Primary: "Send for approval", disabled until name + section.
- **`SectionSheet`.** Search across sections *and* countries, Turkish-aware normalisation (`toLocaleLowerCase("tr")`, ı to i, NFD diacritic strip). Grouped by country, each row shows the member count and a `Check` when selected. Caption "Sections are tags, not admins. Yours only shows where you're from." Empty state: "No section by that name. Pick the closest one; you can change it in Settings."
- **Pending.** Header is `[BRAND]` + a ghost "Log out". `PendingState` with title "You're in the queue", subtitle "An admin checks every profile by hand, so everyone here is real." and three steps: "Profile sent" (done, described as `{name} · {section}`), "Admin review" (current, "A person looks at your name and photo. No bots, no ghosts."), "You're in" ("We send a notification. Then you can join events."). Note: "We'll let you know. Nothing to do until then. You can close the app." Below it, the wall-header preview again. **No timeline is promised in the UI.**
- **Approval push.** After ~4s a simulated iOS notification banner slides in (`post-in`) at the top: 40px `[B]` tile, "You're approved" / "now", "Welcome in. Join your first event with a code or QR." Tapping it goes to Events and arms the coach mark.
- **Events (empty).** Header "Events" + own avatar (taps to `me`). Centred empty state: 56px `CalendarDays` circle, "Nothing here yet. Events you join or create show up in this list." Bottom row: "Join an event" (lg primary, flex 1) + "Create" (lg secondary). **Coach mark** — ink-900 bubble with a CSS triangle tail: "Join an event to get started" / "Every event has a 6-character code and a QR at the door. Ask the organiser." / "Got it".
- **My wall (`me`).** Back header, "My wall" label, `WallHeader`, "Approved messages will show here."
- **Section page.** Back header, "Section" label, section name at `--display-lg`, `Flag` country + `Users` "{n} members", a `Note` reading "A section is a tag people put on their profile. It has no admins and no board of its own.", then the roster (you first if it matches), ending "and {n} more". **No Room tab or reserved slot.**

Annotation in the demo aside: *"Splash → Sign up (any email, 8+ char password) → Profile (name + section required; wall header previews live) → Pending. The 'You're approved' push arrives after ~4 s; tap it → Events with the one-time coach mark. Section page: tap the section chip on any wall header."*

### 6.2 `Events.dc.html` → `prototypes/events-app.jsx`

Screens: `list | detail | profile | code`, plus `JoinSheet` and `CreateSheet`.

- **My events list.** Header "Events" + avatar. Groups in fixed order, each with a `--caption-caps` label: **Live** (full `EventCard`), **Upcoming** (`compact`; empty text "Nothing planned. Join with a code or create one."), **Archived** (`compact`). Live and Archived groups are hidden when empty. Bottom: Join an event + Create.
- **`JoinSheet`.** Three states.
  - *Code entry* — `Input` styled `--display-md`, `.22em` tracking, centred, uppercase, placeholder `XXX-XXX`, `maxLength 7`. Input is sanitised to 6 alphanumerics and **re-displayed with a hyphen after the third character**. Hint "Ask the organiser, or scan the QR at the door." Errors: "No event with that code. Check it with whoever shared it." / "You're already in {name}." Join disabled below 6 characters. Secondary "Scan QR".
  - *Scan QR* — 300px `--ink-950` panel with four white corner brackets, "Camera · point at the event's QR", a secondary "Simulate a scan" (submits `K7Q4ZM`) and a ghost "Enter the code instead".
  - *You're in* — the joined `EventCard` with `memberCount + 1`, then either "The board is live. Say hi." or "The board opens {date} at {start}. You'll see it in Upcoming until then.", then "Open event".
- **`CreateSheet`.** Event name (max 40) · **Who's it for** as segmented Tabs: "My section · {section without 'ESN '}" / "National" · **Starts / Ends** as two native `datetime-local` inputs side by side · a live caption: "End must be after the start." / "Multi-day: {d}–{d} {Mon}. The board stays open the whole time." / "One night. Set the end on a later day for a multi-day event." · **Cover color** — eight 36px circles, selected one gets a double ring and a `Check` · **Board mode** — segmented, with caption "Posts to the room wait for you or a co-moderator before anyone sees them." / "Posts go up as they come. You can still hide them." · **Preview** — a live `compact` `EventCard`. Create is disabled until the name is >1 char and end > start. Multi-day is derived from the two dates; `timeRange` becomes `"Fri–Sun"` for multi-day and `"20:00–01:00"` for one night.
- **Event detail.** Back + (creator only) a `Settings2` "Board controls" + a `Share` that opens the code screen. Event name at `--display-lg` with the `StatusPill` right-aligned. Meta row: `CalendarDays` date · timeRange, `MapPin` scope. Tabs: **Board** (count = postCount) / **People** (count = memberCount).
  - *Board, upcoming* — 56px `--event-soft` circle with `Radio`, "The board opens {date} at {start}. Until then, see who's coming.", secondary "People".
  - *Board, archived* — a `Lock` banner "This board is closed. You can read, not post.", posts with no reaction/reply/more handlers, footer "Board closed {date}".
  - *Board, live* — posts with reactions/reply/more, then an ink pill link "Open the live board", footer "Board opened 19:00".
  - *People* — a search field, then the roster (you first, marked "· you"), each row tapping through to that member's profile. Footer: "{n} joined · everyone here was approved by an admin".
- **Member profile (inside an event).** Back + Share. Avatar `xl`, name at `--display-lg`, "{section} · {country}", bio, then `MessageSquare` "2 on the wall". Two `large` `PostCard`s, one anonymous and one hint-level with `approvedFromBoard`. Bottom (only when not me): "Write on the wall".
- **Join code screen.** Reached two ways, and the copy changes: from Share it is titled "Join code" / "Anyone with the code or QR can join."; straight after creation it is "Event created" / "Share the code or QR. People who join land in People; the board opens at the start time." Shows the compact `EventCard`, the `JoinCodeBlock`, and a caption "Board mode: approve first / post immediately. Change it any time from the event." Bottom: "Done".

### 6.3 `Live Event Board.dc.html` → `prototypes/live-board-app.jsx`

The live board for a **member** (Şeyma Kaya) at National Platform 2026.

- **Header.** Back · `Projector` (outline IconButton) · `Share`. Title "National / Platform 2026" over two lines at `--display-lg`, with a pulsing `Live` `StatusPill`. Meta row: `Users` count · `MessageSquare` count · `Clock` "until 02:00". Tabs: Board / People.
- **Feed.** `PostCard`s newest first. Own posts get `eventOutline`. Reply and More are hidden on your own posts. Footer "Board opened 19:00".
- **Live updates.** A new post from someone else arrives every 9s with `entering`. If the user has scrolled past 80px, a `Toast tone="live" icon="ArrowUp"` "{n} new posts" with a "Show" action appears pinned near the top; tapping it smooth-scrolls to the top and clears the count. Scrolling back above 40px also clears it.
- **Reactions.** One reaction per user per post: tapping a different emoji moves your reaction, tapping the same one removes it. Counts update accordingly.
- **Composer** (FAB, `PenLine` filled `lg`, bottom-right). Sheet title changes with the target: "To the room" / "To {first name}" / "To a person". Segmented Tabs "To the room" / "To a person"; picking "To a person" auto-opens the `PersonPicker` (search over joined members). Once picked, the person collapses to a row captioned "Goes to their inbox. They decide if it goes public." Body: multiline `Input`, 3 rows, max 280. **"Post as"** → `AnonymitySelector`. **"Your card"** → a live `PostCard` preview at 60% opacity until text is entered. In `approve_first` a `Clock` line reads "This board approves posts first. A moderator will release it." Primary "Send".
- **Send outcomes.**
  - *To a person* — never touches the board. Toast: "Sent to {first}'s inbox. They decide if it goes public."
  - *Room, post_immediately* — goes straight to the top. Toast "On the board".
  - *Room, approve_first* — a **pending card only the sender sees**: 1.5px dashed border on `--surface-muted`, `StatusPill status="pending" label="Waiting for approval"`, "Only you see this" on the right, the text in `--text-2`, and an amber pulsing dot with "A moderator is looking at it". After ~4.2s, 60% are released (card moves into the feed, toast "A moderator released your post") and 40% flip to a **rejected card**: `StatusPill status="rejected" label="Not published"`, "Only you see this", text struck through in `--text-3`, and two buttons — secondary "Rewrite" (reopens the composer) and ghost "Dismiss".
- **`ReportSheet`.** The post rendered as a `PostCard`, "What's wrong?", five reason chips, a full-width `danger` "Report". Confirmation toast: "Reported. Only the admin sees who sent it."
- **People tab.** Roster rows with avatar, name (`· you`), "{section} · {country}", and a small outline `PenLine` IconButton labelled "Write to {name}".
- **Projector mode.** Full-screen `data-theme="projector"` overlay, tap anywhere to exit. A 1920x1080 canvas is rotated 90° and scaled to fit inside the phone frame — **a presentation trick for the mock, not a spec**. A label reads "Projector · 1920x1080 · tap to exit". Content: event name at `--projector-title` uppercase, a 22px pulsing `--live` dot with "Live · {n}" at `--projector-meta`, then **two** `ProjectorPost`s, cycling to the next pair every 4.2s.

### 6.4 `Inbox + Wall.dc.html` → `prototypes/inbox-wall-app.jsx`

Two roles, switchable from the aside: **Deniz (owner)** and **Giulia (visitor)**.

- **Message states.** `new | private | approved`. The wall is exactly the `approved` set; the inbox shows all three behind a segmented filter.
- **Owner shell.** A 3-item bottom nav — Events (`CalendarDays`) / Inbox (`Inbox`, with an ink count badge) / Wall (`StickyNote`).
- **Inbox.** Header "Inbox" + a `Settings` IconButton ("Who can write to me"). Segmented Tabs: **New** (count) / **Private** / **On wall**.
  - Cards are `PostCard` with `source` and an `actions` row. Actions by state: `new` → "Approve to wall" (primary, `Check`) + "Keep private"; `private` → "Approve to wall" (secondary); `approved` → "Keep private" (secondary, `EyeOff`).
  - Two seeded messages render as **`LockedCard` with `unlocked`** — hatched shell, `LockOpen` badge, readable text, the real character count and source, and the same action row plus an `Ellipsis` More button passed as `children`. An inline comment marks the switch: *"Stage 1: locked cards ship unlocked. When unlocking launches, drop `unlocked` and pass `onUnlock` — LockedCard renders the full-width 'Unlock' button in place of the actions below."*
  - Empty states per filter: "Nothing yet — join an event to get messages" / "Messages you keep private land here" / "Approved messages will show here".
- **Overflow (`MoreSheet`).** Post preview, then: Reply privately · **Take off the wall** (only when `approved`) · Report · Block {first name} / Block sender · Delete (danger).
- **Confirm sheets.** Delete — "Delete message? It goes from your inbox and your wall. No undo." Block — named: "{first} can't write to you again. This message is removed."; anonymous/hint: "You won't learn who they are, but they can't write to you again. This message is removed."
- **Toasts.** Approve → "On your wall" with a "View" action that switches to the Wall tab. Keep private → "Kept private", or "Off the wall. Kept private." when taken down. Delete → "Deleted". Block → "Blocked. They can't write to you again."
- **Wall (owner).** Header "Wall" + Share. `Profile` block: avatar `xl`, name at `--display-lg`, "{section} · {country}", bio, `MessageSquare` "{n} on the wall". Then `large` `PostCard`s, newest first, with `approvedFromBoard` where relevant and an overflow menu. Empty: "Approved messages will show here."
- **Wall (visitor).** Same wall, no bottom nav, back arrow instead of the title, no overflow menus, and a full-width "Write on the wall" in the thumb zone.
- **`WallComposer`.** Sheet "To {first}'s wall". No target picker. Body (max 280) → "Post as" `AnonymitySelector` → "Your card" preview → an `Inbox` line: "Goes to {first}'s inbox first. They decide if it goes on the wall." → "Send". Toast: "Sent to {first}'s inbox. They decide if it goes public." The message appears in the owner's New filter.
- Aside note: *"Two hatched cards are LockedCards in the unlocked state; no Unlock button in stage 1."* An "Show empty" control clears all messages to exercise the empty states.

### 6.5 `Moderation Queue.dc.html` → `prototypes/mod-queue-app.jsx`

The creator's view (Şeyma Kaya) of National Platform 2026.

- **Header.** Back · `Users` "Moderators" (outline, `badge` = mods + 1) · `Settings2` "Board controls" (outline). Event name at `--display-md` with a Live / Closed `StatusPill`. Two chips that both open Board controls: a `tone="event"` mode chip (`ShieldCheck` "Approve first" / `Zap` "Post immediately") and an outline `Clock` chip ("Until 02:00" / "No end time" / "Closed 21:41"). Tabs: **Queue** (count = waiting, `hot` when > 0) / **Board** (count = approved).
- **Queue.** A segmented filter **Waiting** (count) / **Approved** / **Rejected**, with a ghost "Select" button on the right when more than one post is waiting.
  - *Waiting* — `QueueCard`s **oldest first**, numbered from 1, each wrapped in a `Swipe`: swipe right past 90px approves, left rejects. The bed behind the card is `--live` (ink text) or `--danger-soft` (danger text) with a `Check`/`X` that scales from 0.8 to 1.1 and labels itself "Approve"/"Reject" once past the threshold. Card travel is clamped to ±150px. Vertical drags are ignored. Decisions animate the card out over 320ms.
  - *Approved / Rejected* — each post rendered under a `StatusPill` ("On the board" / "Not published"), rejected ones at 70% opacity, marked "Only the sender sees this", with an **"Approve anyway"** secondary action.
  - A persistent footnote under Waiting: "Messages to a person go straight to that person's inbox and never appear in this queue."
- **Multi-select.** "Select" turns every card into a check-circle toggle and raises a bottom bar: a ghost "All"/"None" and a primary "Approve all selected (n)".
- **Live arrivals.** One room post every 7s, **appended at the bottom** (oldest first). If the user is not near the bottom of the Waiting list, a `Toast tone="live" icon="ArrowDown"` "{n} new" with "Show" appears; tapping jumps to the queue bottom. Arrivals pause while any sheet is open.
- **`ModsSheet`.** List view shows the creator ("Creator · {section}", marked "· you") and each co-moderator ("Co-moderator · {section}") with an `X` to remove. Caption: "Co-moderators see the same queue and can approve or reject. They can't change board settings." Add view: search over **joined members only**, caption "Only people who joined National Platform 2026 can moderate it." Toasts: "{first} can approve posts now" / "{first} removed".
- **`ControlsSheet`.** Board mode segmented, caption "Posts to the room wait for you." / "Posts go up as they come. The {n} already waiting still need a decision." · **Ends** as four chips: 01:00 / 02:00 / 03:00 / No end, caption "The board closes itself at this time. Posts stay readable." · full-width danger "Close board now" → confirm sheet: "Close the board? No one can post after this, and the {n} waiting won't be published. Everything already on the board stays readable." Toast: "Board closed. It stays readable."
- **Closed state.** Waiting filter shows "This board is closed. Nothing new can arrive."; arrivals stop; Select is hidden.
- **Board tab.** Shows the sender's own view of a rejected post at the top under "As the sender sees it · not on anyone else's board" — the same struck-through "Not published" card with Rewrite / Dismiss — then the approved feed. Empty: "Quiet in here. Approve something."

### 6.6 `Private Thread.dc.html` → `prototypes/thread-app.jsx`

Deniz's view, with a 3-tab bottom nav: **Board** (`Radio`) / **Inbox** (`Inbox`) / **Threads** (`MessagesSquare`, unread badge).

- **Entry points.** Only two: the `Reply` arrow on a board `PostCard`, and Inbox card overflow → "Reply privately". The aside states it explicitly: *"Nothing starts a thread from a profile."*
- **`ReplySheet`.** "Replying to" + the origin `PostCard` (with `source`) · body `Input` (max 280, placeholder "Reply…") · **"Reply as"** `AnonymitySelector` · a `Lock` line: "Starts a private thread. Only the two of you see it. You can reveal yourself later, they can't make you." · "Send". The other side answers after ~1.8–2.6s.
- **Threads list.** Rows of: `AnonymityBadge` for the other party + relative time, then the last message (prefixed "You: " when it is yours) truncated to one line, with an 8px ink dot when unread, then "from {event}" when the other party is not named. Empty: "No threads yet. Reply privately to a post to start one." **The header carries `paddingBottom: 40` with an inline comment reserving space for a Requests tab in a later stage.**
- **Thread screen.** Header: back · the other party's `AnonymityBadge` at `md` with "from {event}" beneath when not named · `Ellipsis`. Body: the **pinned origin post** under a `Pin` label reading "Your post · {event}" or "Their post · {event}", rendered as a `PostCard` with `eventOutline`, separated by a hairline. Then `ThreadBubble`s. Composer bar: an `Input` (max 500, "Reply…") plus a filled `ArrowUp` IconButton.
- **Per-message anonymity.** Each message stores the level it was **sent at** (`asLevel`), so the other side keeps seeing pre-reveal bubbles masked after a reveal. The aside exposes a "Thread perspective" toggle (Deniz / Their side) to demonstrate exactly this; their side is read-only ("Read-only preview of their side").
- **Reveal.** Overflow → "Reveal myself" (with sub-label "They see your name and photo. Can't be undone here.") → confirm sheet titled "Reveal myself?", body "They will see your name and photo from now on. Earlier messages stay as they were. One-way, permanent in this thread.", plus a **"They'll see" preview** box containing a `named` `AnonymityBadge` at `lg`. The action button is **not** danger-styled. On confirm, a `system` `ThreadBubble` reads "{first} revealed themselves" and a toast says "They see your name now". Reveal is hidden once you are already named.
- **Block / Report.** From the same overflow. Block confirm: "{first}/They can't write to you again and this thread is removed for you." plus, for non-named, "You won't learn who they are." Report sheet adds the caption "The whole thread goes to the admin. Only the admin sees who reported it."

### 6.7 `Settings.dc.html` → `prototypes/settings-app.jsx`

**The only fully bilingual prototype.** Every visible string comes from an inline `STR[locale]` table with `en` and `tr`; the in-app Language screen and the aside toggle drive the same state, and the frame carries `lang={loc}`.

Root screen, grouped:

- **Privacy** — `MessageSquareLock` Who can write to me (value = current) · `Ban` Blocked people (count) · `VolumeX` Muted words (count).
- *(ungrouped)* — `Bell` Notifications ("n/4") · `Languages` Language ("English" / "Türkçe").
- **Account** — `UserPen` Edit profile · `MapPin` Change section (value = current section) · `LogOut` Log out · `Trash2` Delete account (danger).
- **Legal** — `Shield` Privacy policy · `FileText` Terms of use, both with value "Opens in your browser" and an `ExternalLink` chevron.
- Footer: "Version 0.1 · stage 1" / "Sürüm 0.1 · aşama 1".

Sub-screens:

- **Who can write to me.** Three radio rows with icon, label, description and a 24px check circle. Descriptions: Anyone — "Anyone at an event you joined can write to your inbox, anonymously or not."; Named only — "Only people who show their name can write. Anonymous and hint messages bounce."; Nobody — "Your inbox closes. Board posts and threads you already have still work." Note: "Applies from now on. Messages already in your inbox stay."
- **Blocked people.** Rows with avatar, name, section and a secondary "Unblock". Empty: "Nobody blocked. Good sign." Note: "Blocked people can't write to you or reply in your threads. They aren't told."
- **Muted words.** An `Input` + secondary "Add" button, then the words as removable outline chips with an `X`. Words are lower-cased with `toLocaleLowerCase(locale)` and de-duplicated. Empty: "No muted words yet." Note: **"Messages with these words skip your inbox and land in Private. Case doesn't matter."**
- **Notifications.** Four `Switch` rows: Inbox ("Someone writes to you") · Threads ("A reply in a private thread") · Board mentions ("A moderator releases your post, or people react to it") · **Event reminders** ("An event you joined is about to start"). All on by default.
- **Language.** English / Türkçe rows, each `lang`-tagged, with a `Check` on the active one. Note: "Changes every label in the app. What people wrote stays as written."
- **Edit profile.** Avatar `xl` + secondary "Change photo", Name (40), One-line bio (80), and a row through to Change section. Bottom: "Save" → toast "Saved".
- **Change section.** A `Clock` note first: **"Changing your section sends your profile back to the admin queue. You can read everything while you wait, but you can't post or write to anyone until you're approved again."** Then the section list; the current one is disabled and carries a "Now" chip. Picking one opens a confirm: "Change to {name}? You go back to the queue. Reading works, posting waits for approval." Toast: "Section changed. You're back in the queue."
- **Log out.** Sheet: "Your inbox, wall and threads stay. Log back in any time."
- **Delete account — two steps.**
  1. "Delete your account?" — "This deletes, it doesn't deactivate. Your profile, wall, inbox, threads and every post you made are removed from our servers. Messages you sent to others are removed from their inboxes and walls too." plus a `TriangleAlert` note: "No undo, no grace period, no 'restore' email." Danger "Continue".
  2. "Last check" — "Type DELETE to confirm. Everything goes now." An `Input` styled `--display-sm`, uppercase, centred, `.12em` tracking. The button unlocks only when `toLocaleUpperCase(locale)` of the input equals the localized word — **`DELETE` in English, `SİL` in Turkish**. Toast: "Deleted. Nothing of yours is left."

### 6.8 `Full Prototype.dc.html` → `prototypes/full-app.jsx`

The stitched, clickable app used for testing: onboarding → a 4-tab shell (**Events · Inbox · Threads · Profile**), one shared store so flows connect end to end (a post to a person really lands in that person's inbox; a queue decision really appears on the board).

- **Navigation model.** `tab` + a `stack` array. Pushed screens: `event`, `projector`, `code`, `wall`, `section`, `thread`, `settings` and the `set:*` sub-screens. The bottom `TabBar` is hidden whenever the stack is non-empty. Badges: Inbox = new-message count, Threads = unread count.
- **Two personas, one world.** A hidden demo sheet (**tap the clock "21:41" in the status bar**) switches between **Deniz · member** and **Kaan · creator**, skips onboarding, or resets everything. Kaan created National Platform 2026, so he alone sees its Queue; both see the same board, but inboxes and threads are their own.
- **Event screen.** Tabs are built conditionally: `Board` always, `Queue` **only when you are a moderator and the mode is `approve_first`**, `People` always. Moderators additionally get the `Users` and `Settings2` header buttons and the mode chip; a live event shows the `Projector` button for everyone.
- **Composer.** One component serves the board and the wall (`wallOwner` prop drops the target picker and pins the recipient). The "This board approves posts first" hint is suppressed for the event creator, because **`sendFromBoard` treats a moderator's own room post as immediate**.
- **Pending / rejected cards** are per-post and dismissible, and multiple can stack.
- **Live board.** A room post arrives every 12s while the `np` event screen is open and no sheet is up. A member's own pending post is auto-released after 8s "unless Kaan gets there first".
- **Projector.** Same rotated-canvas presentation, but it renders the **newest two approved posts and does not rotate or scroll**.
- **Wall / Profile.** The Profile tab is your own wall. Header shows a `Settings` button (own wall only) and Share. Another person's wall is pushed from a People row or a Section roster, and carries "Write on the wall". Empty (own): "Approved messages will show here. Approve one from your inbox."
- **Settings** is a trimmed English-only copy of §6.7 (no Language options beyond the row, same Privacy/Account/Legal structure, same two-step delete which drops you back to onboarding).
- Aside: *"Start at the splash. Hidden demo panel: tap the clock (21:41) in the status bar to switch persona, skip onboarding or reset. Join code for National Platform 2026: NPL-026."*

### 6.9 `Test Script.dc.html`

Not a screen — an 816px A4-ish document: **"Six tasks, one evening"**, a usability-test script for the Full Prototype. ~25 minutes per tester.

- **Persona:** Deniz Aksoy · ESN Ankara, a member not yet in National Platform 2026.
- **Join code:** printed as `NPL-026`.
- **Facilitator note:** tap the clock (21:41) for the hidden panel — switch to Kaan (creator, sees the Queue), skip onboarding, reset.

| # | Task | Done when | Watch for |
|---|---|---|---|
| 01 | Sign up | Events list shows the "Join an event to get started" coach mark | Do they understand why approval exists? Do they look for a "how long" promise? |
| 02 | Join an event by code | National Platform 2026 board open with the Live pill | Does the dash in XXX-XXX confuse anyone? Do they find Board vs People? |
| 03 | Post anonymously to the room | Their post is on the board with the event-coloured outline | Do they read the "Your card" preview? Do they trust "Waiting for approval"? |
| 04 | Post to a person (Kaan) | Toast: "Sent to Kaan's inbox. They decide if it goes public." | Do they expect it on the board? Is "they decide" clear? |
| 05 | Approve a message to your wall, then take one back off | The message appears at the top of their Profile wall | Inbox = private, wall = public: is that obvious? **Do the hatched (formerly locked) cards raise questions?** |
| 06 | Reply privately, then reveal | System line "Deniz revealed themselves"; Threads list shows it on top | Do they understand reveal is one-way? **Do they look for a "Message" button on a profile (there isn't one, on purpose)?** |

Wrap-up questions: *"What did you think would happen when you sent something anonymously? Who could see it? What would you never send here, and why?"*

### 6.10 `prototypes/live-board.html`

A standalone HTML page listed in the project alongside the `.jsx` apps; superseded by `Live Event Board.dc.html` + `live-board-app.jsx`. Not referenced by any `.dc.html` wrapper.

---

## 7. Where the prototype contradicts `CLAUDE.md` — unresolved

Listed, not resolved. `CLAUDE.md` is the product contract; each item needs a decision before the relevant implementation step.

### Missing from the prototype

**A. Pre-send screening warning is not implemented anywhere.**
Brief §4.6: *"Pre-send screening: if the keyword/model filter flags it, show a 'this may not be delivered' warning; delivery is decided server-side."* The strings exist (`composer.screeningWarning`, `composer.screeningDetail`), `Toast` documents a `warn` tone *"for pre-send screening"*, and `readme.md` assigns `TriangleAlert` to *"screening warning"* — but **no composer in any prototype renders it**. There is no designed flagged state.

**B. "Hide post" is not implemented.**
Brief §4.5 gives moderators *"hide post, close board"*. Close board exists everywhere. Hide post exists only as two unused strings (`board.hide` "Hide post", `board.hidden` "Hidden by a moderator") — no UI, and `StatusPill` has no `hidden` status.

**C. The Section page has no reserved "Room" tab.**
Brief §4.4b: *"leave room for a 'Room' tab (stage 2)."* Strings `section.room` / `section.roomSoon` exist and are unused; the section page is a flat roster with no tab bar. (The parallel reservation for a Requests tab in the Threads list **is** honoured, with an inline comment.)

**D. `wall.inboxCount` ("Inbox ({n})") is unused.**
Brief §4.2: *"Owner sees 'Inbox (n)' entry point"* on the Wall. Every prototype instead gives Inbox its own bottom-nav tab and shows the count as a badge. Two different entry-point models.

**E. Nothing exists for `/admin` (brief §4.9).**
Expected — the brief says it need not be designed — but recorded so nobody looks for it.

### Rules the prototype invents that the brief does not state

**F. Country is derived from the section and locked, not picked.**
Brief §4.1 lists a *"country picker"* among the profile fields. The prototype renders Country as a read-only `--surface-muted` row with a `Lock` icon, filled from the chosen section. Arguably more consistent with the `Country → Section → User` graph, but it contradicts the stated screen spec, and it makes a section change also a country change.

**G. Changing your section sends you back to the approval queue.**
The Settings prototype adds a whole flow: *"Changing your section sends your profile back to the admin queue. You can read everything while you wait, but you can't post or write to anyone until you're approved again."* This is a new product rule and implies a **read-only pending state** that the brief never defines (the brief's `pending` account simply cannot use the app).

**H. Muted-words behaviour is specified only in the prototype.**
*"Messages with these words skip your inbox and land in Private."* The brief lists "muted words" with no defined behaviour. Note this also means a muted message is still delivered and stored, not blocked.

**I. Rejection is reversible by a moderator.**
Brief §4.5: *"Rejected posts are invisible to everyone except the sender, who sees 'not published'."* The prototype adds a moderator-visible **Rejected** filter with an **"Approve anyway"** action, so a post the sender was told was "not published" can later become public. Both the moderation model and the sender-facing copy depend on which way this goes.

**J. A moderator's own room post bypasses the queue.**
`full-app.jsx`: `const immediate = ev.mode === "post_immediately" || isMod(ev)`. The brief says that in `approve_first`, room posts wait in the queue, with no exemption.

**K. Board mode can be changed mid-event.**
Brief gives `event_moderator` *"close board, set end time"*. Changing `approve_first` ⇄ `post_immediately` after creation is not listed. The prototype's own copy flags the edge case: *"The {n} already waiting still need a decision."*

**L. A fourth event state: "closed" as distinct from "archived".**
The brief's model is `upcoming | live | archived`. The prototypes add a `closed` boolean on a live event, rendered as `StatusPill status="archived" label="Closed"` with the chip reading "Closed 21:41". That is a schema question, not just a label.

**M. Reveal is one-way and permanent per thread.**
Brief §4.7 gives the sender a "Reveal myself" action but does not say it is irreversible. The prototype states it three times in copy and enforces it.

**N. Thread messages store the level they were sent at.**
The brief says *"Sender's anonymity level persists in the thread."* The prototype goes further: each message snapshots `asLevel`, so pre-reveal bubbles stay masked after a reveal. This is a schema requirement (`anonymity_level` per thread message, plus a current level per participant), and it matches `CLAUDE.md`'s engineering convention that **every** content row stores its own `anonymity_level` — but the "current level per participant" half is additional.

**O. Blocking deletes content for the blocker.**
Brief §5: *"Block is absolute: blocked user cannot write to the blocker in any surface."* The prototype additionally removes the message from the inbox and removes the whole thread. Deleting vs. hiding matters for KVKK and for the reports queue.

**P. Settings has items the brief does not list.**
Brief §4.8 lists four. The prototype adds: Edit profile, Change section, Log out, Language, Privacy policy, Terms of use, a version line, and a fourth notification toggle (**Event reminders**) on top of the brief's three (inbox, threads, board mentions).

**Q. Inbox is split into three filters (New / Private / On wall).**
The brief describes the Inbox as one list, newest first, and calls it *"private, owner only"*. The prototype's "On wall" filter surfaces already-public messages inside the private inbox, and introduces a three-state message model (`new | private | approved`) plus a "Take off the wall" action that the brief's action list does not include.

**R. Report reasons and content limits are invented.**
Five fixed report reasons; name 40 / bio 80 / event name 40 / post 280 / thread message 500 / muted word 30 / password ≥ 8. None are in the brief; all need to become server-side constraints.

**S. Sign-up requires a password; phone is optional.**
Brief: *"Register with email + phone or social login."* Prototype: email + password required, phone optional with the hint "For the day you forget the one above", plus Apple and Google placeholder buttons.

**T. Writing to a person from the event People roster.**
`live-board-app.jsx` puts a `PenLine` "Write to {name}" button on every People row. This stays inside an event, so it does not breach *"no cold DMs from profiles"*, but it is an entry point the brief does not describe.

**U. Create-event scope is narrower than the brief.**
Brief: *"Event belongs to a Section or to the national level of a Country."* The prototype offers only "My section" or "National" — you cannot create an event for a section you are not in. Probably correct, but it is a narrowing, not the brief's wording.

### Honesty and internal-consistency problems

**V. The prototypes pad counts, which the honesty principle forbids.**
`live-board-app.jsx` renders `posts.length + 334` posts, `MEMBERS.length + 204` members, and `MEMBERS.length + 205` on the People tab — three different numbers for the same room on one screen. The projector shows `MEMBERS.length + 204`. Brief principle 4 is *"Never fake anything… No seeded or synthetic content, ever."* This is demo padding, but the header **must** derive from real data in the app, and the prototype's numbers must not be copied as layout constants.

**W. Three different bottom navigations.**
`full-app`: Events · Inbox · Threads · Profile (4). `thread-app`: Board · Inbox · Threads (3). `inbox-wall-app`: Events · Inbox · Wall (3). Note `full-app` uses the `StickyNote` icon for a tab labelled "Profile", while `inbox-wall-app` uses the same icon for a tab labelled "Wall". The information architecture has to be settled before step 1.

**X. The National Platform join code differs between prototypes.**
`events-app.jsx` says `ESN026`; `full-app.jsx` and the Test Script say `NPL026`, printed as `NPL-026`.

**Y. Three separators for the same 6-character code.**
`events.enterCode` says *"Enter the 6-character code"*; `JoinCodeBlock.d.ts` says it renders as `"K7Q 4ZM"` (space); the Join input displays `XXX-XXX` (hyphen) with `maxLength 7`; the Test Script and demo panel write `NPL-026`. The Test Script itself lists this as something to watch: *"Does the dash in XXX-XXX confuse anyone?"*

**Z. The queue can become unreachable.**
In `full-app.jsx` the Queue tab renders only when `mode === "approve_first"`. A moderator who switches to "Post immediately" while posts are waiting loses the only route to them — and the `ControlsSheet` copy explicitly says those posts *"still need a decision"*. The standalone `mod-queue-app.jsx` keeps the Queue tab in both modes. This looks like a defect in the stitched prototype, not a design intent.

**AA. Projector behaviour is under-specified and inconsistent.**
Brief §4.5 asks for an *"auto-scrolling"* view. `live-board-app.jsx` cycles pairs of posts on a 4.2s interval; `full-app.jsx` renders the newest two and never moves. Neither scrolls. The real behaviour (scroll speed, how many posts, what happens when a new post arrives, what happens when the board is quiet) is undefined.

**BB. `AnonymityBadge` size on the projector: `lg` or `xl`?**
`readme.md` says *"sender badge at `xl`"*; `ProjectorPost.prompt.md` and `AnonymityBadge.prompt.md` say `lg`.

**CC. The string tables do not cover the copy the prototypes show.**
This is the largest gap for the i18n step.
- `strings/en.json` / `tr.json` hold roughly 150 keys. The Settings prototype alone defines ~65 inline keys that **do not exist** in those files (`anyoneDesc`, `namedOnlyDesc`, `nobodyDesc`, `whoNote`, `blockedNote`, `mutedNote`, `changeSectionNote`, `sectionConfirmTitle`, `sectionConfirmBody`, `delete1Body`, `delete1Note`, `delete2Body`, `deleteWord`, `notifEvents`, `notifEventsDesc`, `logOutBody`, `legal`, `privacyPolicy`, `terms`, `opensBrowser`, `version`, …).
- Every other prototype hard-codes English: all onboarding copy, every empty state, every toast, all five report reasons, all confirm-sheet bodies, the coach mark, "Board opened 19:00", "everyone here was approved by an admin", "Only you see this", "Waiting for approval", and so on.
- `live-board-app.jsx` reads `window.__BRAND_STRINGS__` into `T`, which is never populated and never used.
- **Turkish is only exercised in the Settings prototype.** No other screen has ever been rendered in `tr`, and the Test Script is English-only — so the "one locale per surface" rule is asserted but untested on the main screens.
- Consequence: the i18n key set has to be *derived from the prototypes* and back-filled into both tables before step 1, not lifted from `strings/*.json` as-is.

**DD. Turkish `EventCard` labels live in two places.**
`EVENT_MONTHS` / `EVENT_LABELS` are exported from `EventCard.jsx`, while `dates.monthsShort` and `status.*` exist in the string tables. Two sources for the same strings; they must not be allowed to drift.

**EE. The hatched shell is used in stage 1 for messages that are not actually locked.**
The brief says every card renders unlocked in stage 1. The prototype honours that (`unlocked` prop) but still gives two specific inbox messages the hatched, dashed `LockedCard` shell — visually marking them as different when, to a stage-1 user, they are not. The Test Script treats this as an open question: *"Do the hatched (formerly locked) cards raise questions?"* Decide whether stage 1 shows the hatched shell at all.

---

## 8. Notes for the implementation steps

Not contradictions — practical consequences of the above.

- **Tokens → RN.** `oklch()` and `color-mix()` are unsupported in React Native; pre-convert every colour to hex/rgb at build time and keep the oklch values in a comment. CSS custom properties, `filter: blur()`, `repeating-linear-gradient`, `background-image` hatching, `text-wrap: balance/pretty`, `font-variant-numeric` and `@media (prefers-reduced-motion)` all need RN equivalents (`expo-blur` or a pre-rendered hatch, `AccessibilityInfo.isReduceMotionEnabled`, `fontVariant: ["tabular-nums"]`).
- **The `font:` shorthand** used throughout the tokens has to be decomposed into `fontFamily / fontWeight / fontSize / lineHeight` for RN. Line heights in the tokens are unitless multipliers; RN wants absolute pixels.
- **`--event` needs a React context**, not a style variable — see §1.3.
- **`styleInject.js` and `ensureStyle()`** are the web components' CSS mechanism and disappear entirely; the CSS strings inside each `.jsx` are the spec to translate.
- **`Swipe`** is built on pointer events with `setPointerCapture`. Rebuild on `react-native-gesture-handler`, keeping: 90px commit threshold, ±150px clamp, vertical-drag rejection, and the tap-suppression after a drag.
- **Promote the inline patterns** in §2.5 into the component library during step 1, or every screen step will re-invent them with drift, exactly as the prototypes did.
- **Locked cards ship unlocked behind a config flag.** The wiring is already marked in two prototypes with the same comment: drop `unlocked`, pass `onUnlock`, and `LockedCard` renders the full-width Unlock button in place of the action row. Keep that slot reserved.
- **Reading the source again.** Everything here came from the Claude Design MCP; individual component `.jsx` files carry pixel-level CSS not reproduced in this document. Fetch them per component as each is built:
  `DesignSync get_file projectId=53473b1a-7982-4553-910f-db1346106023 path=components/<group>/<Name>.jsx`
