// Events prototype (list, detail, join, create) — uses window.DS and window.React.
(function () {
  const { useState, useEffect, useRef } = React;
  const DS = new Proxy({}, { get: (_, k) => (window.DS || {})[k] });

  const ME = { id: "me", name: "Deniz Aksoy", section: "ESN Ankara", country: "Türkiye" };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const COVERS = ["magenta", "coral", "tangerine", "amber", "lime", "mint", "azure", "violet"];
  const cv = (c) => `var(--cover-${c})`, cvs = (c) => `var(--cover-${c}-soft)`;
  const MEMBERS = [
    { id: "m1", name: "Şeyma Kaya", section: "ESN İzmir", country: "Türkiye", bio: "Runs the door. Runs the playlist. Runs." },
    { id: "m2", name: "Giulia Ferri", section: "ESN Bologna", country: "Italy", bio: "Erasmus in Ankara, karaoke war veteran." },
    { id: "m3", name: "Ahmet Yıldız", section: "ESN İzmir", country: "Türkiye", bio: "Volunteer coordinator. Will trade shifts for döner." },
    { id: "m4", name: "Lena Novak", section: "ESN Brno", country: "Czechia", bio: "Here for the trips, staying for the people." },
    { id: "m5", name: "İrem Doğan", section: "ESN Boğaziçi", country: "Türkiye", bio: "Boğaziçi board. Coffee before talking." },
    { id: "m6", name: "Mateo Ruiz", section: "ESN Sevilla", country: "Spain", bio: "Brought the churros. You're welcome." },
    { id: "m7", name: "Ece Kara", section: "ESN Ankara", country: "Türkiye", bio: "Section president. Ask me about the bus." },
    { id: "m8", name: "Jonas Weber", section: "ESN Köln", country: "Germany", bio: "Lights, sound, occasional DJ." },
  ];
  // All events I know about. `joined` decides whether they show in my list. Dates: day/month (1–12), dayEnd/monthEnd for multi-day.
  const EVENTS = [
    { id: "np", name: "National Platform 2026", status: "live", cover: "magenta", day: "14", month: 11, dayEnd: "16", timeRange: "Fri–Sun", scope: "National", memberCount: 212, postCount: 340, code: "ESN026", mode: "approve_first", joined: true },
    { id: "cap", name: "Cappadocia Trip", status: "upcoming", cover: "mint", day: "30", month: 11, dayEnd: "2", monthEnd: 12, timeRange: "Mon–Wed", scope: "ESN Ankara", memberCount: 38, code: "H3LLON", mode: "post_immediately", joined: true },
    { id: "izm", name: "İzmir Welcome Night", status: "upcoming", cover: "azure", day: "22", month: 11, timeRange: "20:00–01:00", scope: "ESN İzmir", memberCount: 48, code: "K7Q4ZM", mode: "approve_first", joined: false },
    { id: "kar", name: "Ankara Karaoke", status: "archived", cover: "lime", day: "03", month: 10, timeRange: "21:00–01:00", scope: "ESN Ankara", postCount: 188, code: "KAR4OK", mode: "post_immediately", joined: true },
    { id: "reg", name: "Regional Platform", status: "archived", cover: "violet", day: "4", month: 4, dayEnd: "6", timeRange: "Fri–Sun", scope: "National", postCount: 512, code: "REG026", mode: "approve_first", joined: true },
  ];
  const POSTS = [
    { id: "p1", text: "Whoever brought the speaker to the bus: legend.", sender: { level: "hint", hints: { section: "ESN Ankara" } }, time: "2m", reactions: { "🔥": 12, "😂": 4 } },
    { id: "p2", text: "Kitchen crew, dinner was unreal. Thank you 🙏", sender: { level: "anonymous" }, time: "6m", reactions: { "❤️": 19 } },
    { id: "p3", text: "The Bologna table is winning the karaoke war and it's not close", sender: { level: "hint", hints: { country: "Italy", letter: "G" } }, time: "18m", reactions: { "😂": 27, "🔥": 9 } },
  ];
  const dateLabel = (e) => (e.dayEnd ? (e.monthEnd && e.monthEnd !== e.month ? `${e.day} ${MONTHS[e.month - 1]}–${e.dayEnd} ${MONTHS[e.monthEnd - 1]}` : `${e.day}–${e.dayEnd} ${MONTHS[e.month - 1]}`) : `${e.day} ${MONTHS[e.month - 1]}`);
  const genCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const wd = (d) => d.toLocaleDateString("en", { weekday: "short" });

  const S = {
    frame: { width: 390, height: 844, borderRadius: 48, background: "var(--bg)", position: "relative", overflow: "hidden", boxShadow: "0 0 0 10px #111, 0 30px 80px rgba(0,0,0,.35)", fontFamily: "var(--font-body)", color: "var(--text)", display: "flex", flexDirection: "column" },
    status: { height: 54, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 30px 6px", font: "600 15px/1 var(--font-body)", flex: "none" },
    header: { padding: "6px 16px 12px", display: "flex", flexDirection: "column", gap: 10, flex: "none", background: "var(--bg)" },
    hrow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 },
    title: { font: "var(--display-lg)", letterSpacing: "var(--display-tracking)", textTransform: "uppercase", margin: 0, lineHeight: 0.95, textWrap: "balance" },
    feed: { flex: 1, overflowY: "auto", padding: "4px 16px 120px", display: "flex", flexDirection: "column", gap: 12, position: "relative" },
    item: { flex: "none" },
    lbl: { font: "var(--caption-caps)", letterSpacing: "var(--caption-caps-tracking)", textTransform: "uppercase", color: "var(--text-2)" },
    sub: { font: "var(--caption)", color: "var(--text-2)" },
    meta: { display: "flex", alignItems: "center", gap: 12, font: "var(--body-sm)", color: "var(--text-2)", flexWrap: "wrap" },
    mi: { display: "inline-flex", gap: 5, alignItems: "center" },
    bottom: { position: "absolute", left: 16, right: 16, bottom: 34, zIndex: 5, display: "flex", gap: 8 },
    native: { appearance: "none", border: "1.5px solid var(--border-strong)", borderRadius: "var(--r-input)", background: "var(--surface)", color: "var(--text)", font: "var(--body)", fontFamily: "inherit", padding: "10px 12px", minHeight: 48, width: "100%", boxSizing: "border-box", outline: 0 },
  };

  function StatusBar() {
    return (
      <div style={S.status}>
        <span>21:41</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}><DS.Icon name="Signal" size={15} strokeWidth={2.5} /><DS.Icon name="Wifi" size={15} strokeWidth={2.5} /><DS.Icon name="BatteryFull" size={18} strokeWidth={2} /></span>
      </div>
    );
  }
  const Ev = ({ e, compact, onPress }) => <DS.EventCard style={S.item} name={e.name} status={e.status} cover={cv(e.cover)} coverSoft={cvs(e.cover)} day={e.day} month={e.month} dayEnd={e.dayEnd} monthEnd={e.monthEnd} timeRange={e.timeRange} scope={e.scope} memberCount={e.memberCount} postCount={e.postCount} compact={compact} onPress={onPress} />;

  function Group({ label, children }) {
    return <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 10 }}><span style={{ ...S.lbl, padding: "6px 2px 0" }}>{label}</span>{children}</div>;
  }

  function JoinSheet({ events, onClose, onJoined }) {
    const [code, setCode] = useState("");
    const [err, setErr] = useState(null);
    const [scan, setScan] = useState(false);
    const [done, setDone] = useState(null);
    const submit = (c) => {
      const e = events.find((x) => x.code === c);
      if (!e) { setErr("No event with that code. Check it with whoever shared it."); return; }
      if (e.joined) { setErr(`You're already in ${e.name}.`); return; }
      setDone(e); onJoined(e);
    };
    if (done) return (
      <DS.Sheet title="You're in" onClose={onClose}>
        <Ev e={{ ...done, memberCount: done.memberCount + 1 }} />
        <span style={S.sub}>{done.status === "live" ? "The board is live. Say hi." : `The board opens ${dateLabel(done)}${done.timeRange.includes(":") ? ` at ${done.timeRange.split("–")[0]}` : ""}. You'll see it in Upcoming until then.`}</span>
        <DS.Button size="lg" full icon="ArrowRight" onClick={() => onClose(done)}>Open event</DS.Button>
      </DS.Sheet>
    );
    if (scan) return (
      <DS.Sheet title="Scan QR" onClose={() => setScan(false)}>
        <div style={{ position: "relative", height: 300, borderRadius: "var(--r-card)", background: "var(--ink-950)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-500)", font: "var(--body-sm)", overflow: "hidden" }}>
          {[["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].map(([v, h]) => <span key={v + h} aria-hidden="true" style={{ position: "absolute", [v]: 56, [h]: 72, width: 28, height: 28, [`border${v[0].toUpperCase() + v.slice(1)}`]: "3px solid #fafafa", [`border${h[0].toUpperCase() + h.slice(1)}`]: "3px solid #fafafa", borderRadius: 4 }} />)}
          <span>Camera · point at the event's QR</span>
        </div>
        <DS.Button size="lg" full variant="secondary" icon="ScanLine" onClick={() => submit("K7Q4ZM")}>Simulate a scan</DS.Button>
        <DS.Button size="lg" full variant="ghost" onClick={() => setScan(false)}>Enter the code instead</DS.Button>
      </DS.Sheet>
    );
    return (
      <DS.Sheet title="Join an event" onClose={onClose}>
        <DS.Input label="Join code" value={code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code} onChange={(v) => { setErr(null); setCode(v.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6)); }} placeholder="XXX-XXX" autoFocus maxLength={7} error={err} hint="Ask the organiser, or scan the QR at the door." inputStyle={{ font: "var(--display-md)", letterSpacing: ".22em", textAlign: "center", textTransform: "uppercase", paddingLeft: ".22em" }} />
        <DS.Button size="lg" full icon="LogIn" disabled={code.length < 6} onClick={() => submit(code)}>Join</DS.Button>
        <DS.Button size="lg" full variant="secondary" icon="QrCode" onClick={() => setScan(true)}>Scan QR</DS.Button>
      </DS.Sheet>
    );
  }

  function CreateSheet({ onClose, onCreate }) {
    const [name, setName] = useState("");
    const [scope, setScope] = useState("section");
    const [start, setStart] = useState("2026-11-28T20:00");
    const [end, setEnd] = useState("2026-11-28T23:30");
    const [cover, setCover] = useState("coral");
    const [mode, setMode] = useState("approve_first");
    const s = new Date(start), e = new Date(end);
    const valid = name.trim().length > 1 && !isNaN(s) && !isNaN(e) && e > s;
    const multi = valid && (s.getDate() !== e.getDate() || s.getMonth() !== e.getMonth());
    const create = () => onCreate({
      id: "new" + Date.now(), name: name.trim(), status: "upcoming", cover, day: String(s.getDate()), month: s.getMonth() + 1,
      dayEnd: multi ? String(e.getDate()) : undefined, monthEnd: multi && e.getMonth() !== s.getMonth() ? e.getMonth() + 1 : undefined,
      timeRange: multi ? `${wd(s)}–${wd(e)}` : `${hhmm(s)}–${hhmm(e)}`, scope: scope === "national" ? "National" : ME.section, memberCount: 1, code: genCode(), mode, joined: true, mine: true,
    });
    return (
      <DS.Sheet title="Create event" onClose={onClose} style={{ maxHeight: "94%" }}>
        <DS.Input label="Event name" value={name} onChange={setName} placeholder="İzmir Welcome Night" maxLength={40} autoFocus />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Who's it for</span>
          <DS.Tabs variant="segmented" value={scope} onChange={setScope} items={[{ id: "section", label: `My section · ${ME.section.replace("ESN ", "")}` }, { id: "national", label: "National" }]} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ font: "var(--body-sm-strong)" }}>Starts</span><input type="datetime-local" value={start} onChange={(ev) => setStart(ev.target.value)} style={S.native} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ font: "var(--body-sm-strong)" }}>Ends</span><input type="datetime-local" value={end} onChange={(ev) => setEnd(ev.target.value)} style={S.native} /></label>
        </div>
        <span style={S.sub}>{!valid && name.trim().length > 1 ? "End must be after the start." : multi ? `Multi-day: ${s.getDate()}–${e.getDate()} ${MONTHS[e.getMonth()]}. The board stays open the whole time.` : "One night. Set the end on a later day for a multi-day event."}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Cover color</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {COVERS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={cover === c} onClick={() => setCover(c)} style={{ appearance: "none", border: 0, width: 36, height: 36, borderRadius: "50%", background: cv(c), cursor: "pointer", boxShadow: cover === c ? "0 0 0 2px var(--bg), 0 0 0 4px var(--ink-900)" : "none", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--on-cover)" }}>{cover === c ? <DS.Icon name="Check" size={16} strokeWidth={3} /> : null}</button>)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={S.lbl}>Board mode</span>
          <DS.Tabs variant="segmented" value={mode} onChange={setMode} items={[{ id: "approve_first", label: "Approve first" }, { id: "post_immediately", label: "Post immediately" }]} />
          <span style={S.sub}>{mode === "approve_first" ? "Posts to the room wait for you or a co-moderator before anyone sees them." : "Posts go up as they come. You can still hide them."}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={S.lbl}>Preview</span>
          <DS.EventCard name={name.trim() || "Event name"} status="upcoming" cover={cv(cover)} coverSoft={cvs(cover)} day={String(s.getDate())} month={s.getMonth() + 1} dayEnd={multi ? String(e.getDate()) : undefined} monthEnd={multi && e.getMonth() !== s.getMonth() ? e.getMonth() + 1 : undefined} timeRange={multi ? `${wd(s)}–${wd(e)}` : `${hhmm(s)}–${hhmm(e)}`} scope={scope === "national" ? "National" : ME.section} compact style={{ opacity: name.trim() ? 1 : 0.6 }} />
        </div>
        <DS.Button size="lg" full icon="Plus" disabled={!valid} onClick={create}>Create event</DS.Button>
      </DS.Sheet>
    );
  }

  function App() {
    const [events, setEvents] = useState(EVENTS);
    const [screen, setScreen] = useState({ name: "list" }); // list | detail | profile | code
    const [tab, setTab] = useState("board");
    const [q, setQ] = useState("");
    const [sheet, setSheet] = useState(null); // join | create
    const [toast, setToast] = useState(null);
    const timers = useRef([]);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const say = (t) => { setToast(t); later(() => setToast(null), 2800); };

    const mine = events.filter((e) => e.joined);
    const by = (s) => mine.filter((e) => e.status === s);
    const ev = screen.event ? events.find((e) => e.id === screen.event) : null;
    const openEvent = (e) => { setTab("board"); setScreen({ name: "detail", event: e.id }); };
    const join = (e) => setEvents((es) => es.map((x) => (x.id === e.id ? { ...x, joined: true, memberCount: x.memberCount + 1 } : x)));
    const create = (e) => { setEvents((es) => [e, ...es]); setSheet(null); setScreen({ name: "code", event: e.id }); };
    const roster = [ME, ...MEMBERS].filter((m) => m.name.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));
    const label = screen.name === "list" ? "Events" : screen.name === "code" ? "Join code" : screen.name === "profile" ? "Profile" : `Event · ${tab}`;

    return (
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", padding: 32, minHeight: "100vh", boxSizing: "border-box", background: "#e8e8e8", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ ...S.frame, ...(ev ? { "--event": cv(ev.cover), "--event-soft": cvs(ev.cover) } : null) }} data-screen-label={label}>
          <StatusBar />

          {screen.name === "list" ? (
            <>
              <header style={S.header}><div style={S.hrow}><h1 style={S.title}>Events</h1><DS.Avatar name={ME.name} size="sm" /></div></header>
              <div style={S.feed}>
                {by("live").length ? <Group label="Live">{by("live").map((e) => <Ev key={e.id} e={e} onPress={() => openEvent(e)} />)}</Group> : null}
                <Group label="Upcoming">{by("upcoming").length ? by("upcoming").map((e) => <Ev key={e.id} e={e} compact onPress={() => openEvent(e)} />) : <span style={{ ...S.sub, padding: "4px 2px" }}>Nothing planned. Join with a code or create one.</span>}</Group>
                {by("archived").length ? <Group label="Archived">{by("archived").map((e) => <Ev key={e.id} e={e} compact onPress={() => openEvent(e)} />)}</Group> : null}
              </div>
              <div style={S.bottom}>
                <DS.Button size="lg" icon="LogIn" onClick={() => setSheet("join")} style={{ flex: 1 }}>Join an event</DS.Button>
                <DS.Button size="lg" variant="secondary" icon="Plus" onClick={() => setSheet("create")}>Create</DS.Button>
              </div>
            </>
          ) : null}

          {screen.name === "detail" && ev ? (
            <>
              <header style={S.header}>
                <div style={S.hrow}>
                  <DS.IconButton icon="ArrowLeft" label="Back" onClick={() => setScreen({ name: "list" })} />
                  <div style={{ display: "flex", gap: 6 }}>
                    {ev.mine || ev.id === "np" ? <DS.IconButton icon="Settings2" label="Board controls" variant="outline" onClick={() => say({ message: "Controls live in the Moderation Queue prototype" })} /> : null}
                    <DS.IconButton icon="Share" label="Share join code" onClick={() => setScreen({ name: "code", event: ev.id, back: "detail" })} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                  <h1 style={S.title}>{ev.name}</h1>
                  <DS.StatusPill status={ev.status} label={ev.status === "live" ? "Live" : ev.status === "upcoming" ? "Upcoming" : "Archived"} />
                </div>
                <div style={S.meta}>
                  <span style={S.mi}><DS.Icon name="CalendarDays" size={14} strokeWidth={2.25} />{dateLabel(ev)}{ev.timeRange ? ` · ${ev.timeRange}` : ""}</span>
                  <span style={S.mi}><DS.Icon name="MapPin" size={14} strokeWidth={2.25} />{ev.scope}</span>
                </div>
                <DS.Tabs value={tab} onChange={setTab} items={[{ id: "board", label: "Board", count: ev.postCount }, { id: "people", label: "People", count: ev.memberCount }]} />
              </header>
              <div style={{ ...S.feed, paddingTop: 12 }}>
                {tab === "board" ? (
                  ev.status === "upcoming" ? (
                    <div style={{ ...S.item, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "56px 24px", textAlign: "center" }}>
                      <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--event-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><DS.Icon name="Radio" size={24} /></span>
                      <p style={{ margin: 0, font: "var(--body)", color: "var(--text-2)", textWrap: "balance", maxWidth: 260 }}>The board opens {dateLabel(ev)}{ev.timeRange.includes(":") ? ` at ${ev.timeRange.split("–")[0]}` : ""}. Until then, see who's coming.</p>
                      <DS.Button variant="secondary" icon="Users" onClick={() => setTab("people")}>People</DS.Button>
                    </div>
                  ) : (
                    <>
                      {ev.status === "archived" ? <div style={{ ...S.item, display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: "var(--r-card)", background: "var(--surface-muted)", font: "var(--body-sm)", color: "var(--text-2)" }}><DS.Icon name="Lock" size={16} /><span>This board is closed. You can read, not post.</span></div> : null}
                      {POSTS.map((p) => <DS.PostCard key={p.id} style={S.item} text={p.text} sender={p.sender} time={ev.status === "archived" ? dateLabel(ev) : p.time} reactions={p.reactions} onReact={ev.status === "live" ? () => {} : undefined} onReply={ev.status === "live" ? () => say({ message: "Threads live in the Private Thread prototype" }) : undefined} onMore={ev.status === "live" ? () => {} : undefined} />)}
                      {ev.status === "live" ? <a href="./Live Event Board.dc.html" style={{ ...S.item, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: "var(--r-pill)", background: "var(--ink-900)", color: "#fff", font: "var(--body-strong)", textDecoration: "none" }}><DS.Icon name="Radio" size={18} />Open the live board</a> : null}
                      <div style={{ textAlign: "center", font: "var(--caption)", color: "var(--text-3)", padding: 12, flex: "none" }}>{ev.status === "archived" ? `Board closed ${dateLabel(ev)}` : "Board opened 19:00"}</div>
                    </>
                  )
                ) : (
                  <>
                    <DS.Input placeholder="Search people" value={q} onChange={setQ} style={S.item} />
                    <div style={{ ...S.item, display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", overflow: "hidden" }}>
                      {roster.map((m, i) => (
                        <button key={m.id} type="button" onClick={() => setScreen({ name: "profile", event: ev.id, member: m.id })} style={{ appearance: "none", border: 0, borderTop: i ? "1px solid var(--border)" : 0, background: "var(--surface)", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", minHeight: 60, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", width: "100%" }}>
                          <DS.Avatar name={m.name} size="md" />
                          <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{m.name}{m.id === "me" ? <span style={{ color: "var(--text-3)", fontWeight: 500 }}> · you</span> : null}</span><span style={S.sub}>{m.section}</span></span>
                          <DS.Icon name="ChevronRight" size={18} style={{ color: "var(--text-3)" }} />
                        </button>
                      ))}
                      {!roster.length ? <div style={{ padding: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>No one by that name here.</div> : null}
                    </div>
                    <span style={{ ...S.sub, textAlign: "center", padding: 4 }}>{ev.memberCount} joined · everyone here was approved by an admin</span>
                  </>
                )}
              </div>
            </>
          ) : null}

          {screen.name === "profile" && ev ? (() => { const m = screen.member === "me" ? ME : MEMBERS.find((x) => x.id === screen.member); return (
            <>
              <header style={S.header}><div style={S.hrow}><DS.IconButton icon="ArrowLeft" label="Back" onClick={() => setScreen({ name: "detail", event: ev.id })} /><DS.IconButton icon="Share" label="Share wall" onClick={() => say({ message: "Link copied" })} /></div></header>
              <div style={{ ...S.feed, paddingTop: 8 }}>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 12, paddingBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <DS.Avatar name={m.name} size="xl" />
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}><h1 style={S.title}>{m.name}</h1><span style={{ font: "var(--body-sm)", color: "var(--text-2)" }}>{m.section} · {m.country}</span></div>
                  </div>
                  {m.bio ? <p style={{ margin: 0, font: "var(--body)" }}>{m.bio}</p> : null}
                  <span style={{ ...S.mi, font: "var(--body-sm-strong)", color: "var(--text-2)" }}><DS.Icon name="MessageSquare" size={14} strokeWidth={2.25} />2 on the wall</span>
                </div>
                <DS.PostCard style={S.item} large text="you make people feel welcome without even trying" sender={{ level: "anonymous" }} time="5d" />
                <DS.PostCard style={S.item} large text={`the ${m.section.replace("ESN ", "")} table still talks about that karaoke duet`} sender={{ level: "hint", hints: { section: "ESN İzmir" } }} time="9d" approvedFromBoard />
              </div>
              {m.id !== "me" ? <div style={S.bottom}><DS.Button size="lg" full icon="PenLine" onClick={() => say({ message: "Composer lives in the Inbox + Wall prototype" })}>Write on the wall</DS.Button></div> : null}
            </>
          ); })() : null}

          {screen.name === "code" && ev ? (
            <>
              <header style={S.header}>
                <div style={S.hrow}><DS.IconButton icon="ArrowLeft" label="Back" onClick={() => setScreen(screen.back === "detail" ? { name: "detail", event: ev.id } : { name: "list" })} /></div>
                <h1 style={S.title}>{screen.back ? "Join code" : "Event created"}</h1>
                <span style={{ font: "var(--body-sm)", color: "var(--text-2)" }}>{screen.back ? "Anyone with the code or QR can join." : "Share the code or QR. People who join land in People; the board opens at the start time."}</span>
              </header>
              <div style={{ ...S.feed, paddingTop: 8 }}>
                <Ev e={ev} compact onPress={() => openEvent(ev)} />
                <DS.JoinCodeBlock style={S.item} code={ev.code} eventColorSoft={cvs(ev.cover)} onCopy={() => say({ message: "Copied" })} onShare={() => say({ message: `Share sheet · “Join ${ev.name}: ${ev.code}”` })} />
                <span style={{ ...S.sub, textAlign: "center", padding: "0 12px" }}>Board mode: {ev.mode === "approve_first" ? "approve first" : "post immediately"}. Change it any time from the event.</span>
              </div>
              <div style={S.bottom}><DS.Button size="lg" full icon="Check" onClick={() => setScreen(screen.back === "detail" ? { name: "detail", event: ev.id } : { name: "list" })}>Done</DS.Button></div>
            </>
          ) : null}

          {toast ? <div style={{ position: "absolute", bottom: 108, left: 16, right: 16, display: "flex", justifyContent: "center", zIndex: 6 }}><DS.Toast message={toast.message} onAction={() => setToast(null)} /></div> : null}
          {sheet === "join" ? <JoinSheet events={events} onJoined={join} onClose={(e) => { setSheet(null); if (e) openEvent(e); }} /> : null}
          {sheet === "create" ? <CreateSheet onClose={() => setSheet(null)} onCreate={create} /> : null}
        </div>

        <aside style={{ width: 240, display: "flex", flexDirection: "column", gap: 14, padding: 16, background: "#fff", borderRadius: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>
          <span style={S.lbl}>Demo controls</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Flow</span>
            <span>Join an event → code <b style={{ color: "var(--text)", fontFamily: "ui-monospace, Menlo, monospace" }}>K7Q4ZM</b> (or Scan QR → simulate) → “You're in” → Open event → Board / People.</span>
            <span>Create → name, scope, dates (set End on a later day for multi-day), color, board mode → Join code screen with QR and Share.</span>
            <span>Live and upcoming events open the detail; archived ones open a read-only board. “Open the live board” links to the Live Event Board prototype.</span>
          </div>
          <DS.Button variant="ghost" size="sm" icon="RotateCcw" onClick={() => { setEvents(EVENTS); setScreen({ name: "list" }); setSheet(null); }}>Reset</DS.Button>
        </aside>
      </div>
    );
  }

  function Gate() {
    const [ready, setReady] = useState(!!(window.DS && window.DS.EventCard));
    useEffect(() => {
      if (ready) return;
      const on = () => setReady(true);
      window.addEventListener("ds-ready", on);
      const iv = setInterval(() => { if (window.DS && window.DS.EventCard) { setReady(true); clearInterval(iv); } }, 100);
      return () => { window.removeEventListener("ds-ready", on); clearInterval(iv); };
    }, [ready]);
    if (!ready) return <div style={{ padding: 40, font: "500 14px/1.4 Figtree, sans-serif", color: "#6b6b6b" }}>Loading components…</div>;
    return <App />;
  }
  window.EventsApp = Gate;
})();
