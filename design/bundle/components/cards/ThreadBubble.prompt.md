Thread bubbles in a `display:flex; flex-direction:column; gap:8px` column. Show `sender` on the first bubble of each run.

```jsx
<ThreadBubble text="hey, that was about you 👀" sender={{level:"hint",hints:{letter:"D"}}} time="22:14" />
<ThreadBubble text="who is this??" mine time="22:15" />
<ThreadBubble system text="Deniz revealed themselves" />
```
