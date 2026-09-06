# Proposed defaults — open questions 4–12

Companion to [`design/HANDOFF.md`](design/HANDOFF.md) §7. Each item is a place where the Claude Design prototype invented a rule the product brief in `CLAUDE.md` does not state, or states differently.

**Status: accepted as proposed, 2026-09-06.** All nine were folded into `CLAUDE.md`, tagged **[D4]**–**[D12]** at each point they amend the brief. `CLAUDE.md` is the contract; this file is the reasoning behind it — read it when you want to know *why* a rule is the way it is, or what would justify changing it (each item's "Flip it if" paragraph). Still nothing implemented.

| # | Question | Default | Verdict |
|---|---|---|---|
| 4 | A fourth event state, "closed" | Keep 3 statuses; add `closed_at` / `closed_by` | **Modify** |
| 5 | Per-message anonymity in threads | Store level per message **and** per participant | **Adopt** |
| 6 | Does blocking delete content? | Hide for the blocker; never delete | **Modify** |
| 7 | Section change re-enters the approval queue | Allow the change, don't re-queue | **Reject** |
| 8 | Moderator can un-reject ("Approve anyway") | Rejection is final; add an undo window instead | **Reject** |
| 9 | Moderator's own room post skips the queue | Yes, narrowly, and logged | **Adopt** |
| 10 | Muted words divert to Private | Yes, and suppress the push | **Adopt** |
| 11 | Country derived from section, locked | Yes — country is not an independent field | **Adopt** |
| 12 | Inbox New / Private / On wall + "Take off the wall" | Yes, in full | **Adopt** |

Items 4, 5 and 6 change the schema, so they need to be settled before migration 1. The rest can wait for their implementation step, though 7 and 11 both land in step 2 (onboarding) and 12 lands in step 5.

---

## 4. A fourth event state, "closed"

**Brief:** `Event` has a status of `upcoming` / `live` / `archived`, plus a start and end time.
**Prototype:** a moderator can "Close board now", producing a state rendered as a `Closed` pill with a chip reading "Closed 21:41" — a live event that behaves like an archived one.

### Default: keep three statuses. Add `closed_at` and `closed_by`.

The prototype isn't really describing a fourth state, it's describing a *reason*. An event stops accepting posts either because its end time passed or because a moderator ended it early. That's one state with two causes.

```
event.status      upcoming | live | archived     (unchanged)
event.closed_at   timestamptz null               -- set only when ended early
event.closed_by   uuid null -> user
```

Closing early sets `status = 'archived'` immediately and stamps `closed_at`. Board writability is `status = 'live'`, full stop — no second condition to forget. The "Closed" label is presentation: render it instead of "Archived" when `closed_at is not null and now() < ends_at`.

**Why:** status drives list grouping, board writability, notification eligibility and the queue. A fourth enum value grows every switch on all of those, permanently, to express something a nullable timestamp already answers. And a moderator who closes a board has ended the event — leaving it in `live` would put it in the wrong group in My events.

**Also decide here — what happens to posts still in the queue when the board closes.** The prototype's own confirm copy promises: *"the {n} waiting won't be published."* Proposal: on close, every `pending` post for that event transitions to `rejected` with `rejection_reason = 'board_closed'`. The sender sees the ordinary "Not published" card, which is true. Do **not** silently leave them pending — that's a post that never resolves.

**Consequences:** `EventCard` and `StatusPill` are unchanged. Two new string keys needed (`events.closedEarly` and a Turkish pair) plus the `closed_at` time in the moderator's chip.

**Flip it if:** you want a board that can be re-opened after closing. Re-opening is much cleaner against an explicit `closed` status than against `archived`. I don't think stage 1 needs it — a moderator who closes by mistake at a live event can create a new board — but it's the one thing the three-status model makes awkward.

---

## 5. Per-message anonymity in threads

**Brief:** *"Sender's anonymity level persists in the thread."* And, from the engineering conventions: *"Every content row (post, message, thread message) stores `sender_id` and `anonymity_level` plus the hint fields the sender allowed."*
**Prototype:** every message stores the level it was **sent at** (`asLevel`), so after a reveal the other side still sees the earlier bubbles masked. There is also an implicit current level per participant, which is what new messages default to and what Reveal changes.

### Default: adopt. Store both.

```
thread_message.anonymity_level   anonymous | hint | named   -- already required by CLAUDE.md
thread_message.hint_section/hint_country/hint_letter        -- as allowed at send time

thread_participant (thread_id, user_id) primary key
  anonymity_level     -- the level NEW messages go out at
  hint_section/country/letter
  revealed_at         timestamptz null
```

Reveal sets `thread_participant.anonymity_level = 'named'`, stamps `revealed_at`, and inserts a system message. **Historical messages are never rewritten.**

**Why:** this is not really an invention — it's the minimum that makes the brief's own two sentences simultaneously true. "The level persists" and "the sender can reveal themselves" only coexist if there's somewhere to record the change that isn't the messages themselves. Without the participant row, Reveal would either have to rewrite history — retroactively unmasking messages the sender sent under a promise of anonymity, which is the single worst bug this app could ship — or not persist at all.

**Consequences:** `ThreadBubble` must render `sender` from **the message's own stored level**, not from the participant's current level. This is the easy thing to get wrong, and it's exactly what the prototype's "Their side" perspective toggle exists to demonstrate. Worth a test.

**Flip it if:** nothing I can think of. This one I'd argue for.

---

## 6. Does blocking delete content?

**Brief §5:** *"Block is absolute: blocked user cannot write to the blocker in any surface, including anonymously."* Silent on existing content.
**Prototype:** block removes the message from the inbox and removes the whole thread. Copy says "This message is removed."

### Default: hide it for the blocker. Never delete another person's content on a block.

```
block (blocker_id, blocked_id, created_at) primary key (blocker_id, blocked_id)
```

- **Delivery:** the server refuses any write from blocked to blocker in every surface — wall message, board post addressed to that person, thread message, reaction. Refused server-side, so anonymity can't route around it.
- **Existing content:** the blocker's inbox, wall and thread list filter out anything authored by a blocked user. Rows stay.
- **Board posts stay on the board.** They were addressed to the room, not to the blocker; removing them would silently rewrite a feed other people are reading.
- The blocked user is not told. (The prototype's copy already gets this right.)
- Reports filed before a block still show the super_admin the full content and identity.

**Block by message id, not by user id.** The client blocking an anonymous sender cannot know who they are — the server resolves the message to its `sender_id` and writes the block row. The blocker never learns the identity. The prototype's copy already promises exactly this: *"You won't learn who they are, but they can't write to you again."*

**Why:** hard deletion destroys evidence the reports queue may need, and it's irreversible — unblocking can't bring the thread back. Hiding produces the same felt result for the blocker at none of that cost. Note this is a different question from account deletion, which stays real deletion per KVKK.

**Consequences:** the prototype's copy has to change. "This message is removed" becomes something honest — "You won't see it again." Same for the thread: "this thread is removed for you" becomes "this thread disappears from your list."

**Flip it if:** you'd rather a blocked person's content genuinely disappear for KVKK comfort. I'd push back — the blocker isn't the data subject of the sender's message — but it's your call and it's defensible.

---

## 7. Section change re-enters the approval queue

**Brief:** section is *"self-selected at sign-up, confirmed by the admin on approval."* Settings (§4.8) lists only: who can write to me, blocked list, muted words, notification toggles, delete account. Section change isn't mentioned either way.
**Prototype:** changing your section sends your profile back to the admin queue — *"You can read everything while you wait, but you can't post or write to anyone until you're approved again."*

### Default: reject for stage 1. Allow the change; don't re-queue.

Allow it, log it, rate-limit it:

- Write every change to the audit log: user, from, to, timestamp.
- One change per 30 days.
- Replace the warning note with a plain one: *"Your section is a tag on your profile. Changing it changes where you show up in rosters — and your country with it."*

**Why:** stage 1 is a few hundred volunteers at one event in Türkiye, all personally known to the admin, with the founder as the only super_admin. Re-queueing someone mid-event because they fixed a section they picked wrong at sign-up means they cannot post at the event they are physically standing in, waiting on one person who is also at that event and busy running it.

The bigger cost is structural: it creates an account state the brief never defines — approved, but read-only, pending re-approval — which has to be threaded through every screen and every server-side write check, and tested. That's real work in every one of steps 2 through 8, to defend against a risk (someone hopping sections to game a hint chip) that a 30-day rate limit and an audit row handle for almost nothing.

**Consequences:** this removes the read-only-pending state entirely, which simplifies step 2. `pending` stays what the brief says it is: an account that cannot use the app yet. Kills five prototype string keys (`changeSectionNote`, `sectionConfirmTitle`, `sectionConfirmBody`, `change`, `changed`) and replaces them with one.

**Flip it if:** you expect section to gate anything real in stage 2 — the invite chain, section rooms, or moderation scope. Then re-approval starts earning its complexity and it'd be better to build the state now than retrofit it. Worth telling me if that's the direction.

---

## 8. Moderator can un-reject ("Approve anyway")

**Brief §4.5:** *"Rejected posts are invisible to everyone except the sender, who sees 'not published'."*
**Prototype:** the queue has a Rejected filter listing what the moderator rejected, each with an **"Approve anyway"** button that publishes it.

### Default: reject. Rejection is final. Add an undo window instead.

- **Keep the Rejected list.** Moderators need to see what they rejected — mis-taps happen, and it's the ground truth when a report comes in about a post nobody can find.
- **Make it read-only.** No "Approve anyway".
- **Add a 5-second undo on the rejection toast**, before the sender is notified. That's where a mis-tap actually gets fixed — three seconds later, not three hours.

**Why:** the sender was told "Not published." If a moderator can flip that hours later, the statement was false when we made it. In an app whose entire premise is that the sender controls their own exposure, that's the wrong thing to be loose about — someone may have written something they were only willing to have rejected, and a delayed publish makes it public without a second consent. The brief's phrasing ("invisible to everyone except the sender") reads as terminal, and the sender-side card already offers the right recovery path: **Rewrite**.

This also matters for item 4: if closing a board rejects the waiting queue, "rejected" needs to mean settled, not parked.

**Consequences:** drops one action from the queue's Rejected filter. Adds an undo affordance to `Toast` — which already has `action` / `onAction`, so it's a timer, not a new component.

**Flip it if:** you expect moderators to reject in bulk under time pressure at a live event and want a safety net wider than five seconds. A middle option: allow "Approve anyway" only while the post is under some age — say 60 seconds — so it's genuinely a mis-tap fix and not a resurrection.

---

## 9. Moderator's own room post skips the queue

**Brief §4.5:** in `approve_first`, room posts wait in the creator's queue until released. No exemption stated.
**Prototype:** `full-app.jsx` publishes a moderator's own room post immediately in both modes (`immediate = mode === 'post_immediately' || isMod(ev)`). The standalone queue prototype does not do this — the two disagree.

### Default: adopt, narrowly, and log it.

- A creator's or co-moderator's post **to the room** publishes immediately in both board modes.
- Nothing else is exempt. Posts to a person behave identically for everyone (straight to that person's inbox, never the queue — brief and prototype already agree).
- The post carries whatever anonymity level the moderator chose, like anyone else's.
- Record it as `auto_approved_by_author` rather than leaving a published post with no decision behind it.
- The composer's approve-first hint is suppressed for them (the prototype already does this).

**Why:** the alternative is a moderator approving their own post one second after writing it, which is ceremony, not review. At a live event the moderator is the person posting the logistics that must not sit in a queue — "bus back to the hotel leaves at 02:00 sharp". And it grants no power they don't have: a moderator can already approve their own queued post. The exemption changes the number of taps, not who can put what on the board.

**Consequences:** one branch in the send path, one audit value.

**Flip it if:** you'd rather have no special case in the publish path at all. The equivalent-outcome alternative: keep moderator posts queued, but have the composer auto-approve on send and label its button "Post" instead of "Send". Same result, no exemption in the data model — slightly more code, slightly cleaner story.

---

## 10. Muted words divert to Private

**Brief §4.8:** lists "muted words" with no defined behaviour. Separately, §5 requires server-side keyword + model screening on every message before delivery, with a hard-block list and a soft-flag list.
**Prototype:** *"Messages with these words skip your inbox and land in Private. Case doesn't matter."*

### Default: adopt, and suppress the push notification.

- Matching is case-insensitive and **Turkish-aware**. The prototype already has the right helper — `toLocaleLowerCase("tr")`, then ı→i, then NFD with diacritics stripped. Move it server-side and use it for muted words, section search and people search alike.
- Substring match for stage 1. Simpler than word-boundary rules across two languages, and it errs toward what the user meant when they muted the word.
- A matched message is **delivered and stored**, lands in `private` state, and **sends no push**.
- The sender is not told. The recipient finds it under the Private filter, on their own terms.

**Why:** the suppressed notification is the actual point — someone mutes a word so it can't ambush them on a lock screen at an event. Filing it quietly gets that. Hard-dropping the message would mean telling the sender it was delivered when it wasn't, which principle 4 forbids, and would destroy content the reports path may need.

**Keep this separate from platform screening.** They are two mechanisms and shouldn't be merged:

| | Who sets it | What happens | Sender sees |
|---|---|---|---|
| Platform screening (§5) | Us | Hard-block: never delivered. Soft-flag: delivered, flagged for review | Pre-send warning ("This might not be delivered") |
| Muted words (§4.8) | The recipient | Delivered, filed to Private, no push | Nothing |

**Consequences:** one new string explaining the behaviour on the Muted words screen (the prototype's is good — reuse it). The `private` state already exists per item 12.

**Flip it if:** you want muted words to bounce the message outright. I'd argue against — it makes the recipient's private preference visible to the sender, which leaks something about them.

---

## 11. Country derived from section, locked

**Brief §4.1:** profile setup includes a *"country picker"*. **Brief §3:** the graph is `Country → Section → User`, and hint level can reveal the sender's country.
**Prototype:** Country is a read-only `--surface-muted` row with a lock icon, filled from the chosen section.

### Default: adopt. Country is not an independent field.

Store `section_id` on the user; country is read through the section. A user who can pick a country that contradicts their section produces rows that can't be reconciled — and, more concretely, breaks the `country` hint chip, which is supposed to be a **true clue** about the sender. A hint that can be set to anything isn't a hint, it's a costume.

I read the brief's "country picker" as describing the sign-up form before the graph in §3 was settled, not as a second stored field. Keep the locked row with the lock icon — it's honest UI that explains where the value came from.

**One sub-question for you, and it's the real one here.** This means a Turkish student on Erasmus at ESN Bologna shows `country: Italy`, not Türkiye. So the country hint means *"where this person sits in the network"*, not their nationality. I think that's right — it's the useful clue at an event, and the prototype's own fixtures assume it (Giulia Ferri, ESN Bologna, Italy, bio "Erasmus in Ankara") — but it changes what a reader infers from the chip, and it's worth you confirming rather than me assuming.

**Consequences:** ties to item 7 — a section change is also a country change, which is why the replacement note there says so out loud. If you later want nationality as a separate profile field, it would be a **display** field, never the hint source.

**Flip it if:** you want the country hint to mean nationality. Then it needs its own field, and the sign-up flow needs the picker the brief describes — but then two users in the same section can show different countries, and the chip stops being checkable against anything.

---

## 12. Inbox filters and "Take off the wall"

**Brief §4.3:** the Inbox is a list, newest first, per-card actions Approve to wall / Keep private / Delete / Reply privately / Report / Block. **§4.2:** the wall shows the messages this person chose to publish.
**Prototype:** a three-state model — `new | private | approved` — behind a segmented New / Private / On wall filter, plus "Take off the wall" from a wall card's overflow and "Approve to wall" again from the Private filter.

### Default: adopt in full.

```
inbox_message.state   new | private | approved
inbox_message.deleted_at  timestamptz null
```

The wall is exactly `state = 'approved'`. Transitions are free in both directions.

**Why:** it's the smallest model that makes the brief's own two actions mean anything over time. Once you have "Approve to wall" and "Keep private" as distinct choices, you have three states whether you name them or not, and the person needs somewhere to see each. Reversibility sits squarely on principle 2 — the recipient curates what is public — and taking something back off your wall is the most predictable thing a person will want the day after approving it.

**Two adjustments:**

- The Inbox stays "private, owner only". The **On wall** filter is a view onto the same table, not a public surface — the wall itself is the public surface. Worth keeping distinct in copy so it doesn't read as though the inbox has a public tab.
- Default filter on open is **New**, and the tab badge counts `new` only. (The prototype already does both.)

**And one change:** the prototype hard-deletes on Delete. Make it a soft delete (`deleted_at`), for the same reason as item 6 — a reported message must survive the reporter deleting it. The user-facing behaviour is identical.

**Flip it if:** you want approving to the wall to be one-way, as a commitment device. I'd argue hard against — it makes every approval a small risk and will make people approve less, which works directly against the metric in brief §8 (approve-to-wall rate).

---

## What this leaves open

Items 1–3 and 13–14 from the review triage are untouched here and still need you:

- **1–3** (component library scope, the bottom navigation, whether stage 1 shows the hatched locked-card shell) block step 1 and are the ones I actually need before the next session.
- **13–14** (the pre-send screening warning, "hide post") aren't decisions — they're two brief requirements nobody designed. They need design before steps 4 and 6 respectively.
- **Projector behaviour** (`HANDOFF.md` §7 AA) is a genuine design gap on the screen the brief calls the "aha" moment.
