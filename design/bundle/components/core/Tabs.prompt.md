Tab bar for page sections; counts show live numbers, `hot` marks a queue that needs attention.

```jsx
<Tabs value={tab} onChange={setTab} items={[{id:"board",label:"Board"},{id:"queue",label:"Queue",count:7,hot:true},{id:"people",label:"People",count:212}]} />
<Tabs variant="segmented" value={mode} onChange={setMode} items={[{id:"approve_first",label:"Approve first"},{id:"post_immediately",label:"Post immediately"}]} />
```
