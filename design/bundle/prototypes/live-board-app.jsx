// Live Event Board prototype — uses window.DS (design-system components) and window.React.
(function () {
  const { useState, useEffect, useRef, useMemo } = React;
  const DS = new Proxy({}, { get: (_, k) => (window.DS || {})[k] });
  const T = window.__BRAND_STRINGS__ || {};

  const ME = { id: "me", name: "Şeyma Kaya", section: "ESN İzmir", country: "Türkiye" };
  const MEMBERS = [
    { id: "m1", name: "Deniz Aksoy", section: "ESN Ankara", country: "Türkiye" },
    { id: "m2", name: "Giulia Ferri", section: "ESN Bologna", country: "Italy" },
    { id: "m3", name: "Ahmet Yıldız", section: "ESN İzmir", country: "Türkiye" },
    { id: "m4", name: "Lena Novak", section: "ESN Brno", country: "Czechia" },
    { id: "m5", name: "İrem Doğan", section: "ESN Boğaziçi", country: "Türkiye" },
    { id: "m6", name: "Mateo Ruiz", section: "ESN Sevilla", country: "Spain" },
    { id: "m7", name: "Ece Kara", section: "ESN Ankara", country: "Türkiye" },
    { id: "m8", name: "Jonas Weber", section: "ESN Köln", country: "Germany" },
  ];
  const SEED = [
    { id: "p1", text: "Whoever brought the speaker to the bus: legend.", sender: { level: "hint", hints: { section: "ESN Ankara" } }, t: 2, reactions: { "🔥": 12, "😂": 4 } },
    { id: "p2", text: "Kitchen crew, dinner was unreal. Thank you 🙏", sender: { level: "anonymous" }, t: 6, reactions: { "❤️": 19 } },
    { id: "p3", text: "Who's the person in the green jacket by the DJ? Asking for a friend.", sender: { level: "named", name: "Deniz Aksoy" }, t: 11, reactions: { "👀": 44, "😳": 6 } },
    { id: "p4", text: "The Bologna table is winning the karaoke war and it's not close", sender: { level: "hint", hints: { country: "Italy", letter: "G" } }, t: 18, reactions: { "😂": 27, "🔥": 9 } },
    { id: "p5", text: "Shoutout to the volunteers running the door for six hours straight.", sender: { level: "anonymous" }, t: 24, reactions: { "❤️": 33 } },
    { id: "p6", text: "Bus back to the hotel leaves at 02:00 sharp, don't be that person", sender: { level: "named", name: "Ece Kara" }, t: 35, reactions: { "👀": 8 } },
  ];
  const INCOMING = [
    { text: "ok the DJ just played a Tarkan remix and the room lost it", sender: { level: "anonymous" }, reactions: { "🔥": 3 } },
    { text: "Sevilla brought churros. SEVILLA BROUGHT CHURROS.", sender: { level: "hint", hints: { section: "ESN Brno" } }, reactions: { "😂": 5 } },
    { text: "Whoever is running the lights tonight, respect", sender: { level: "named", name: "Jonas Weber" }, reactions: {} },
    { text: "İzmir table has a spare charger if anyone's dying", sender: { level: "hint", hints: { section: "ESN İzmir", letter: "A" } }, reactions: { "❤️": 2 } },
  ];
  const fmt = (m) => (m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`);

  const S = {
    frame: { width: 390, height: 844, borderRadius: 48, background: "var(--bg)", position: "relative", overflow: "hidden", boxShadow: "0 0 0 10px #111, 0 30px 80px rgba(0,0,0,.35)", fontFamily: "var(--font-body)", color: "var(--text)", display: "flex", flexDirection: "column" },
    status: { height: 54, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 30px 6px", font: "600 15px/1 var(--font-body)", flex: "none" },
    header: { padding: "6px 16px 0", display: "flex", flexDirection: "column", gap: 10, flex: "none", background: "var(--bg)" },
    hrow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
    title: { font: "var(--display-lg)", letterSpacing: "var(--display-tracking)", textTransform: "uppercase", margin: 0, lineHeight: 0.95 },
    feed: { flex: 1, overflowY: "auto", padding: "12px 16px 120px", display: "flex", flexDirection: "column", gap: 12, position: "relative" },
    fab: { position: "absolute", right: 16, bottom: 34, zIndex: 5 },
    lbl: { font: "var(--caption-caps)", letterSpacing: "var(--caption-caps-tracking)", textTransform: "uppercase", color: "var(--text-2)" },
  };

  function StatusBar({ dark }) {
    return (
      <div style={{ ...S.status, color: dark ? "#fafafa" : "var(--text)" }}>
        <span>21:41</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <DS.Icon name="Signal" size={15} strokeWidth={2.5} /><DS.Icon name="Wifi" size={15} strokeWidth={2.5} /><DS.Icon name="BatteryFull" size={18} strokeWidth={2} />
        </span>
      </div>
    );
  }

  function PersonPicker({ members, value, onPick }) {
    const [q, setQ] = useState("");
    const list = members.filter((m) => m.name.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DS.Input placeholder="Search joined members" value={q} onChange={setQ} />
        <div style={{ display: "flex", flexDirection: "column", maxHeight: 220, overflowY: "auto", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
          {list.map((m) => (
            <button key={m.id} type="button" onClick={() => onPick(m)} style={{ appearance: "none", border: 0, borderBottom: "1px solid var(--border)", background: value && value.id === m.id ? "var(--surface-muted)" : "var(--surface)", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", minHeight: 52, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}>
              <DS.Avatar name={m.name} size="sm" />
              <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{m.name}</span><span style={{ font: "var(--caption)", color: "var(--text-2)" }}>{m.section}</span></span>
              {value && value.id === m.id ? <DS.Icon name="Check" size={18} strokeWidth={2.5} /> : null}
            </button>
          ))}
          {!list.length ? <div style={{ padding: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>No one by that name here.</div> : null}
        </div>
      </div>
    );
  }

  function Composer({ onClose, onSend, members, mode }) {
    const [text, setText] = useState("");
    const [target, setTarget] = useState("room");
    const [person, setPerson] = useState(null);
    const [lvl, setLvl] = useState("anonymous");
    const [hf, setHf] = useState({ section: true });
    const [picking, setPicking] = useState(false);
    const hints = lvl === "hint" ? { section: hf.section ? ME.section : null, country: hf.country ? ME.country : null, letter: hf.letter ? ME.name.charAt(0) : null } : undefined;
    const sender = { level: lvl, name: lvl === "named" ? ME.name : undefined, hints };
    const canSend = text.trim().length > 0 && (target === "room" || person);
    const anonL = { anonymous: "Anonymous", anonymousSub: "No trace", hint: "Hint", hintSub: "Pick your clues", named: "Named", namedSub: "Name + photo", showThem: "Show them", section: "Section", country: "Country", letter: "First letter", preview: "They'll see" };
    return (
      <DS.Sheet title={target === "room" ? "To the room" : person ? `To ${person.name.split(" ")[0]}` : "To a person"} onClose={onClose} style={{ maxHeight: "94%" }}>
        <DS.Tabs variant="segmented" value={target} onChange={(v) => { setTarget(v); if (v === "person" && !person) setPicking(true); }} items={[{ id: "room", label: "To the room" }, { id: "person", label: "To a person" }]} />
        {target === "person" ? (
          picking || !person ? <PersonPicker members={members} value={person} onPick={(m) => { setPerson(m); setPicking(false); }} /> : (
            <button type="button" onClick={() => setPicking(true)} style={{ appearance: "none", border: "1.5px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}>
              <DS.Avatar name={person.name} size="sm" />
              <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{person.name}</span><span style={{ font: "var(--caption)", color: "var(--text-2)" }}>Goes to their inbox. They decide if it goes public.</span></span>
              <DS.Icon name="ChevronDown" size={18} />
            </button>
          )
        ) : null}
        <DS.Input multiline rows={3} autoFocus value={text} onChange={setText} maxLength={280} placeholder={target === "room" ? "Say something to the room" : person ? `Say something to ${person.name.split(" ")[0]}` : "Pick a person first"} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Post as</span>
          <DS.AnonymitySelector value={lvl} onChange={setLvl} hintFields={hf} onHintFieldsChange={setHf} me={ME} labels={anonL} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Your card</span>
          <DS.PostCard text={text.trim() || "…"} sender={sender} time="now" reactions={{}} style={{ opacity: text.trim() ? 1 : 0.6 }} />
        </div>
        {target === "room" && mode === "approve_first" ? <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--body-sm)", color: "var(--text-2)" }}><DS.Icon name="Clock" size={16} /><span>This board approves posts first. A moderator will release it.</span></div> : null}
        <DS.Button size="lg" full icon="Send" disabled={!canSend} onClick={() => onSend({ text: text.trim(), sender, target, person })}>Send</DS.Button>
      </DS.Sheet>
    );
  }

  function ReportSheet({ post, onClose, onDone }) {
    const [reason, setReason] = useState(null);
    const reasons = ["Harassment or bullying", "Hate or discrimination", "Sexual content", "Reveals someone's identity", "Spam"];
    return (
      <DS.Sheet title="Report" onClose={onClose}>
        <DS.PostCard text={post.text} sender={post.sender} time={fmt(post.t)} />
        <span style={S.lbl}>What's wrong?</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{reasons.map((r) => <DS.Chip key={r} selected={reason === r} onClick={() => setReason(r)}>{r}</DS.Chip>)}</div>
        <DS.Button size="lg" full variant="danger" disabled={!reason} icon="Flag" onClick={onDone}>Report</DS.Button>
      </DS.Sheet>
    );
  }

  function PeopleTab({ members }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", overflow: "hidden" }}>
        {[ME, ...members].map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", minHeight: 56, borderTop: i ? "1px solid var(--border)" : 0 }}>
            <DS.Avatar name={m.name} size="md" />
            <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{m.name}{m.id === "me" ? <span style={{ color: "var(--text-3)", fontWeight: 500 }}> · you</span> : null}</span><span style={{ font: "var(--caption)", color: "var(--text-2)" }}>{m.section} · {m.country}</span></span>
            {m.id !== "me" ? <DS.IconButton icon="PenLine" label={`Write to ${m.name}`} size="sm" variant="outline" /> : null}
          </div>
        ))}
      </div>
    );
  }

  function Projector({ posts, onExit }) {
    const [i, setI] = useState(0);
    useEffect(() => { const id = setInterval(() => setI((x) => x + 1), 4200); return () => clearInterval(id); }, []);
    const visible = useMemo(() => { const n = posts.length; const a = posts[i % n], b = posts[(i + 1) % n]; return [a, b]; }, [i, posts]);
    // Landscape 1920×1080 canvas rotated 90°, scaled to fit both axes of the 390×844 frame (≈ 0.36).
    const scale = Math.min(844 / 1920, 390 / 1080);
    return (
      <div data-theme="projector" onClick={onExit} style={{ position: "absolute", inset: 0, background: "var(--ink-950)", zIndex: 20, cursor: "pointer", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 14, left: 0, right: 0, textAlign: "center", font: "var(--caption)", color: "var(--ink-500)", letterSpacing: ".06em", textTransform: "uppercase", zIndex: 2 }}>Projector · 1920×1080 · tap to exit</div>
        <div style={{ position: "absolute", left: 195, top: 422, width: 1920, height: 1080, marginLeft: -960, marginTop: -540, transform: `rotate(90deg) scale(${scale})`, transformOrigin: "50% 50%", "--event": "var(--cover-magenta)", padding: "72px 96px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 56, overflow: "hidden", color: "#fafafa", background: "var(--ink-950)", boxShadow: "0 0 0 1px var(--ink-800)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ font: "var(--projector-title)", textTransform: "uppercase", letterSpacing: "var(--display-tracking)" }}>National Platform 2026</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 18, font: "var(--projector-meta)", textTransform: "uppercase", color: "var(--live)" }}><span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--live)", animation: "live-pulse var(--dur-pulse) ease-out infinite" }} />Live · {MEMBERS.length + 204}</span>
            </div>
            {visible.map((p) => <DS.ProjectorPost key={p.id + i} text={p.text} sender={p.sender} time={fmt(p.t)} reactions={p.reactions} />)}
        </div>
      </div>
    );
  }

  function App() {
    const [mode, setMode] = useState("post_immediately");
    const [tab, setTab] = useState("board");
    const [posts, setPosts] = useState(SEED);
    const [mine, setMine] = useState({});
    const [composing, setComposing] = useState(false);
    const [reporting, setReporting] = useState(null);
    const [toast, setToast] = useState(null);
    const [pending, setPending] = useState(null); // {post, phase:'waiting'|'rejected'}
    const [newCount, setNewCount] = useState(0);
    const [projector, setProjector] = useState(false);
    const [inboxSent, setInboxSent] = useState(0);
    const feedRef = useRef(null);
    const inc = useRef(0);
    const timers = useRef([]);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const say = (t) => { setToast(t); later(() => setToast(null), 2800); };

    // Live updates: someone else posts every ~9s
    useEffect(() => {
      const id = setInterval(() => {
        const src = INCOMING[inc.current % INCOMING.length]; inc.current++;
        const p = { id: "in" + Date.now(), ...src, t: 0, entering: true };
        setPosts((ps) => [p, ...ps]);
        if (feedRef.current && feedRef.current.scrollTop > 80) setNewCount((n) => n + 1);
      }, 9000);
      return () => clearInterval(id);
    }, []);

    const react = (id, e) => {
      setPosts((ps) => ps.map((p) => {
        if (p.id !== id) return p;
        const r = { ...p.reactions }; const prev = mine[id];
        if (prev) r[prev] = Math.max(0, (r[prev] || 0) - 1);
        if (prev !== e) r[e] = (r[e] || 0) + 1;
        return { ...p, reactions: r };
      }));
      setMine((m) => ({ ...m, [id]: m[id] === e ? null : e }));
    };

    const send = ({ text, sender, target, person }) => {
      setComposing(false);
      if (target === "person") {
        setInboxSent((n) => n + 1);
        say({ message: `Sent to ${person.name.split(" ")[0]}'s inbox. They decide if it goes public.` });
        return; // never on the board unless the person approves it
      }
      const post = { id: "me" + Date.now(), text, sender, t: 0, reactions: {}, entering: true, isMine: true };
      if (mode === "post_immediately") {
        setPosts((ps) => [post, ...ps]);
        if (feedRef.current) feedRef.current.scrollTop = 0;
        say({ message: "On the board" });
      } else {
        setPending({ post, phase: "waiting" });
        if (feedRef.current) feedRef.current.scrollTop = 0;
        later(() => {
          const ok = Math.random() < 0.6;
          if (ok) { setPending(null); setPosts((ps) => [{ ...post, approvedFrom: true }, ...ps]); say({ message: "A moderator released your post" }); }
          else { setPending({ post, phase: "rejected" }); }
        }, 4200);
      }
    };

    const showNew = () => { setNewCount(0); if (feedRef.current) feedRef.current.scrollTo({ top: 0, behavior: "smooth" }); };
    const onScroll = () => { if (feedRef.current && feedRef.current.scrollTop < 40 && newCount) setNewCount(0); };

    return (
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", padding: 32, minHeight: "100vh", boxSizing: "border-box", background: "#e8e8e8", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={S.frame} data-screen-label={projector ? "Projector" : "Board"}>
          <StatusBar />
          <header style={S.header}>
            <div style={S.hrow}>
              <DS.IconButton icon="ArrowLeft" label="Back" />
              <div style={{ display: "flex", gap: 6 }}>
                <DS.IconButton icon="Projector" label="Projector mode" variant="outline" onClick={() => setProjector(true)} />
                <DS.IconButton icon="Share" label="Share join code" />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
              <h1 style={S.title}>National<br />Platform 2026</h1>
              <DS.StatusPill status="live" label="Live" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, font: "var(--body-sm)", color: "var(--text-2)" }}>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><DS.Icon name="Users" size={14} strokeWidth={2.25} />{MEMBERS.length + 204}</span>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><DS.Icon name="MessageSquare" size={14} strokeWidth={2.25} />{posts.length + 334}</span>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><DS.Icon name="Clock" size={14} strokeWidth={2.25} />until 02:00</span>
            </div>
            <DS.Tabs value={tab} onChange={setTab} items={[{ id: "board", label: "Board" }, { id: "people", label: "People", count: MEMBERS.length + 205 }]} />
          </header>

          <div ref={feedRef} onScroll={onScroll} style={S.feed}>
            {tab === "people" ? <PeopleTab members={MEMBERS} /> : (
              <>
                {pending ? (
                  pending.phase === "waiting" ? (
                    <div style={{ border: "1.5px dashed var(--border-strong)", borderRadius: "var(--r-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "var(--surface-muted)", animation: "post-in var(--dur-slow) var(--ease-out)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <DS.StatusPill status="pending" label="Waiting for approval" />
                        <span style={{ font: "var(--caption)", color: "var(--text-3)" }}>Only you see this</span>
                      </div>
                      <p style={{ font: "var(--post)", margin: 0, color: "var(--text-2)" }}>{pending.post.text}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, font: "var(--body-sm)", color: "var(--text-2)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warning)", animation: "live-pulse var(--dur-pulse) ease-out infinite", "--live": "var(--warning)" }} />A moderator is looking at it</div>
                    </div>
                  ) : (
                    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <DS.StatusPill status="rejected" label="Not published" />
                        <span style={{ font: "var(--caption)", color: "var(--text-3)" }}>Only you see this</span>
                      </div>
                      <p style={{ font: "var(--post)", margin: 0, color: "var(--text-3)", textDecoration: "line-through", textDecorationColor: "var(--ink-300)" }}>{pending.post.text}</p>
                      <div style={{ display: "flex", gap: 8 }}><DS.Button size="sm" variant="secondary" icon="PenLine" onClick={() => { setPending(null); setComposing(true); }}>Rewrite</DS.Button><DS.Button size="sm" variant="ghost" onClick={() => setPending(null)}>Dismiss</DS.Button></div>
                    </div>
                  )
                ) : null}
                {posts.map((p) => (
                  <DS.PostCard key={p.id} text={p.text} sender={p.sender} time={fmt(p.t)} reactions={p.reactions} myReaction={mine[p.id]} entering={p.entering}
                    onReact={(e) => react(p.id, e)} onReply={p.isMine ? undefined : () => say({ message: "Private thread opened", action: "View" })} onMore={p.isMine ? undefined : () => setReporting(p)}
                    eventOutline={p.isMine} labels={{ reply: "Reply privately" }} />
                ))}
                <div style={{ textAlign: "center", font: "var(--caption)", color: "var(--text-3)", padding: 12 }}>Board opened 19:00</div>
              </>
            )}
          </div>

          {newCount && tab === "board" ? <div style={{ position: "absolute", top: 232, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 4 }}><DS.Toast tone="live" icon="ArrowUp" message={`${newCount} new ${newCount === 1 ? "post" : "posts"}`} action="Show" onAction={showNew} style={{ minHeight: 40, padding: "6px 8px 6px 12px" }} /></div> : null}
          {toast ? <div style={{ position: "absolute", bottom: 108, left: 16, right: 16, display: "flex", justifyContent: "center", zIndex: 6 }}><DS.Toast message={toast.message} action={toast.action} onAction={() => setToast(null)} /></div> : null}
          <div style={S.fab}><DS.IconButton icon="PenLine" label="Write" variant="filled" size="lg" onClick={() => setComposing(true)} /></div>

          {composing ? <Composer onClose={() => setComposing(false)} onSend={send} members={MEMBERS} mode={mode} /> : null}
          {reporting ? <ReportSheet post={reporting} onClose={() => setReporting(null)} onDone={() => { setReporting(null); say({ message: "Reported. Only the admin sees who sent it." }); }} /> : null}
          {projector ? <Projector posts={posts} onExit={() => setProjector(false)} /> : null}
        </div>

        <aside style={{ width: 240, display: "flex", flexDirection: "column", gap: 14, padding: 16, background: "#fff", borderRadius: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>
          <span style={S.lbl}>Demo controls</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Board mode</span>
            <DS.Tabs variant="segmented" value={mode} onChange={setMode} items={[{ id: "post_immediately", label: "Immediate" }, { id: "approve_first", label: "Approve first" }]} />
            <span>{mode === "post_immediately" ? "Your post goes straight to the top." : "Your post waits; ~60% get released, the rest come back as “Not published” (only you see it)."}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Flow</span>
            <span>Board → ✎ compose → send → result → <DS.Icon name="Projector" size={13} style={{ display: "inline", verticalAlign: -2 }} /> projector (tap to exit).</span>
            <span>New posts from others arrive every 9 s. Scroll down to see the “new posts” nudge.</span>
            <span>Posts “to a person” go to their inbox only ({inboxSent} sent this session) and never hit the board.</span>
          </div>
          <DS.Button variant="secondary" size="sm" icon="Projector" onClick={() => setProjector(true)}>Open projector</DS.Button>
        </aside>
      </div>
    );
  }

  // Wait for the design-system components (window.DS) before rendering the app.
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
  window.LiveBoardApp = Gate;
})();
