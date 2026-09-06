Pending-approval screen body: tells the new member exactly what happens next.

```jsx
<PendingState title="You're in the queue" subtitle="An admin checks every profile by hand."
  steps={[{label:"Profile sent",done:true},{label:"Admin review",current:true,description:"Usually within a day"},{label:"You're in"}]}
  note="We'll notify you. Nothing to do until then." />
```
