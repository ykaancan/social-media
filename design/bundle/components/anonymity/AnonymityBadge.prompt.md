Sender block for cards: never render a sender without it, and never let the level be ambiguous.

```jsx
<AnonymityBadge level="anonymous" labels={{ anonymous: t.anon.anonymous }} />
<AnonymityBadge level="hint" hints={{ section: "ESN İzmir", letter: "S" }} />
<AnonymityBadge level="named" name="Şeyma Kaya" />
```

Sizes: `sm` inside dense lists and threads, `md` on cards, `lg` on projector.
