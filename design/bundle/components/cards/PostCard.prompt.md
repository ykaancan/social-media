Message card for wall (trophy), board (crowd) and inbox (private). Same shell everywhere; context changes the footer.

```jsx
// board
<PostCard text="Whoever brought the speaker to the bus: legend." sender={{level:"hint",hints:{section:"ESN Ankara"}}} time="2m"
  reactions={{"🔥":12,"😂":4}} myReaction="🔥" onReact={...} onReply={...} entering />
// inbox
<PostCard text="…" sender={{level:"anonymous"}} time="1h" source="National Platform"
  actions={[{label:"Approve to wall",icon:"Check"},{label:"Keep private"}]} onMore={...} />
```
