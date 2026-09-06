Event tile for "My events". Pass the event's cover token pair; the card sets `--event` for its children.

Single night:
```jsx
<EventCard name="National Platform 2026" status="live" cover="var(--cover-magenta)" coverSoft="var(--cover-magenta-soft)"
  day="14" month={11} timeRange="19:00–02:00" scope="National" memberCount={212} postCount={340} />
```

Multi-day (`dayEnd`; add `monthEnd` when it crosses a month → "30 Nov–2 Dec"):
```jsx
<EventCard name="National Platform 2026" status="upcoming" day="14" dayEnd="16" month={11} scope="National" memberCount={212} />
```

Locale: pass `locale="tr"` and the month abbreviation, status pill and `lang` switch together. Pass `month` as a number (1–12) so it localizes; localize `scope` yourself (`t.events.national`).
```jsx
<EventCard locale="tr" name="National Platform 2026" status="live" day="14" dayEnd="16" month={11} scope="Ulusal" memberCount={212} />
```
Never mix: no "Kas" next to an "Upcoming" pill.
