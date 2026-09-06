Projector-mode post: event-colored bar, sender at `lg`, 72–96px text. Stack 2–3 per screen with 64px gaps; auto-scroll newest to top.

```jsx
<div data-theme="projector" style={{ "--event": "var(--cover-lime)", padding: 96, minHeight: 1080 }}>
  <ProjectorPost text="Whoever brought the speaker to the bus: legend." sender={{ level: "hint", hints: { section: "ESN Ankara" } }} time="22:41" reactions={{ "🔥": 31 }} />
</div>
```
