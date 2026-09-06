// Inbox + Wall prototype — uses window.DS (design-system components) and window.React.
(function () {
  const { useState, useEffect, useRef } = React;
  const DS = new Proxy({}, { get: (_, k) => (window.DS || {})[k] });

  const OWNER = { id: "deniz", name: "Deniz Aksoy", section: "ESN Ankara", country: "Türkiye", bio: "Board member at ESN Ankara. Will fight you over the aux cable." };
  const VISITOR = { id: "giulia", name: "Giulia Ferri", section: "ESN Bologna", country: "Italy" };
  const NP = "National Platform 2026";
  // t = minutes ago. state: new | private | approved. fromBoard = approved from an event board.
  const SEED = [
    { id: "i1", t: 3, state: "new", text: "you're the reason the karaoke didn't die at 1am 🎤", sender: { level: "anonymous" }, source: NP },
    { id: "i2", t: 25, state: "new", text: "your bus talk about Ankara nightlife sold me. planning a trip in spring", sender: { level: "hint", hints: { section: "ESN Bologna", letter: "G" } }, source: NP },
    { id: "i3", t: 70, state: "new", text: "thanks for covering my door shift. I owe you a döner", sender: { level: "named", name: "Ahmet Yıldız" } },
    { id: "l1", t: 190, state: "new", locked: true, text: "I don't know how to say this without it being weird but the way you ran the opening session made a lot of first-timers feel like they belonged. Mine included.", sender: { level: "hint", hints: { country: "Italy" } }, source: NP },
    { id: "i4", t: 1500, state: "new", text: "green jacket by the DJ was me. still asking for a friend?", sender: { level: "anonymous" }, source: NP },
    { id: "l2", t: 1560, state: "new", locked: true, text: "okay your playlist carried the whole bus home", sender: { level: "anonymous" }, source: NP },
    { id: "i5", t: 4400, state: "private", text: "you looked tired at the desk today. drink water, section leader", sender: { level: "hint", hints: { section: "ESN Ankara" } } },
    { id: "w1", t: 2900, state: "approved", fromBoard: true, text: "Best section leader ESN Ankara has had. Don't tell the others.", sender: { level: "named", name: "Ece Kara" }, source: NP },
    { id: "w2", t: 7300, state: "approved", text: "you make people feel welcome without even trying", sender: { level: "anonymous" } },
    { id: "w3", t: 13000, state: "approved", fromBoard: true, text: "the İzmir table still talks about your karaoke duet", sender: { level: "hint", hints: { section: "ESN İzmir" } }, source: "İzmir Welcome Night" },
  ];
  const fmt = (m) => (m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`);
  const byNewest = (a, b) => a.t - b.t;
  const first = (n) => n.split(" ")[0];

  const S = {
    frame: { width: 390, height: 844, borderRadius: 48, background: "var(--bg)", position: "relative", overflow: "hidden", boxShadow: "0 0 0 10px #111, 0 30px 80px rgba(0,0,0,.35)", fontFamily: "var(--font-body)", color: "var(--text)", display: "flex", flexDirection: "column" },
    status: { height: 54, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 30px 6px", font: "600 15px/1 var(--font-body)", flex: "none" },
    header: { padding: "6px 16px 12px", display: "flex", flexDirection: "column", gap: 12, flex: "none", background: "var(--bg)" },
    hrow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 },
    title: { font: "var(--display-lg)", letterSpacing: "var(--display-tracking)", textTransform: "uppercase", margin: 0, lineHeight: 0.95 },
    feed: { flex: 1, overflowY: "auto", padding: "4px 16px 24px", display: "flex", flexDirection: "column", gap: 12, position: "relative" },
    item: { flex: "none" },
    lbl: { font: "var(--caption-caps)", letterSpacing: "var(--caption-caps-tracking)", textTransform: "uppercase", color: "var(--text-2)" },
    row: { appearance: "none", border: 0, background: "none", display: "flex", alignItems: "center", gap: 14, minHeight: 52, padding: "0 4px", cursor: "pointer", font: "var(--body)", color: "var(--text)", textAlign: "left", width: "100%", borderRadius: "var(--r-md)" },
  };

  function StatusBar() {
    return (
      <div style={S.status}>
        <span>21:41</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}><DS.Icon name="Signal" size={15} strokeWidth={2.5} /><DS.Icon name="Wifi" size={15} strokeWidth={2.5} /><DS.Icon name="BatteryFull" size={18} strokeWidth={2} /></span>
      </div>
    );
  }

  function Empty({ icon, text }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "72px 24px", textAlign: "center" }}>
        <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--surface-muted)", color: "var(--text-3)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><DS.Icon name={icon} size={24} /></span>
        <p style={{ margin: 0, font: "var(--body)", color: "var(--text-2)", textWrap: "balance", maxWidth: 240 }}>{text}</p>
      </div>
    );
  }

  function Profile({ user, count }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <DS.Avatar name={user.name} size="xl" />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <h1 style={S.title}>{user.name}</h1>
            <span style={{ font: "var(--body-sm)", color: "var(--text-2)" }}>{user.section} · {user.country}</span>
          </div>
        </div>
        <p style={{ margin: 0, font: "var(--body)", textWrap: "pretty" }}>{user.bio}</p>
        <span style={{ display: "inline-flex", gap: 5, alignItems: "center", font: "var(--body-sm-strong)", color: "var(--text-2)" }}><DS.Icon name="MessageSquare" size={14} strokeWidth={2.25} />{count} on the wall</span>
      </div>
    );
  }

  function BottomNav({ tab, onChange, inboxCount, onEvents }) {
    const items = [{ id: "events", label: "Events", icon: "CalendarDays" }, { id: "inbox", label: "Inbox", icon: "Inbox", count: inboxCount }, { id: "wall", label: "Wall", icon: "StickyNote" }];
    return (
      <nav style={{ flex: "none", height: 84, borderTop: "1px solid var(--border)", background: "var(--surface)", display: "grid", gridTemplateColumns: "repeat(3,1fr)", padding: "6px 8px 22px" }}>
        {items.map((it) => {
          const on = tab === it.id;
          return (
            <button key={it.id} type="button" onClick={() => (it.id === "events" ? onEvents() : onChange(it.id))} style={{ appearance: "none", border: 0, background: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", color: on ? "var(--text)" : "var(--text-3)", font: "var(--caption)", fontWeight: on ? 600 : 500, position: "relative" }}>
              <span style={{ position: "relative", display: "inline-flex" }}>
                <DS.Icon name={it.icon} size={22} strokeWidth={on ? 2.5 : 2} />
                {it.count ? <span style={{ position: "absolute", top: -6, right: -10, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "var(--ink-900)", color: "#fff", font: "700 11px/18px var(--font-body)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{it.count}</span> : null}
              </span>
              {it.label}
            </button>
          );
        })}
      </nav>
    );
  }

  // Composer targeted at a wall: no target picker, same anonymity selector + live preview as the board composer.
  function WallComposer({ me, owner, onClose, onSend }) {
    const [text, setText] = useState("");
    const [lvl, setLvl] = useState("anonymous");
    const [hf, setHf] = useState({ section: true });
    const hints = lvl === "hint" ? { section: hf.section ? me.section : null, country: hf.country ? me.country : null, letter: hf.letter ? me.name.charAt(0) : null } : undefined;
    const sender = { level: lvl, name: lvl === "named" ? me.name : undefined, hints };
    const anonL = { anonymous: "Anonymous", anonymousSub: "No trace", hint: "Hint", hintSub: "Pick your clues", named: "Named", namedSub: "Name + photo", showThem: "Show them", section: "Section", country: "Country", letter: "First letter", preview: "They'll see" };
    return (
      <DS.Sheet title={`To ${first(owner.name)}'s wall`} onClose={onClose} style={{ maxHeight: "94%" }}>
        <DS.Input multiline rows={3} autoFocus value={text} onChange={setText} maxLength={280} placeholder={`Say something to ${first(owner.name)}`} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Post as</span>
          <DS.AnonymitySelector value={lvl} onChange={setLvl} hintFields={hf} onHintFieldsChange={setHf} me={me} labels={anonL} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Your card</span>
          <DS.PostCard text={text.trim() || "…"} sender={sender} time="now" style={{ opacity: text.trim() ? 1 : 0.6 }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--body-sm)", color: "var(--text-2)" }}><DS.Icon name="Inbox" size={16} /><span>Goes to {first(owner.name)}'s inbox first. They decide if it goes on the wall.</span></div>
        <DS.Button size="lg" full icon="Send" disabled={!text.trim()} onClick={() => onSend({ text: text.trim(), sender })}>Send</DS.Button>
      </DS.Sheet>
    );
  }

  function MoreSheet({ msg, onClose, onPick }) {
    const items = [
      { id: "reply", icon: "Reply", label: "Reply privately" },
      msg.state === "approved" ? { id: "private", icon: "EyeOff", label: "Take off the wall" } : null,
      { id: "report", icon: "Flag", label: "Report" },
      { id: "block", icon: "Ban", label: msg.sender.level === "named" ? `Block ${first(msg.sender.name)}` : "Block sender" },
      { id: "delete", icon: "Trash2", label: "Delete", danger: true },
    ].filter(Boolean);
    return (
      <DS.Sheet onClose={onClose}>
        <DS.PostCard text={msg.text} sender={msg.sender} time={fmt(msg.t)} source={msg.source} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((it) => (
            <button key={it.id} type="button" onClick={() => onPick(it.id)} style={{ ...S.row, color: it.danger ? "var(--danger)" : "var(--text)" }}>
              <DS.Icon name={it.icon} size={20} /><span>{it.label}</span>
            </button>
          ))}
        </div>
      </DS.Sheet>
    );
  }

  function ConfirmSheet({ title, body, action, onClose, onConfirm }) {
    return (
      <DS.Sheet title={title} onClose={onClose}>
        <p style={{ margin: 0, font: "var(--body)", color: "var(--text-2)", textWrap: "pretty" }}>{body}</p>
        <DS.Button size="lg" full variant="danger" onClick={onConfirm}>{action}</DS.Button>
        <DS.Button size="lg" full variant="ghost" onClick={onClose}>Cancel</DS.Button>
      </DS.Sheet>
    );
  }

  function ReportSheet({ msg, onClose, onDone }) {
    const [reason, setReason] = useState(null);
    const reasons = ["Harassment or bullying", "Hate or discrimination", "Sexual content", "Reveals someone's identity", "Spam"];
    return (
      <DS.Sheet title="Report" onClose={onClose}>
        <DS.PostCard text={msg.text} sender={msg.sender} time={fmt(msg.t)} />
        <span style={S.lbl}>What's wrong?</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{reasons.map((r) => <DS.Chip key={r} selected={reason === r} onClick={() => setReason(r)}>{r}</DS.Chip>)}</div>
        <DS.Button size="lg" full variant="danger" disabled={!reason} icon="Flag" onClick={onDone}>Report</DS.Button>
      </DS.Sheet>
    );
  }

  function App() {
    const [role, setRole] = useState("owner");
    const [tab, setTab] = useState("inbox");
    const [filter, setFilter] = useState("new");
    const [msgs, setMsgs] = useState(SEED);
    const [sheet, setSheet] = useState(null); // { kind: more | report | delete | block | compose, msg }
    const [toast, setToast] = useState(null);
    const timers = useRef([]);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const say = (t) => { setToast(t); later(() => setToast(null), 3000); };

    const newMsgs = msgs.filter((m) => m.state === "new").sort(byNewest);
    const privMsgs = msgs.filter((m) => m.state === "private").sort(byNewest);
    const wallMsgs = msgs.filter((m) => m.state === "approved").sort(byNewest);
    const list = filter === "new" ? newMsgs : filter === "private" ? privMsgs : wallMsgs;

    const setState = (id, state) => setMsgs((ms) => ms.map((m) => (m.id === id ? { ...m, state, entering: state === "approved" } : m)));
    const approve = (m) => { setState(m.id, "approved"); say({ message: "On your wall", action: "View", onAction: () => { setToast(null); setTab("wall"); } }); };
    const keepPrivate = (m) => { setState(m.id, "private"); say({ message: m.state === "approved" ? "Off the wall. Kept private." : "Kept private" }); };
    const remove = (m) => { setMsgs((ms) => ms.filter((x) => x.id !== m.id)); setSheet(null); say({ message: "Deleted" }); };
    const block = (m) => { setMsgs((ms) => ms.filter((x) => x.id !== m.id)); setSheet(null); say({ message: "Blocked. They can't write to you again." }); };
    const pick = (m, id) => {
      if (id === "reply") { setSheet(null); say({ message: "Private thread opened", action: "View" }); }
      else if (id === "private") { setSheet(null); keepPrivate(m); }
      else setSheet({ kind: id, msg: m });
    };
    const sendToWall = ({ text, sender }) => {
      setMsgs((ms) => [{ id: "v" + Date.now(), t: 0, state: "new", text, sender, entering: true }, ...ms]);
      setSheet(null);
      say({ message: `Sent to ${first(OWNER.name)}'s inbox. They decide if it goes public.` });
    };
    const actionsFor = (m) => {
      if (m.state === "new") return [{ label: "Approve to wall", icon: "Check", onClick: () => approve(m) }, { label: "Keep private", onClick: () => keepPrivate(m) }];
      if (m.state === "private") return [{ label: "Approve to wall", icon: "Check", variant: "secondary", onClick: () => approve(m) }];
      return [{ label: "Keep private", icon: "EyeOff", variant: "secondary", onClick: () => keepPrivate(m) }];
    };

    const InboxCard = ({ m }) => m.locked ? (
      // Stage 1: locked cards ship unlocked. When unlocking launches, drop `unlocked` and pass onUnlock={…} —
      // LockedCard renders the full-width "Unlock" button in place of the actions below.
      <DS.LockedCard unlocked level={m.sender.level} hints={m.sender.hints} text={m.text} time={fmt(m.t)} source={m.source} style={S.item}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {actionsFor(m).map((a, i) => <DS.Button key={i} size="sm" variant={a.variant || (i === 0 ? "primary" : "secondary")} icon={a.icon} onClick={a.onClick}>{a.label}</DS.Button>)}
          <span style={{ flex: 1 }} /><DS.IconButton icon="Ellipsis" label="More" size="sm" onClick={() => setSheet({ kind: "more", msg: m })} />
        </div>
      </DS.LockedCard>
    ) : (
      <DS.PostCard text={m.text} sender={m.sender} time={fmt(m.t)} source={m.source} entering={m.entering && m.state === "new"} onMore={() => setSheet({ kind: "more", msg: m })} actions={actionsFor(m)} style={S.item} />
    );

    const owner = role === "owner";
    const view = owner ? tab : "wall";
    const label = view === "inbox" ? "Inbox" : owner ? "Wall" : "Wall (visitor)";

    return (
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", padding: 32, minHeight: "100vh", boxSizing: "border-box", background: "#e8e8e8", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={S.frame} data-screen-label={label}>
          <StatusBar />
          {view === "inbox" ? (
            <header style={S.header}>
              <div style={S.hrow}><h1 style={S.title}>Inbox</h1><DS.IconButton icon="Settings" label="Who can write to me" onClick={() => say({ message: "Settings live in the next flow" })} /></div>
              <DS.Tabs variant="segmented" value={filter} onChange={setFilter} items={[{ id: "new", label: "New", count: newMsgs.length || undefined }, { id: "private", label: "Private" }, { id: "wall", label: "On wall" }]} />
            </header>
          ) : (
            <header style={{ ...S.header, paddingBottom: 4 }}>
              <div style={S.hrow}>
                {owner ? <h1 style={S.title}>Wall</h1> : <DS.IconButton icon="ArrowLeft" label="Back" onClick={() => say({ message: "Back to the event" })} />}
                <DS.IconButton icon="Share" label="Share wall" onClick={() => say({ message: "Link copied" })} />
              </div>
            </header>
          )}

          <div style={{ ...S.feed, paddingBottom: owner ? 24 : 120 }}>
            {view === "inbox" ? (
              list.length ? list.map((m) => <InboxCard key={m.id} m={m} />)
                : <Empty icon={filter === "new" ? "Inbox" : filter === "private" ? "EyeOff" : "StickyNote"} text={filter === "new" ? "Nothing yet — join an event to get messages" : filter === "private" ? "Messages you keep private land here" : "Approved messages will show here"} />
            ) : (
              <>
                <Profile user={OWNER} count={wallMsgs.length} />
                {wallMsgs.length ? wallMsgs.map((m) => (
                  <DS.PostCard key={m.id} large text={m.text} sender={m.sender} time={fmt(m.t)} approvedFromBoard={m.fromBoard} entering={m.entering} onMore={owner ? () => setSheet({ kind: "more", msg: m }) : undefined} style={S.item} />
                )) : <Empty icon="StickyNote" text="Approved messages will show here" />}
              </>
            )}
          </div>

          {owner ? <BottomNav tab={tab} onChange={setTab} inboxCount={newMsgs.length} onEvents={() => say({ message: "Events live in the Live Event Board prototype" })} /> : null}
          {!owner ? <div style={{ position: "absolute", left: 16, right: 16, bottom: 34, zIndex: 5 }}><DS.Button size="lg" full icon="PenLine" onClick={() => setSheet({ kind: "compose" })}>Write on the wall</DS.Button></div> : null}
          {toast ? <div style={{ position: "absolute", bottom: owner ? 100 : 108, left: 16, right: 16, display: "flex", justifyContent: "center", zIndex: 6 }}><DS.Toast message={toast.message} action={toast.action} onAction={toast.onAction || (() => setToast(null))} /></div> : null}

          {sheet && sheet.kind === "compose" ? <WallComposer me={VISITOR} owner={OWNER} onClose={() => setSheet(null)} onSend={sendToWall} /> : null}
          {sheet && sheet.kind === "more" ? <MoreSheet msg={sheet.msg} onClose={() => setSheet(null)} onPick={(id) => pick(sheet.msg, id)} /> : null}
          {sheet && sheet.kind === "report" ? <ReportSheet msg={sheet.msg} onClose={() => setSheet(null)} onDone={() => { setSheet(null); say({ message: "Reported. Only the admin sees who sent it." }); }} /> : null}
          {sheet && sheet.kind === "delete" ? <ConfirmSheet title="Delete message?" body="It goes from your inbox and your wall. No undo." action="Delete" onClose={() => setSheet(null)} onConfirm={() => remove(sheet.msg)} /> : null}
          {sheet && sheet.kind === "block" ? <ConfirmSheet title="Block sender?" body={sheet.msg.sender.level === "named" ? `${first(sheet.msg.sender.name)} can't write to you again. This message is removed.` : "You won't learn who they are, but they can't write to you again. This message is removed."} action="Block" onClose={() => setSheet(null)} onConfirm={() => block(sheet.msg)} /> : null}
        </div>

        <aside style={{ width: 240, display: "flex", flexDirection: "column", gap: 14, padding: 16, background: "#fff", borderRadius: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>
          <span style={S.lbl}>Demo controls</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Viewing as</span>
            <DS.Tabs variant="segmented" value={role} onChange={(r) => { setRole(r); setSheet(null); if (r === "owner") setTab("wall"); }} items={[{ id: "owner", label: "Deniz (owner)" }, { id: "visitor", label: "Giulia (visitor)" }]} />
            <span>{owner ? "Private inbox + own wall. Approve moves a message to the wall; Keep private moves it to the Private filter." : "Public wall only. Write on the wall opens the composer; it lands in Deniz's inbox as a new message."}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Flow</span>
            <span>Inbox → Approve to wall → toast “View” → Wall. Overflow (…) has Reply privately, Report, Block, Delete (confirm sheets).</span>
            <span>Two hatched cards are LockedCards in the unlocked state; no Unlock button in stage 1.</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <DS.Button variant="secondary" size="sm" icon="Eraser" onClick={() => { setMsgs([]); setSheet(null); }}>Show empty</DS.Button>
            <DS.Button variant="ghost" size="sm" icon="RotateCcw" onClick={() => setMsgs(SEED)}>Reset</DS.Button>
          </div>
        </aside>
      </div>
    );
  }

  function Gate() {
    const [ready, setReady] = useState(!!(window.DS && window.DS.PostCard));
    useEffect(() => {
      if (ready) return;
      const on = () => setReady(true);
      window.addEventListener("ds-ready", on);
      const iv = setInterval(() => { if (window.DS && window.DS.PostCard) { setReady(true); clearInterval(iv); } }, 100);
      return () => { window.removeEventListener("ds-ready", on); clearInterval(iv); };
    }, [ready]);
    if (!ready) return <div style={{ padding: 40, font: "500 14px/1.4 Figtree, sans-serif", color: "#6b6b6b" }}>Loading components…</div>;
    return <App />;
  }
  window.InboxWallApp = Gate;
})();
