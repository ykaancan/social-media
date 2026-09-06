// Moderation queue prototype — uses window.DS (design-system components) and window.React.
(function () {
  const { useState, useEffect, useRef } = React;
  const DS = new Proxy({}, { get: (_, k) => (window.DS || {})[k] });

  const ME = { id: "me", name: "Şeyma Kaya", section: "ESN İzmir", country: "Türkiye" };
  const MEMBERS = [
    { id: "m1", name: "Deniz Aksoy", section: "ESN Ankara" }, { id: "m2", name: "Giulia Ferri", section: "ESN Bologna" }, { id: "m3", name: "Ahmet Yıldız", section: "ESN İzmir" },
    { id: "m4", name: "Lena Novak", section: "ESN Brno" }, { id: "m5", name: "İrem Doğan", section: "ESN Boğaziçi" }, { id: "m6", name: "Mateo Ruiz", section: "ESN Sevilla" },
    { id: "m7", name: "Ece Kara", section: "ESN Ankara" }, { id: "m8", name: "Jonas Weber", section: "ESN Köln" },
  ];
  // t = minutes ago. status: pending | approved | rejected. `at` orders the board (newest first).
  const SEED = [
    { id: "q1", t: 9, status: "pending", text: "Whoever brought the speaker to the bus: legend.", sender: { level: "hint", hints: { section: "ESN Ankara" } } },
    { id: "q2", t: 7, status: "pending", text: "Kitchen crew, dinner was unreal. Thank you 🙏", sender: { level: "anonymous" } },
    { id: "q3", t: 5, status: "pending", text: "Who's the person in the green jacket by the DJ? Asking for a friend.", sender: { level: "named", name: "Deniz Aksoy" } },
    { id: "q4", t: 3, status: "pending", text: "The Bologna table is winning the karaoke war and it's not close", sender: { level: "hint", hints: { country: "Italy", letter: "G" } } },
    { id: "q5", t: 1, status: "pending", text: "Bus back to the hotel leaves at 02:00 sharp, don't be that person", sender: { level: "named", name: "Ece Kara" } },
    { id: "b1", t: 14, status: "approved", at: 3, text: "Shoutout to the volunteers running the door for six hours straight.", sender: { level: "anonymous" }, reactions: { "❤️": 33 } },
    { id: "b2", t: 22, status: "approved", at: 2, text: "İzmir table has a spare charger if anyone's dying", sender: { level: "hint", hints: { section: "ESN İzmir", letter: "A" } }, reactions: { "❤️": 2 } },
    { id: "b3", t: 31, status: "approved", at: 1, text: "Whoever is running the lights tonight, respect", sender: { level: "named", name: "Jonas Weber" }, reactions: { "🔥": 8 } },
    { id: "r1", t: 12, status: "rejected", text: "room 214 is where the real afterparty is, bring your own cups", sender: { level: "anonymous" } },
  ];
  const INCOMING = [
    { text: "ok the DJ just played a Tarkan remix and the room lost it", sender: { level: "anonymous" } },
    { text: "Sevilla brought churros. SEVILLA BROUGHT CHURROS.", sender: { level: "hint", hints: { section: "ESN Brno" } } },
    { text: "Can the person by the door stop letting the cold in, we're dying here", sender: { level: "named", name: "Mateo Ruiz" } },
    { text: "the Köln table needs one more for the quiz, come find us", sender: { level: "hint", hints: { section: "ESN Köln", letter: "J" } } },
    { text: "Whoever fixed the mic between sets: hero", sender: { level: "anonymous" } },
  ];
  const fmt = (m) => (m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`);
  const first = (n) => n.split(" ")[0];

  const S = {
    frame: { width: 390, height: 844, borderRadius: 48, background: "var(--bg)", position: "relative", overflow: "hidden", boxShadow: "0 0 0 10px #111, 0 30px 80px rgba(0,0,0,.35)", fontFamily: "var(--font-body)", color: "var(--text)", display: "flex", flexDirection: "column" },
    status: { height: 54, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 30px 6px", font: "600 15px/1 var(--font-body)", flex: "none" },
    header: { padding: "6px 16px 0", display: "flex", flexDirection: "column", gap: 10, flex: "none", background: "var(--bg)" },
    hrow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
    title: { font: "var(--display-md)", letterSpacing: "var(--display-tracking)", textTransform: "uppercase", margin: 0, lineHeight: 1 },
    feed: { flex: 1, overflowY: "auto", padding: "12px 16px 120px", display: "flex", flexDirection: "column", gap: 12, position: "relative" },
    item: { flex: "none" },
    lbl: { font: "var(--caption-caps)", letterSpacing: "var(--caption-caps-tracking)", textTransform: "uppercase", color: "var(--text-2)" },
    row: { display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "6px 0" },
    sub: { font: "var(--caption)", color: "var(--text-2)" },
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "64px 24px", textAlign: "center" }}>
        <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--surface-muted)", color: "var(--text-3)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><DS.Icon name={icon} size={24} /></span>
        <p style={{ margin: 0, font: "var(--body)", color: "var(--text-2)", textWrap: "balance", maxWidth: 240 }}>{text}</p>
      </div>
    );
  }

  // Swipe right = approve, left = reject. Reveals a colored bed behind the card; commits past 90px.
  function Swipe({ onApprove, onReject, disabled, children }) {
    const [dx, setDx] = useState(0);
    const [snap, setSnap] = useState(true);
    const start = useRef(null);
    const moved = useRef(false);
    const down = (e) => { if (disabled) return; start.current = { x: e.clientX, y: e.clientY }; moved.current = false; setSnap(false); };
    const move = (e) => {
      if (!start.current) return;
      const d = e.clientX - start.current.x, dy = e.clientY - start.current.y;
      if (!moved.current && Math.abs(d) < 8) return;
      if (!moved.current && Math.abs(dy) > Math.abs(d)) { start.current = null; return; }
      moved.current = true; e.currentTarget.setPointerCapture(e.pointerId);
      setDx(Math.max(-150, Math.min(150, d)));
    };
    const up = () => {
      if (!start.current) return;
      if (dx > 90) onApprove(); else if (dx < -90) onReject();
      start.current = null; setSnap(true); setDx(0);
    };
    const click = (e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } };
    const pct = Math.min(1, Math.abs(dx) / 90);
    return (
      <div style={{ position: "relative", flex: "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={click}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "var(--r-card)", background: dx > 0 ? "var(--live)" : "var(--danger-soft)", color: dx > 0 ? "var(--ink-950)" : "var(--danger)", display: "flex", alignItems: "center", justifyContent: dx > 0 ? "flex-start" : "flex-end", padding: "0 22px", opacity: dx ? 0.35 + pct * 0.65 : 0, transition: snap ? "opacity var(--dur-base)" : "none" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "var(--body-strong)", transform: `scale(${0.8 + pct * 0.3})` }}><DS.Icon name={dx > 0 ? "Check" : "X"} size={24} strokeWidth={2.75} />{pct >= 1 ? (dx > 0 ? "Approve" : "Reject") : ""}</span>
        </div>
        <div style={{ transform: `translateX(${dx}px)`, transition: snap ? "transform var(--dur-base) var(--ease-out)" : "none", touchAction: "pan-y", userSelect: dx ? "none" : "auto" }}>{children}</div>
      </div>
    );
  }

  function ModsSheet({ mods, members, onAdd, onRemove, onClose }) {
    const [adding, setAdding] = useState(false);
    const [q, setQ] = useState("");
    const modIds = new Set(mods.map((m) => m.id));
    const pool = members.filter((m) => !modIds.has(m.id) && m.name.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));
    return (
      <DS.Sheet title={adding ? "Add co-moderator" : "Moderators"} onClose={adding ? () => setAdding(false) : onClose} style={{ maxHeight: "88%" }}>
        {adding ? (
          <>
            <DS.Input placeholder="Search members who joined" value={q} onChange={setQ} autoFocus />
            <span style={S.sub}>Only people who joined National Platform 2026 can moderate it.</span>
            <div style={{ display: "flex", flexDirection: "column", borderRadius: "var(--r-md)", border: "1px solid var(--border)", overflow: "hidden" }}>
              {pool.map((m, i) => (
                <button key={m.id} type="button" onClick={() => { onAdd(m); setAdding(false); setQ(""); }} style={{ appearance: "none", border: 0, borderTop: i ? "1px solid var(--border)" : 0, background: "var(--surface)", display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", minHeight: 56, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}>
                  <DS.Avatar name={m.name} size="sm" />
                  <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{m.name}</span><span style={S.sub}>{m.section}</span></span>
                  <DS.Icon name="Plus" size={18} strokeWidth={2.5} />
                </button>
              ))}
              {!pool.length ? <div style={{ padding: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>No one by that name has joined.</div> : null}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[{ ...ME, role: "Creator" }, ...mods.map((m) => ({ ...m, role: "Co-moderator" }))].map((m) => (
                <div key={m.id} style={S.row}>
                  <DS.Avatar name={m.name} size="md" />
                  <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{m.name}{m.id === "me" ? <span style={{ color: "var(--text-3)", fontWeight: 500 }}> · you</span> : null}</span><span style={S.sub}>{m.role} · {m.section}</span></span>
                  {m.id !== "me" ? <DS.IconButton icon="X" label={`Remove ${first(m.name)}`} size="sm" onClick={() => onRemove(m)} /> : null}
                </div>
              ))}
            </div>
            <span style={S.sub}>Co-moderators see the same queue and can approve or reject. They can't change board settings.</span>
            <DS.Button size="lg" full variant="secondary" icon="UserPlus" onClick={() => setAdding(true)}>Add co-moderator</DS.Button>
          </>
        )}
      </DS.Sheet>
    );
  }

  function ControlsSheet({ mode, onMode, end, onEnd, onCloseBoard, onClose, pendingCount }) {
    return (
      <DS.Sheet title="Board controls" onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Board mode</span>
          <DS.Tabs variant="segmented" value={mode} onChange={onMode} items={[{ id: "approve_first", label: "Approve first" }, { id: "post_immediately", label: "Post immediately" }]} />
          <span style={S.sub}>{mode === "approve_first" ? "Posts to the room wait for you." : `Posts go up as they come.${pendingCount ? ` The ${pendingCount} already waiting still need a decision.` : ""}`}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Ends</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{["01:00", "02:00", "03:00", "No end"].map((v) => <DS.Chip key={v} selected={end === v} onClick={() => onEnd(v)}>{v}</DS.Chip>)}</div>
          <span style={S.sub}>The board closes itself at this time. Posts stay readable.</span>
        </div>
        <DS.Button size="lg" full variant="danger" icon="Square" onClick={onCloseBoard}>Close board now</DS.Button>
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

  function App() {
    const [tab, setTab] = useState("queue");
    const [filter, setFilter] = useState("waiting");
    const [posts, setPosts] = useState(SEED);
    const [mode, setMode] = useState("approve_first");
    const [end, setEnd] = useState("02:00");
    const [closed, setClosed] = useState(false);
    const [live, setLive] = useState(true);
    const [mods, setMods] = useState([MEMBERS[6]]);
    const [selecting, setSelecting] = useState(false);
    const [sel, setSel] = useState(new Set());
    const [sheet, setSheet] = useState(null); // mods | controls | close
    const [toast, setToast] = useState(null);
    const [newCount, setNewCount] = useState(0);
    const feedRef = useRef(null);
    const inc = useRef(0);
    const timers = useRef([]);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const say = (t) => { setToast(t); later(() => setToast(null), 2800); };

    const pending = posts.filter((p) => p.status === "pending" || p.anim).sort((a, b) => b.t - a.t); // oldest first
    const waiting = posts.filter((p) => p.status === "pending").length;
    const approved = posts.filter((p) => p.status === "approved").sort((a, b) => (b.at || 0) - (a.at || 0));
    const rejected = posts.filter((p) => p.status === "rejected").sort((a, b) => a.t - b.t);

    const nearBottom = () => { const el = feedRef.current; return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 140; };
    const arrive = () => {
      const src = INCOMING[inc.current % INCOMING.length]; inc.current++;
      const p = { id: "in" + Date.now(), ...src, t: 0, status: mode === "approve_first" ? "pending" : "approved", at: Date.now(), reactions: {} };
      setPosts((ps) => [...ps, p]);
      if (p.status === "pending" && !(tab === "queue" && filter === "waiting" && nearBottom())) setNewCount((n) => n + 1);
    };
    useEffect(() => {
      if (!live || closed || sheet) return; // paused while a sheet is open
      const id = setInterval(arrive, 7000);
      return () => clearInterval(id);
    }, [live, closed, sheet, mode, tab, filter]);

    const decide = (ids, status) => {
      const set = new Set(ids);
      setPosts((ps) => ps.map((p) => (set.has(p.id) ? { ...p, anim: status } : p)));
      later(() => setPosts((ps) => ps.map((p) => (set.has(p.id) ? { ...p, anim: undefined, status, at: Date.now(), reactions: {}, entering: true } : p))), 320);
      if (status === "approved") say({ message: ids.length > 1 ? `${ids.length} posts on the board` : "On the board", action: "View", onAction: () => { setToast(null); setTab("board"); } });
      else say({ message: ids.length > 1 ? `${ids.length} not published. Only the senders see that.` : "Not published. Only the sender sees that." });
    };
    const approveSel = () => { decide([...sel], "approved"); setSel(new Set()); setSelecting(false); };
    const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const showNew = () => { setNewCount(0); setTab("queue"); setFilter("waiting"); later(() => { const el = feedRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, 50); };
    const onScroll = () => { if (newCount && nearBottom()) setNewCount(0); };
    const closeBoard = () => { setClosed(true); setSheet(null); setSelecting(false); say({ message: "Board closed. It stays readable." }); };

    const list = filter === "waiting" ? pending : filter === "approved" ? approved : rejected;
    const senderView = rejected[0]; // the sender's own view of a rejected post, shown once on the board

    return (
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", padding: 32, minHeight: "100vh", boxSizing: "border-box", background: "#e8e8e8", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ ...S.frame, "--event": "var(--cover-magenta)", "--event-soft": "var(--cover-magenta-soft)" }} data-screen-label={tab === "queue" ? "Queue" : "Board"}>
          <StatusBar />
          <header style={S.header}>
            <div style={S.hrow}>
              <DS.IconButton icon="ArrowLeft" label="Back" onClick={() => say({ message: "Back to my events" })} />
              <div style={{ display: "flex", gap: 6 }}>
                <DS.IconButton icon="Users" label="Moderators" variant="outline" badge={mods.length + 1} onClick={() => setSheet("mods")} />
                <DS.IconButton icon="Settings2" label="Board controls" variant="outline" onClick={() => setSheet("controls")} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h1 style={S.title}>National Platform 2026</h1>
              {closed ? <DS.StatusPill status="archived" label="Closed" /> : <DS.StatusPill status="live" label="Live" />}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <DS.Chip size="sm" tone="event" icon={mode === "approve_first" ? "ShieldCheck" : "Zap"} onClick={() => setSheet("controls")}>{mode === "approve_first" ? "Approve first" : "Post immediately"}</DS.Chip>
              <DS.Chip size="sm" tone="outline" icon="Clock" onClick={() => setSheet("controls")}>{closed ? "Closed 21:41" : end === "No end" ? "No end time" : `Until ${end}`}</DS.Chip>
            </div>
            <DS.Tabs value={tab} onChange={(v) => { setTab(v); setSelecting(false); }} items={[{ id: "queue", label: "Queue", count: waiting || undefined, hot: waiting > 0 }, { id: "board", label: "Board", count: approved.length }]} />
          </header>

          <div ref={feedRef} onScroll={onScroll} style={S.feed}>
            {tab === "queue" ? (
              <>
                <div style={{ ...S.hrow, flex: "none" }}>
                  <DS.Tabs variant="segmented" value={filter} onChange={(f) => { setFilter(f); setSelecting(false); }} items={[{ id: "waiting", label: "Waiting", count: waiting || undefined }, { id: "approved", label: "Approved" }, { id: "rejected", label: "Rejected" }]} style={{ flex: 1 }} />
                  {filter === "waiting" && waiting > 1 && !closed ? <DS.Button size="sm" variant="ghost" onClick={() => { setSelecting((s) => !s); setSel(new Set()); }}>{selecting ? "Cancel" : "Select"}</DS.Button> : null}
                </div>
                {closed && filter === "waiting" ? <Empty icon="Square" text="This board is closed. Nothing new can arrive." /> : null}
                {!closed && filter === "waiting" && !pending.length ? <Empty icon="ListChecks" text="All clear." /> : null}
                {filter === "approved" && !approved.length ? <Empty icon="Radio" text="Nothing approved yet." /> : null}
                {filter === "rejected" && !rejected.length ? <Empty icon="X" text="Nothing rejected." /> : null}
                {filter === "waiting" ? pending.map((p, i) => (
                  <Swipe key={p.id} disabled={selecting || !!p.anim} onApprove={() => decide([p.id], "approved")} onReject={() => decide([p.id], "rejected")}>
                    <DS.QueueCard index={i + 1} text={p.text} sender={p.sender} time={fmt(p.t)} state={p.anim || "pending"} selectable={selecting} selected={sel.has(p.id)} onSelect={() => toggle(p.id)} onApprove={() => decide([p.id], "approved")} onReject={() => decide([p.id], "rejected")} />
                  </Swipe>
                )) : list.map((p) => (
                  <div key={p.id} style={{ ...S.item, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
                      <DS.StatusPill status={p.status === "approved" ? "live" : "rejected"} label={p.status === "approved" ? "On the board" : "Not published"} />
                      {p.status === "rejected" ? <span style={S.sub}>Only the sender sees this</span> : null}
                    </div>
                    <DS.PostCard text={p.text} sender={p.sender} time={fmt(p.t)} style={p.status === "rejected" ? { opacity: 0.7 } : undefined} actions={p.status === "rejected" && !closed ? [{ label: "Approve anyway", icon: "Check", variant: "secondary", onClick: () => decide([p.id], "approved") }] : undefined} />
                  </div>
                ))}
                {filter === "waiting" ? <p style={{ ...S.item, margin: "8px 4px 0", font: "var(--caption)", color: "var(--text-3)", textAlign: "center", textWrap: "pretty", display: "flex", gap: 8, alignItems: "flex-start", textAlign: "left" }}><DS.Icon name="Inbox" size={14} style={{ flex: "none", marginTop: 2 }} />Messages to a person go straight to that person's inbox and never appear in this queue.</p> : null}
              </>
            ) : (
              <>
                {senderView ? (
                  <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ ...S.sub, padding: "0 2px" }}>As the sender sees it · not on anyone else's board</span>
                    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><DS.StatusPill status="rejected" label="Not published" /><span style={{ font: "var(--caption)", color: "var(--text-3)" }}>Only you see this</span></div>
                      <p style={{ font: "var(--post)", margin: 0, color: "var(--text-3)", textDecoration: "line-through", textDecorationColor: "var(--ink-300)" }}>{senderView.text}</p>
                      <div style={{ display: "flex", gap: 8 }}><DS.Button size="sm" variant="secondary" icon="PenLine">Rewrite</DS.Button><DS.Button size="sm" variant="ghost">Dismiss</DS.Button></div>
                    </div>
                  </div>
                ) : null}
                {approved.length ? approved.map((p) => <DS.PostCard key={p.id} style={S.item} text={p.text} sender={p.sender} time={fmt(p.t)} reactions={p.reactions || {}} entering={p.entering} onReact={() => {}} />) : <Empty icon="Radio" text="Quiet in here. Approve something." />}
                <div style={{ textAlign: "center", font: "var(--caption)", color: "var(--text-3)", padding: 12, flex: "none" }}>Board opened 19:00</div>
              </>
            )}
          </div>

          {newCount && !sheet ? <div style={{ position: "absolute", top: tab === "queue" ? 372 : 312, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 4 }}><DS.Toast tone="live" icon="ArrowDown" message={`${newCount} new`} action="Show" onAction={showNew} style={{ minHeight: 40, padding: "6px 8px 6px 12px" }} /></div> : null}
          {selecting ? (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px 34px", background: "var(--surface)", borderTop: "1px solid var(--border)", display: "flex", gap: 8, zIndex: 5, animation: "post-in var(--dur-base) var(--ease-out)" }}>
              <DS.Button size="lg" variant="ghost" onClick={() => setSel(sel.size === pending.length ? new Set() : new Set(pending.map((p) => p.id)))}>{sel.size === pending.length ? "None" : "All"}</DS.Button>
              <DS.Button size="lg" full icon="Check" disabled={!sel.size} onClick={approveSel} style={{ flex: 1 }}>Approve all selected{sel.size ? ` (${sel.size})` : ""}</DS.Button>
            </div>
          ) : null}
          {toast ? <div style={{ position: "absolute", bottom: selecting ? 120 : 40, left: 16, right: 16, display: "flex", justifyContent: "center", zIndex: 6 }}><DS.Toast message={toast.message} action={toast.action} onAction={toast.onAction || (() => setToast(null))} /></div> : null}

          {sheet === "mods" ? <ModsSheet mods={mods} members={MEMBERS} onClose={() => setSheet(null)} onAdd={(m) => { setMods((ms) => [...ms, m]); say({ message: `${first(m.name)} can approve posts now` }); }} onRemove={(m) => { setMods((ms) => ms.filter((x) => x.id !== m.id)); say({ message: `${first(m.name)} removed` }); }} /> : null}
          {sheet === "controls" ? <ControlsSheet mode={mode} pendingCount={waiting} onMode={(m) => { setMode(m); say({ message: m === "approve_first" ? "Posts wait for you now" : "Posts go up as they come now" }); }} end={end} onEnd={(v) => { setEnd(v); say({ message: v === "No end" ? "No end time. Close it by hand." : `Board ends at ${v}` }); }} onCloseBoard={() => setSheet("close")} onClose={() => setSheet(null)} /> : null}
          {sheet === "close" ? <ConfirmSheet title="Close the board?" body={`No one can post after this${waiting ? `, and the ${waiting} waiting won't be published` : ""}. Everything already on the board stays readable.`} action="Close board" onClose={() => setSheet("controls")} onConfirm={closeBoard} /> : null}
        </div>

        <aside style={{ width: 240, display: "flex", flexDirection: "column", gap: 14, padding: 16, background: "#fff", borderRadius: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>
          <span style={S.lbl}>Demo controls</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Flow</span>
            <span>Queue → Approve (button or swipe right) → toast “View” → Board. Swipe left rejects; Rejected filter keeps them, never public.</span>
            <span><DS.Icon name="Users" size={13} style={{ display: "inline", verticalAlign: -2 }} /> Moderators → Add co-moderator (joined members only). <DS.Icon name="Settings2" size={13} style={{ display: "inline", verticalAlign: -2 }} /> Board mode, end time, close board.</span>
            <span>“Select” turns on multi-select with Approve all selected.</span>
          </div>
          <DS.Switch checked={live && !closed} onChange={setLive} label="Room posts keep arriving" description="One every 7 s, appended at the bottom (oldest first)" />
          <div style={{ display: "flex", gap: 8 }}>
            <DS.Button variant="secondary" size="sm" icon="Plus" disabled={closed} onClick={arrive}>Arrive now</DS.Button>
            <DS.Button variant="ghost" size="sm" icon="RotateCcw" onClick={() => { setPosts(SEED); setClosed(false); setMode("approve_first"); setEnd("02:00"); setMods([MEMBERS[6]]); setSelecting(false); setNewCount(0); }}>Reset</DS.Button>
          </div>
        </aside>
      </div>
    );
  }

  function Gate() {
    const [ready, setReady] = useState(!!(window.DS && window.DS.QueueCard));
    useEffect(() => {
      if (ready) return;
      const on = () => setReady(true);
      window.addEventListener("ds-ready", on);
      const iv = setInterval(() => { if (window.DS && window.DS.QueueCard) { setReady(true); clearInterval(iv); } }, 100);
      return () => { window.removeEventListener("ds-ready", on); clearInterval(iv); };
    }, [ready]);
    if (!ready) return <div style={{ padding: 40, font: "500 14px/1.4 Figtree, sans-serif", color: "#6b6b6b" }}>Loading components…</div>;
    return <App />;
  }
  window.ModQueueApp = Gate;
})();
