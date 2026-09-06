// Private thread prototype — uses window.DS (design-system components) and window.React.
(function () {
  const { useState, useEffect, useRef } = React;
  const DS = new Proxy({}, { get: (_, k) => (window.DS || {})[k] });

  const ME = { id: "me", name: "Deniz Aksoy", section: "ESN Ankara", country: "Türkiye" };
  const NP = "National Platform 2026";
  const now = Date.now(), ago = (m) => now - m * 60000;
  const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const rel = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`; };
  const first = (n) => n.split(" ")[0];
  const meAs = (level) => (level === "named" ? { level: "named", name: ME.name } : level === "hint" ? { level: "hint", hints: { section: ME.section } } : { level: "anonymous" });

  const BOARD = [
    { id: "p1", text: "Whoever brought the speaker to the bus: legend.", sender: { level: "hint", hints: { section: "ESN Ankara" } }, time: "2m", reactions: { "🔥": 12, "😂": 4 } },
    { id: "p2", text: "Who's the person in the green jacket by the DJ? Asking for a friend.", sender: { level: "anonymous" }, time: "11m", reactions: { "👀": 44, "😳": 6 } },
    { id: "p3", text: "The Bologna table is winning the karaoke war and it's not close", sender: { level: "hint", hints: { country: "Italy", letter: "G" } }, time: "18m", reactions: { "😂": 27, "🔥": 9 } },
    { id: "p4", text: "Bus back to the hotel leaves at 02:00 sharp, don't be that person", sender: { level: "named", name: "Ece Kara" }, time: "35m", reactions: { "👀": 8 } },
  ];
  const INBOX = [
    { id: "i1", text: "your bus talk about Ankara nightlife sold me. planning a trip in spring", sender: { level: "hint", hints: { section: "ESN Bologna", letter: "G" } }, time: "25m", source: NP },
    { id: "i2", text: "thanks for covering my door shift. I owe you a döner", sender: { level: "named", name: "Ahmet Yıldız" }, time: "1h" },
    { id: "i3", text: "green jacket by the DJ was me. still asking for a friend?", sender: { level: "anonymous" }, time: "1d", source: NP },
  ];
  // A thread: the other party at their visible level, the pinned origin post, my level in this thread, messages.
  // Messages by me snapshot `asLevel` so the other side sees pre-reveal bubbles at the old level.
  const THREADS = [
    { id: "t1", other: { level: "hint", hints: { section: "ESN Bologna", letter: "G" } }, source: NP, myLevel: "named", origin: { text: INBOX[0].text, sender: INBOX[0].sender, byMe: false },
      msgs: [{ id: "a", who: "me", asLevel: "named", text: "haha which bus talk", at: ago(20) }, { id: "b", who: "them", text: "the one after karaoke. you don't remember, do you", at: ago(14) }], lastAt: ago(14), unread: true },
    { id: "t2", other: { level: "named", name: "Ece Kara" }, source: NP, myLevel: "anonymous", origin: { text: "Kitchen crew, dinner was unreal. Thank you 🙏", sender: { level: "anonymous" }, byMe: true },
      msgs: [{ id: "a", who: "them", text: "was that you?? the kitchen crew heard and they're very happy", at: ago(48) }, { id: "b", who: "me", asLevel: "anonymous", text: "maybe 👀", at: ago(41) }], lastAt: ago(41), unread: false },
    { id: "t3", other: { level: "anonymous" }, source: NP, myLevel: "named", origin: { text: "you're the reason the karaoke didn't die at 1am 🎤", sender: { level: "anonymous" }, byMe: false },
      msgs: [{ id: "a", who: "me", asLevel: "named", text: "thank you, whoever you are", at: ago(130) }, { id: "b", who: "them", text: "no problem. keep singing", at: ago(122) }], lastAt: ago(122), unread: false },
  ];
  const REPLIES = ["ha, didn't expect anyone to answer", "ok now I'm curious who you are", "fair. see you at breakfast?"];

  const S = {
    frame: { width: 390, height: 844, borderRadius: 48, background: "var(--bg)", position: "relative", overflow: "hidden", boxShadow: "0 0 0 10px #111, 0 30px 80px rgba(0,0,0,.35)", fontFamily: "var(--font-body)", color: "var(--text)", display: "flex", flexDirection: "column", "--event": "var(--cover-magenta)", "--event-soft": "var(--cover-magenta-soft)" },
    status: { height: 54, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 30px 6px", font: "600 15px/1 var(--font-body)", flex: "none" },
    header: { padding: "6px 16px 12px", display: "flex", flexDirection: "column", gap: 10, flex: "none", background: "var(--bg)" },
    hrow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 },
    title: { font: "var(--display-lg)", letterSpacing: "var(--display-tracking)", textTransform: "uppercase", margin: 0, lineHeight: 0.95 },
    feed: { flex: 1, overflowY: "auto", padding: "4px 16px 24px", display: "flex", flexDirection: "column", gap: 12, position: "relative" },
    item: { flex: "none" },
    lbl: { font: "var(--caption-caps)", letterSpacing: "var(--caption-caps-tracking)", textTransform: "uppercase", color: "var(--text-2)" },
    sub: { font: "var(--caption)", color: "var(--text-2)" },
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

  function BottomNav({ tab, onChange, threadUnread }) {
    const items = [{ id: "board", label: "Board", icon: "Radio" }, { id: "inbox", label: "Inbox", icon: "Inbox" }, { id: "threads", label: "Threads", icon: "MessagesSquare", count: threadUnread }];
    return (
      <nav style={{ flex: "none", height: 84, borderTop: "1px solid var(--border)", background: "var(--surface)", display: "grid", gridTemplateColumns: "repeat(3,1fr)", padding: "6px 8px 22px" }}>
        {items.map((it) => { const on = tab === it.id; return (
          <button key={it.id} type="button" onClick={() => onChange(it.id)} style={{ appearance: "none", border: 0, background: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", color: on ? "var(--text)" : "var(--text-3)", font: "var(--caption)", fontWeight: on ? 600 : 500 }}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <DS.Icon name={it.icon} size={22} strokeWidth={on ? 2.5 : 2} />
              {it.count ? <span style={{ position: "absolute", top: -6, right: -10, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "var(--ink-900)", color: "#fff", font: "700 11px/18px var(--font-body)", textAlign: "center" }}>{it.count}</span> : null}
            </span>{it.label}
          </button>); })}
      </nav>
    );
  }

  // Reply privately: the original post pinned, text only, plus how I appear in this thread.
  function ReplySheet({ post, onClose, onSend }) {
    const [text, setText] = useState("");
    const [lvl, setLvl] = useState("anonymous");
    const [hf, setHf] = useState({ section: true });
    const anonL = { anonymous: "Anonymous", anonymousSub: "No trace", hint: "Hint", hintSub: "Pick your clues", named: "Named", namedSub: "Name + photo", showThem: "Show them", section: "Section", country: "Country", letter: "First letter", preview: "They'll see" };
    return (
      <DS.Sheet title="Reply privately" onClose={onClose} style={{ maxHeight: "94%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={S.lbl}>Replying to</span>
          <DS.PostCard text={post.text} sender={post.sender} time={post.time} source={post.source} />
        </div>
        <DS.Input multiline rows={3} autoFocus value={text} onChange={setText} maxLength={280} placeholder="Reply…" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Reply as</span>
          <DS.AnonymitySelector value={lvl} onChange={setLvl} hintFields={hf} onHintFieldsChange={setHf} me={ME} labels={anonL} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--body-sm)", color: "var(--text-2)" }}><DS.Icon name="Lock" size={16} /><span>Starts a private thread. Only the two of you see it. You can reveal yourself later, they can't make you.</span></div>
        <DS.Button size="lg" full icon="Send" disabled={!text.trim()} onClick={() => onSend({ text: text.trim(), level: lvl })}>Send</DS.Button>
      </DS.Sheet>
    );
  }

  function ReportSheet({ onClose, onDone }) {
    const [reason, setReason] = useState(null);
    const reasons = ["Harassment or bullying", "Hate or discrimination", "Sexual content", "Reveals someone's identity", "Spam"];
    return (
      <DS.Sheet title="Report" onClose={onClose}>
        <span style={S.lbl}>What's wrong?</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{reasons.map((r) => <DS.Chip key={r} selected={reason === r} onClick={() => setReason(r)}>{r}</DS.Chip>)}</div>
        <span style={S.sub}>The whole thread goes to the admin. Only the admin sees who reported it.</span>
        <DS.Button size="lg" full variant="danger" disabled={!reason} icon="Flag" onClick={onDone}>Report</DS.Button>
      </DS.Sheet>
    );
  }

  function ConfirmSheet({ title, body, action, danger = true, preview, onClose, onConfirm }) {
    return (
      <DS.Sheet title={title} onClose={onClose}>
        <p style={{ margin: 0, font: "var(--body)", color: "var(--text-2)", textWrap: "pretty" }}>{body}</p>
        {preview}
        <DS.Button size="lg" full variant={danger ? "danger" : "primary"} onClick={onConfirm}>{action}</DS.Button>
        <DS.Button size="lg" full variant="ghost" onClick={onClose}>Cancel</DS.Button>
      </DS.Sheet>
    );
  }

  function ThreadScreen({ th, asThem, onBack, onSend, onReveal, onBlock, onReport }) {
    const [text, setText] = useState("");
    const [menu, setMenu] = useState(null); // more | reveal | block | report
    const endRef = useRef(null);
    useEffect(() => { const el = endRef.current; if (el) el.scrollTop = el.scrollHeight; }, [th.msgs.length]);
    const me = meAs(th.myLevel);
    const header = asThem ? me : th.other;
    const canReveal = !asThem && th.myLevel !== "named";
    const send = () => { if (!text.trim()) return; onSend(text.trim()); setText(""); };
    return (
      <>
        <header style={{ ...S.header, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
          <div style={S.hrow}>
            <DS.IconButton icon="ArrowLeft" label="Back" onClick={onBack} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <DS.AnonymityBadge level={header.level} name={header.name} hints={header.hints} size="md" />
              {header.level !== "named" && th.source ? <span style={S.sub}>from {th.source}</span> : null}
            </div>
            {!asThem ? <DS.IconButton icon="Ellipsis" label="More" onClick={() => setMenu("more")} /> : null}
          </div>
        </header>
        <div ref={endRef} style={{ ...S.feed, gap: 10, padding: "12px 16px 16px" }}>
          <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 6, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
            <span style={{ ...S.lbl, display: "inline-flex", gap: 6, alignItems: "center" }}><DS.Icon name="Pin" size={12} strokeWidth={2.5} />{th.origin.byMe !== asThem ? "Your post" : "Their post"} · {th.source}</span>
            <DS.PostCard text={th.origin.text} sender={th.origin.byMe ? meAs(th.origin.sender.level === "named" ? "named" : th.origin.sender.level) : th.origin.sender} time="" eventOutline />
          </div>
          {th.msgs.map((m) => {
            if (m.who === "sys") return <DS.ThreadBubble key={m.id} system text={m.text} style={S.item} />;
            const mine = asThem ? m.who === "them" : m.who === "me";
            const sender = mine ? undefined : m.who === "me" ? meAs(m.asLevel) : th.other;
            return <DS.ThreadBubble key={m.id} text={m.text} mine={mine} sender={sender} time={clock(m.at)} style={S.item} />;
          })}
        </div>
        {asThem ? <div style={{ flex: "none", padding: "12px 16px 34px", borderTop: "1px solid var(--border)", font: "var(--body-sm)", color: "var(--text-2)", textAlign: "center" }}>Read-only preview of their side</div> : (
          <div style={{ flex: "none", display: "flex", gap: 8, alignItems: "center", padding: "8px 16px 34px", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
            <DS.Input value={text} onChange={setText} placeholder="Reply…" maxLength={500} style={{ flex: 1 }} />
            <DS.IconButton icon="ArrowUp" label="Send" variant="filled" disabled={!text.trim()} onClick={send} />
          </div>
        )}

        {menu === "more" ? (
          <DS.Sheet onClose={() => setMenu(null)}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {canReveal ? <button type="button" style={S.row} onClick={() => setMenu("reveal")}><DS.Icon name="Eye" size={20} /><span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span>Reveal myself</span><span style={S.sub}>They see your name and photo. Can't be undone here.</span></span></button> : null}
              <button type="button" style={S.row} onClick={() => setMenu("report")}><DS.Icon name="Flag" size={20} /><span>Report</span></button>
              <button type="button" style={{ ...S.row, color: "var(--danger)" }} onClick={() => setMenu("block")}><DS.Icon name="Ban" size={20} /><span>{th.other.level === "named" ? `Block ${first(th.other.name)}` : "Block"}</span></button>
            </div>
          </DS.Sheet>
        ) : null}
        {menu === "reveal" ? <ConfirmSheet title="Reveal myself?" danger={false} body="They will see your name and photo from now on. Earlier messages stay as they were. One-way, permanent in this thread." preview={<div style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={S.lbl}>They'll see</span><div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: "var(--r-card)" }}><DS.AnonymityBadge level="named" name={ME.name} size="lg" /></div></div>} action="Reveal myself" onClose={() => setMenu(null)} onConfirm={() => { setMenu(null); onReveal(); }} /> : null}
        {menu === "block" ? <ConfirmSheet title="Block?" body={`${th.other.level === "named" ? first(th.other.name) : "They"} can't write to you again and this thread is removed for you. ${th.other.level === "named" ? "" : "You won't learn who they are."}`} action="Block" onClose={() => setMenu(null)} onConfirm={() => { setMenu(null); onBlock(); }} /> : null}
        {menu === "report" ? <ReportSheet onClose={() => setMenu(null)} onDone={() => { setMenu(null); onReport(); }} /> : null}
      </>
    );
  }

  function App() {
    const [tab, setTab] = useState("board");
    const [open, setOpen] = useState(null); // thread id
    const [threads, setThreads] = useState(THREADS);
    const [reply, setReply] = useState(null); // post being replied to
    const [more, setMore] = useState(null); // inbox card overflow
    const [asThem, setAsThem] = useState(false);
    const [toast, setToast] = useState(null);
    const timers = useRef([]);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const say = (t) => { setToast(t); later(() => setToast(null), 2800); };

    const patch = (id, fn) => setThreads((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
    const push = (id, msg) => patch(id, (t) => ({ ...t, msgs: [...t.msgs, { id: "m" + Date.now() + Math.random(), at: Date.now(), ...msg }], lastAt: Date.now() }));
    const theirReply = (id, n) => later(() => push(id, { who: "them", text: REPLIES[n % REPLIES.length] }), 1800 + Math.random() * 800);

    const startThread = ({ text, level }, post) => {
      const id = "t" + Date.now();
      const th = { id, other: post.sender, source: post.source || NP, myLevel: level, origin: { text: post.text, sender: post.sender, byMe: false }, msgs: [{ id: "m0", who: "me", asLevel: level, text, at: Date.now() }], lastAt: Date.now(), unread: false, n: 0 };
      setThreads((ts) => [th, ...ts]);
      setReply(null); setMore(null); setOpen(id); setAsThem(false);
      theirReply(id, 0);
    };
    const sendIn = (id) => (text) => {
      const th = threads.find((t) => t.id === id);
      push(id, { who: "me", asLevel: th.myLevel, text });
      const n = (th.n || 0) + 1; patch(id, (t) => ({ ...t, n }));
      theirReply(id, n);
    };
    const reveal = (id) => {
      patch(id, (t) => ({ ...t, myLevel: "named", revealed: true }));
      push(id, { who: "sys", text: `${ME.name.split(" ")[0]} revealed themselves` });
      say({ message: "They see your name now" });
    };
    const block = (id) => { setThreads((ts) => ts.filter((t) => t.id !== id)); setOpen(null); setTab("threads"); say({ message: "Blocked. They can't write to you again." }); };
    const openThread = (id) => { patch(id, (t) => ({ ...t, unread: false })); setOpen(id); setAsThem(false); };

    const th = threads.find((t) => t.id === open);
    const sorted = [...threads].sort((a, b) => b.lastAt - a.lastAt);
    const unread = threads.filter((t) => t.unread).length;
    const label = th ? "Thread" : tab === "board" ? "Board" : tab === "inbox" ? "Inbox" : "Threads";

    return (
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", padding: 32, minHeight: "100vh", boxSizing: "border-box", background: "#e8e8e8", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={S.frame} data-screen-label={label}>
          <StatusBar />
          {th ? <ThreadScreen th={th} asThem={asThem} onBack={() => { setOpen(null); setTab("threads"); }} onSend={sendIn(th.id)} onReveal={() => reveal(th.id)} onBlock={() => block(th.id)} onReport={() => say({ message: "Reported. Only the admin sees who sent it." })} /> : (
            <>
              {tab === "board" ? (
                <header style={S.header}>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}><h1 style={S.title}>National<br />Platform 2026</h1><DS.StatusPill status="live" label="Live" /></div>
                </header>
              ) : tab === "inbox" ? (
                <header style={S.header}><div style={S.hrow}><h1 style={S.title}>Inbox</h1></div></header>
              ) : (
                <header style={{ ...S.header, paddingBottom: 40 /* reserved: a Requests tab lands here in a later stage */ }}><div style={S.hrow}><h1 style={S.title}>Threads</h1></div></header>
              )}
              <div style={S.feed}>
                {tab === "board" ? BOARD.map((p) => <DS.PostCard key={p.id} style={S.item} text={p.text} sender={p.sender} time={p.time} reactions={p.reactions} onReact={() => {}} onReply={() => setReply({ ...p, source: NP })} onMore={() => {}} labels={{ reply: "Reply privately" }} />) : null}
                {tab === "inbox" ? INBOX.map((p) => <DS.PostCard key={p.id} style={S.item} text={p.text} sender={p.sender} time={p.time} source={p.source} onMore={() => setMore(p)} actions={[{ label: "Approve to wall", icon: "Check", onClick: () => say({ message: "On your wall" }) }, { label: "Keep private", onClick: () => say({ message: "Kept private" }) }]} />) : null}
                {tab === "threads" ? (
                  <div style={{ ...S.item, display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", overflow: "hidden" }}>
                    {sorted.map((t, i) => {
                      const last = t.msgs[t.msgs.length - 1];
                      return (
                        <button key={t.id} type="button" onClick={() => openThread(t.id)} style={{ appearance: "none", border: 0, borderTop: i ? "1px solid var(--border)" : 0, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", minHeight: 72, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", width: "100%" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                            <DS.AnonymityBadge level={t.other.level} name={t.other.name} hints={t.other.hints} size="md" />
                            <span style={{ marginLeft: "auto", ...S.sub, color: "var(--text-3)", fontVariantNumeric: "tabular-nums", flex: "none" }}>{rel(t.lastAt)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                            <span style={{ flex: 1, font: t.unread ? "var(--body-sm-strong)" : "var(--body-sm)", color: t.unread ? "var(--text)" : "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last.who === "me" ? "You: " : ""}{last.text}</span>
                            {t.unread ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink-900)", flex: "none" }} /> : null}
                          </div>
                          {t.other.level !== "named" ? <span style={S.sub}>from {t.source}</span> : null}
                        </button>
                      );
                    })}
                    {!sorted.length ? <div style={{ padding: "48px 24px", textAlign: "center", font: "var(--body)", color: "var(--text-2)" }}>No threads yet. Reply privately to a post to start one.</div> : null}
                  </div>
                ) : null}
              </div>
              <BottomNav tab={tab} onChange={setTab} threadUnread={unread} />
            </>
          )}

          {toast ? <div style={{ position: "absolute", bottom: 100, left: 16, right: 16, display: "flex", justifyContent: "center", zIndex: 6 }}><DS.Toast message={toast.message} action={toast.action} onAction={() => setToast(null)} /></div> : null}
          {reply ? <ReplySheet post={reply} onClose={() => setReply(null)} onSend={(r) => startThread(r, reply)} /> : null}
          {more ? (
            <DS.Sheet onClose={() => setMore(null)}>
              <DS.PostCard text={more.text} sender={more.sender} time={more.time} source={more.source} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button type="button" style={S.row} onClick={() => { setReply(more); setMore(null); }}><DS.Icon name="Reply" size={20} /><span>Reply privately</span></button>
                <button type="button" style={S.row} onClick={() => { setMore(null); say({ message: "Reported. Only the admin sees who sent it." }); }}><DS.Icon name="Flag" size={20} /><span>Report</span></button>
                <button type="button" style={{ ...S.row, color: "var(--danger)" }} onClick={() => { setMore(null); say({ message: "Blocked" }); }}><DS.Icon name="Ban" size={20} /><span>Block</span></button>
              </div>
            </DS.Sheet>
          ) : null}
        </div>

        <aside style={{ width: 240, display: "flex", flexDirection: "column", gap: 14, padding: 16, background: "#fff", borderRadius: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>
          <span style={S.lbl}>Demo controls</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Flow</span>
            <span>Board → <DS.Icon name="Reply" size={13} style={{ display: "inline", verticalAlign: -2 }} /> Reply privately (pick how you appear) → thread. They answer after ~2 s. Header ⋯ → Reveal myself → confirm → system line. Back → Threads list.</span>
            <span>Inbox → ⋯ → Reply privately starts a thread too. Nothing starts a thread from a profile.</span>
            <span>In “Ece Kara” you posted anonymously, so Reveal is available there right away.</span>
          </div>
          {th ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Thread perspective</span>
              <DS.Tabs variant="segmented" value={asThem ? "them" : "me"} onChange={(v) => setAsThem(v === "them")} items={[{ id: "me", label: "Deniz (me)" }, { id: "them", label: "Their side" }]} />
              <span>Their side shows your bubbles at the level they were sent: masked before a reveal, named after.</span>
            </div>
          ) : null}
          <DS.Button variant="ghost" size="sm" icon="RotateCcw" onClick={() => { setThreads(THREADS); setOpen(null); setTab("board"); setAsThem(false); }}>Reset</DS.Button>
        </aside>
      </div>
    );
  }

  function Gate() {
    const [ready, setReady] = useState(!!(window.DS && window.DS.ThreadBubble));
    useEffect(() => {
      if (ready) return;
      const on = () => setReady(true);
      window.addEventListener("ds-ready", on);
      const iv = setInterval(() => { if (window.DS && window.DS.ThreadBubble) { setReady(true); clearInterval(iv); } }, 100);
      return () => { window.removeEventListener("ds-ready", on); clearInterval(iv); };
    }, [ready]);
    if (!ready) return <div style={{ padding: 40, font: "500 14px/1.4 Figtree, sans-serif", color: "#6b6b6b" }}>Loading components…</div>;
    return <App />;
  }
  window.ThreadApp = Gate;
})();
