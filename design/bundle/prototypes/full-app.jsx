// Stitched prototype: onboarding → tabbed app (Events · Inbox · Threads · Profile). Uses window.DS and window.React.
// One store (App) feeds every screen so flows connect: a post to a person lands in that person's inbox, a queue decision lands on the board, etc.
(function () {
  const { useState, useEffect, useRef } = React;
  const DS = new Proxy({}, { get: (_, k) => (window.DS || {})[k] });
  const now0 = Date.now(), ago = (m) => now0 - m * 60000;
  const rel = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`; };
  const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const first = (n) => n.split(" ")[0];
  const norm = (s) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const has = (s, q) => norm(s).includes(norm(q));
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const COVERS = ["magenta", "coral", "tangerine", "amber", "lime", "mint", "azure", "violet"];
  const cv = (c) => `var(--cover-${c})`, cvs = (c) => `var(--cover-${c}-soft)`;
  const ANON_L = { anonymous: "Anonymous", anonymousSub: "No trace", hint: "Hint", hintSub: "Pick your clues", named: "Named", namedSub: "Name + photo", showThem: "Show them", section: "Section", country: "Country", letter: "First letter", preview: "They'll see" };
  const REASONS = ["Harassment or bullying", "Hate or discrimination", "Sexual content", "Reveals someone's identity", "Spam"];

  // ---- data -------------------------------------------------------------------------------------
  const PEOPLE = {
    deniz: { id: "deniz", name: "Deniz Aksoy", section: "ESN Ankara", country: "Türkiye", bio: "Board member at ESN Ankara. Will fight you over the aux cable.", role: "member" },
    kaan: { id: "kaan", name: "Kaan Yılmaz", section: "ESN İzmir", country: "Türkiye", bio: "Created National Platform 2026. Approves posts between songs.", role: "creator" },
    m1: { id: "m1", name: "Şeyma Kaya", section: "ESN İzmir", country: "Türkiye", bio: "Runs the door. Runs the playlist. Runs." },
    m2: { id: "m2", name: "Giulia Ferri", section: "ESN Bologna", country: "Italy", bio: "Erasmus in Ankara, karaoke war veteran." },
    m3: { id: "m3", name: "Ahmet Yıldız", section: "ESN İzmir", country: "Türkiye", bio: "Volunteer coordinator. Will trade shifts for döner." },
    m4: { id: "m4", name: "Lena Novak", section: "ESN Brno", country: "Czechia", bio: "Here for the trips, staying for the people." },
    m5: { id: "m5", name: "İrem Doğan", section: "ESN Boğaziçi", country: "Türkiye", bio: "Boğaziçi board. Coffee before talking." },
    m6: { id: "m6", name: "Mateo Ruiz", section: "ESN Sevilla", country: "Spain", bio: "Brought the churros. You're welcome." },
    m7: { id: "m7", name: "Ece Kara", section: "ESN Ankara", country: "Türkiye", bio: "Section president. Ask me about the bus." },
    m8: { id: "m8", name: "Jonas Weber", section: "ESN Köln", country: "Germany", bio: "Lights, sound, occasional DJ." },
  };
  const OTHERS = Object.values(PEOPLE).filter((p) => !p.role);
  const SECTIONS = [
    { id: "ank", name: "ESN Ankara", country: "Türkiye", members: 212 }, { id: "izm", name: "ESN İzmir", country: "Türkiye", members: 148 }, { id: "bog", name: "ESN Boğaziçi", country: "Türkiye", members: 176 }, { id: "metu", name: "ESN METU", country: "Türkiye", members: 131 },
    { id: "bol", name: "ESN Bologna", country: "Italy", members: 264 }, { id: "mil", name: "ESN Milano", country: "Italy", members: 310 }, { id: "sev", name: "ESN Sevilla", country: "Spain", members: 198 }, { id: "brn", name: "ESN Brno", country: "Czechia", members: 122 }, { id: "kol", name: "ESN Köln", country: "Germany", members: 241 },
  ];
  const sectionOf = (name) => SECTIONS.find((s) => s.name === name) || SECTIONS[0];
  const NP = "National Platform 2026";
  const EVENTS0 = [
    { id: "np", name: NP, status: "live", cover: "magenta", day: "14", month: 11, dayEnd: "16", timeRange: "Fri–Sun", scope: "National", memberCount: 212, code: "NPL026", mode: "approve_first", end: "02:00", creator: "kaan", mods: ["m7"], joined: ["kaan", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"] },
    { id: "cap", name: "Cappadocia Trip", status: "upcoming", cover: "mint", day: "30", month: 11, dayEnd: "2", monthEnd: 12, timeRange: "Mon–Wed", scope: "ESN Ankara", memberCount: 38, code: "H3LLON", mode: "post_immediately", creator: "m7", mods: [], joined: ["deniz", "m7"] },
    { id: "izm", name: "İzmir Welcome Night", status: "upcoming", cover: "azure", day: "22", month: 11, timeRange: "20:00–01:00", scope: "ESN İzmir", memberCount: 48, code: "K7Q4ZM", mode: "approve_first", creator: "m1", mods: [], joined: ["kaan", "m1", "m3"] },
    { id: "kar", name: "Ankara Karaoke", status: "archived", cover: "lime", day: "03", month: 10, timeRange: "21:00–01:00", scope: "ESN Ankara", memberCount: 64, code: "KAR4OK", mode: "post_immediately", creator: "m7", mods: [], joined: ["deniz", "m7"] },
    { id: "reg", name: "Regional Platform", status: "archived", cover: "violet", day: "4", month: 4, dayEnd: "6", timeRange: "Fri–Sun", scope: "National", memberCount: 180, code: "REG026", mode: "approve_first", creator: "kaan", mods: [], joined: ["kaan", "deniz"] },
  ];
  const H = (hints) => ({ level: "hint", hints }), AN = { level: "anonymous" }, NM = (id) => ({ level: "named", name: PEOPLE[id].name });
  const POSTS0 = [
    { id: "p1", ev: "np", text: "Whoever brought the speaker to the bus: legend.", sender: H({ section: "ESN Ankara" }), by: "m7", at: ago(2), status: "approved", reactions: { "🔥": 12, "😂": 4 } },
    { id: "p2", ev: "np", text: "Kitchen crew, dinner was unreal. Thank you 🙏", sender: AN, by: "m4", at: ago(6), status: "approved", reactions: { "❤️": 19 } },
    { id: "p3", ev: "np", text: "Who's the person in the green jacket by the DJ? Asking for a friend.", sender: AN, by: "m2", at: ago(11), status: "approved", reactions: { "👀": 44, "😳": 6 } },
    { id: "p4", ev: "np", text: "The Bologna table is winning the karaoke war and it's not close", sender: H({ country: "Italy", letter: "G" }), by: "m2", at: ago(18), status: "approved", reactions: { "😂": 27, "🔥": 9 } },
    { id: "p5", ev: "np", text: "Shoutout to the volunteers running the door for six hours straight.", sender: AN, by: "m5", at: ago(24), status: "approved", reactions: { "❤️": 33 } },
    { id: "p6", ev: "np", text: "Bus back to the hotel leaves at 02:00 sharp, don't be that person", sender: NM("m7"), by: "m7", at: ago(35), status: "approved", reactions: { "👀": 8 } },
    { id: "q1", ev: "np", text: "ok the DJ just played a Tarkan remix and the room lost it", sender: AN, by: "m6", at: ago(9), status: "pending", reactions: {} },
    { id: "q2", ev: "np", text: "Sevilla brought churros. SEVILLA BROUGHT CHURROS.", sender: H({ section: "ESN Brno" }), by: "m4", at: ago(5), status: "pending", reactions: {} },
    { id: "q3", ev: "np", text: "Whoever is running the lights tonight, respect", sender: NM("m8"), by: "m8", at: ago(1), status: "pending", reactions: {} },
    { id: "r1", ev: "np", text: "room 214 is where the real afterparty is, bring your own cups", sender: AN, by: "deniz", at: ago(12), status: "rejected", reactions: {} },
    { id: "k1", ev: "kar", text: "Otobüse hoparlörü getiren: efsane.", sender: NM("deniz"), by: "deniz", at: ago(60 * 24 * 30), status: "approved", reactions: { "🔥": 21 } },
    { id: "k2", ev: "kar", text: "the İzmir table still talks about your karaoke duet", sender: H({ section: "ESN İzmir" }), by: "m3", at: ago(60 * 24 * 30 + 40), status: "approved", reactions: { "😂": 14 } },
  ];
  const INBOX0 = [
    { id: "i1", to: "deniz", from: "m4", text: "you're the reason the karaoke didn't die at 1am 🎤", sender: AN, source: NP, state: "new", at: ago(3) },
    { id: "i2", to: "deniz", from: "m2", text: "your bus talk about Ankara nightlife sold me. planning a trip in spring", sender: H({ section: "ESN Bologna", letter: "G" }), source: NP, state: "new", at: ago(25) },
    { id: "i3", to: "deniz", from: "m3", text: "thanks for covering my door shift. I owe you a döner", sender: NM("m3"), state: "new", at: ago(70) },
    { id: "l1", to: "deniz", from: "m2", locked: true, text: "I don't know how to say this without it being weird but the way you ran the opening session made a lot of first-timers feel like they belonged. Mine included.", sender: H({ country: "Italy" }), source: NP, state: "new", at: ago(190) },
    { id: "i4", to: "deniz", from: "m6", text: "green jacket by the DJ was me. still asking for a friend?", sender: AN, source: NP, state: "new", at: ago(1500) },
    { id: "l2", to: "deniz", from: "m8", locked: true, text: "okay your playlist carried the whole bus home", sender: AN, source: NP, state: "new", at: ago(1560) },
    { id: "i5", to: "deniz", from: "m7", text: "you looked tired at the desk today. drink water, section leader", sender: H({ section: "ESN Ankara" }), state: "private", at: ago(4400) },
    { id: "w1", to: "deniz", from: "m7", text: "Best section leader ESN Ankara has had. Don't tell the others.", sender: NM("m7"), source: NP, fromBoard: true, state: "approved", at: ago(2900) },
    { id: "w2", to: "deniz", from: "m4", text: "you make people feel welcome without even trying", sender: AN, state: "approved", at: ago(7300) },
    { id: "k1", to: "kaan", from: "m1", text: "the queue is moving fast tonight, respect", sender: H({ section: "ESN İzmir" }), source: NP, state: "new", at: ago(8) },
    { id: "k2", to: "kaan", from: "m5", text: "thank you for actually reading the posts before approving them", sender: AN, source: NP, state: "new", at: ago(52) },
    { id: "k3", to: "kaan", from: "m7", text: "co-moderating with you is easy. same time next year?", sender: NM("m7"), state: "approved", at: ago(3000) },
  ];
  const THREADS0 = [
    { id: "t1", parts: { deniz: { level: "named" }, m2: { level: "hint", hints: { section: "ESN Bologna", letter: "G" } } }, source: NP, origin: { text: INBOX0[1].text, sender: INBOX0[1].sender, by: "m2" },
      msgs: [{ id: "a", who: "deniz", asLevel: "named", text: "haha which bus talk", at: ago(20) }, { id: "b", who: "m2", asLevel: "hint", text: "the one after karaoke. you don't remember, do you", at: ago(14) }], lastAt: ago(14), unread: { deniz: true } },
    { id: "t2", parts: { deniz: { level: "anonymous" }, m7: { level: "named" } }, source: NP, origin: { text: "Kitchen crew, dinner was unreal. Thank you 🙏", sender: AN, by: "deniz" },
      msgs: [{ id: "a", who: "m7", asLevel: "named", text: "was that you?? the kitchen crew heard and they're very happy", at: ago(48) }, { id: "b", who: "deniz", asLevel: "anonymous", text: "maybe 👀", at: ago(41) }], lastAt: ago(41), unread: {} },
    { id: "t3", parts: { deniz: { level: "named" }, m3: { level: "anonymous" } }, source: NP, origin: { text: "you're the reason the karaoke didn't die at 1am 🎤", sender: AN, by: "m3" },
      msgs: [{ id: "a", who: "deniz", asLevel: "named", text: "thank you, whoever you are", at: ago(130) }, { id: "b", who: "m3", asLevel: "anonymous", text: "no problem. keep singing", at: ago(122) }], lastAt: ago(122), unread: {} },
    { id: "t4", parts: { kaan: { level: "named" }, m6: { level: "anonymous" } }, source: NP, origin: { text: "ok the DJ just played a Tarkan remix and the room lost it", sender: AN, by: "m6" },
      msgs: [{ id: "a", who: "kaan", asLevel: "named", text: "it's in the queue, give me a second", at: ago(7) }, { id: "b", who: "m6", asLevel: "anonymous", text: "no rush, enjoying the remix", at: ago(6) }], lastAt: ago(6), unread: { kaan: true } },
  ];
  const REPLIES = ["ha, didn't expect anyone to answer", "ok now I'm curious who you are", "fair. see you at breakfast?"];
  const INCOMING = [
    { text: "Whoever fixed the mic between sets: hero", sender: AN, by: "m5" },
    { text: "the Köln table needs one more for the quiz, come find us", sender: H({ section: "ESN Köln", letter: "J" }), by: "m8" },
    { text: "Can the person by the door stop letting the cold in, we're dying here", sender: NM("m6"), by: "m6" },
  ];
  const vis = (id, p) => (p.level === "named" ? NM(id) : p.level === "hint" ? { level: "hint", hints: p.hints || { section: PEOPLE[id].section } } : AN);
  const dateLabel = (e) => (e.dayEnd ? (e.monthEnd && e.monthEnd !== e.month ? `${e.day} ${MONTHS[e.month - 1]}–${e.dayEnd} ${MONTHS[e.monthEnd - 1]}` : `${e.day}–${e.dayEnd} ${MONTHS[e.month - 1]}`) : `${e.day} ${MONTHS[e.month - 1]}`);
  const genCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };

  // ---- styles -----------------------------------------------------------------------------------
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
    p: { margin: 0, font: "var(--body)", color: "var(--text-2)", textWrap: "pretty" },
    meta: { display: "flex", alignItems: "center", gap: 12, font: "var(--body-sm)", color: "var(--text-2)", flexWrap: "wrap" },
    mi: { display: "inline-flex", gap: 5, alignItems: "center" },
    group: { display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", overflow: "hidden" },
    row: { appearance: "none", border: 0, background: "var(--surface)", display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "6px 14px", cursor: "pointer", font: "var(--body)", color: "var(--text)", textAlign: "left", width: "100%" },
    mrow: { appearance: "none", border: 0, background: "none", display: "flex", alignItems: "center", gap: 14, minHeight: 52, padding: "0 4px", cursor: "pointer", font: "var(--body)", color: "var(--text)", textAlign: "left", width: "100%", borderRadius: "var(--r-md)" },
    note: { display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: "var(--r-md)", background: "var(--surface-muted)", font: "var(--body-sm)", color: "var(--text-2)" },
    bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "20px 16px 34px", zIndex: 5, display: "flex", gap: 8, background: "linear-gradient(to bottom, rgba(250,250,250,0), var(--bg) 20px)" },
    native: { appearance: "none", border: "1.5px solid var(--border-strong)", borderRadius: "var(--r-input)", background: "var(--surface)", color: "var(--text)", font: "var(--body)", fontFamily: "inherit", padding: "10px 12px", minHeight: 48, width: "100%", boxSizing: "border-box", outline: 0 },
  };

  // ---- shared bits ------------------------------------------------------------------------------
  const StatusBar = ({ onClock }) => (
    <div style={S.status}>
      <button type="button" onClick={onClock} aria-label="Demo controls" style={{ appearance: "none", border: 0, background: "none", font: "inherit", color: "inherit", padding: 0, cursor: "default" }}>21:41</button>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}><DS.Icon name="Signal" size={15} strokeWidth={2.5} /><DS.Icon name="Wifi" size={15} strokeWidth={2.5} /><DS.Icon name="BatteryFull" size={18} strokeWidth={2} /></span>
    </div>
  );
  const Empty = ({ icon, text, tint }) => (
    <div style={{ ...S.item, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "64px 24px", textAlign: "center" }}>
      <span style={{ width: 56, height: 56, borderRadius: "50%", background: tint || "var(--surface-muted)", color: "var(--text-3)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><DS.Icon name={icon} size={24} /></span>
      <p style={{ ...S.p, textWrap: "balance", maxWidth: 250 }}>{text}</p>
    </div>
  );
  const Note = ({ icon = "Info", children }) => <div style={{ ...S.note, ...S.item }}><DS.Icon name={icon} size={16} style={{ flex: "none", marginTop: 2 }} /><span>{children}</span></div>;
  const Row = ({ icon, label, value, onClick, danger, first, external }) => (
    <button type="button" onClick={onClick} style={{ ...S.row, borderTop: first ? 0 : "1px solid var(--border)", color: danger ? "var(--danger)" : "var(--text)" }}>
      {icon ? <DS.Icon name={icon} size={20} style={{ color: danger ? "var(--danger)" : "var(--text-2)", flex: "none" }} /> : null}
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {value ? <span style={{ ...S.sub, whiteSpace: "nowrap" }}>{value}</span> : null}
      <DS.Icon name={external ? "ExternalLink" : "ChevronRight"} size={18} style={{ color: "var(--text-3)", flex: "none" }} />
    </button>
  );
  const Back = ({ onBack, right, title }) => (
    <header style={S.header}>
      <div style={S.hrow}><DS.IconButton icon="ArrowLeft" label="Back" onClick={onBack} />{right || null}</div>
      {title ? <h1 style={S.title}>{title}</h1> : null}
    </header>
  );
  const PersonRow = ({ p, onClick, right, first, me }) => (
    <button type="button" onClick={onClick} style={{ ...S.row, borderTop: first ? 0 : "1px solid var(--border)", minHeight: 60, cursor: onClick ? "pointer" : "default" }}>
      <DS.Avatar name={p.name} size="md" />
      <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{p.name}{me ? <span style={{ color: "var(--text-3)", fontWeight: 500 }}> · you</span> : null}</span><span style={S.sub}>{p.section}</span></span>
      {right || (onClick ? <DS.Icon name="ChevronRight" size={18} style={{ color: "var(--text-3)" }} /> : null)}
    </button>
  );
  const ConfirmSheet = ({ title, body, action, danger = true, preview, onClose, onConfirm }) => (
    <DS.Sheet title={title} onClose={onClose}>
      <p style={S.p}>{body}</p>{preview || null}
      <DS.Button size="lg" full variant={danger ? "danger" : "primary"} onClick={onConfirm}>{action}</DS.Button>
      <DS.Button size="lg" full variant="ghost" onClick={onClose}>Cancel</DS.Button>
    </DS.Sheet>
  );
  function ReportSheet({ post, onClose, onDone }) {
    const [reason, setReason] = useState(null);
    return (
      <DS.Sheet title="Report" onClose={onClose}>
        {post ? <DS.PostCard text={post.text} sender={post.sender} time={rel(post.at)} /> : null}
        <span style={S.lbl}>What's wrong?</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{REASONS.map((r) => <DS.Chip key={r} selected={reason === r} onClick={() => setReason(r)}>{r}</DS.Chip>)}</div>
        <DS.Button size="lg" full variant="danger" disabled={!reason} icon="Flag" onClick={onDone}>Report</DS.Button>
      </DS.Sheet>
    );
  }
  function AnonPick({ me, lvl, setLvl, hf, setHf, label = "Post as" }) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>{label}</span><DS.AnonymitySelector value={lvl} onChange={setLvl} hintFields={hf} onHintFieldsChange={setHf} me={me} labels={ANON_L} /></div>;
  }
  const senderFor = (me, lvl, hf) => ({ level: lvl, name: lvl === "named" ? me.name : undefined, hints: lvl === "hint" ? { section: hf.section ? me.section : null, country: hf.country ? me.country : null, letter: hf.letter ? me.name.charAt(0) : null } : undefined });

  function PersonPicker({ members, value, onPick }) {
    const [q, setQ] = useState("");
    const list = members.filter((m) => has(m.name, q));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DS.Input placeholder="Search joined members" value={q} onChange={setQ} />
        <div style={{ ...S.group, maxHeight: 220, overflowY: "auto", borderRadius: "var(--r-md)" }}>
          {list.map((m, i) => <PersonRow key={m.id} p={m} first={!i} onClick={() => onPick(m)} right={value && value.id === m.id ? <DS.Icon name="Check" size={18} strokeWidth={2.5} /> : <span />} />)}
          {!list.length ? <div style={{ padding: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>No one by that name here.</div> : null}
        </div>
      </div>
    );
  }

  // Board composer: to the room or to a person. Wall composer: same, fixed target.
  function Composer({ me, ev, members, wallOwner, onClose, onSend }) {
    const [text, setText] = useState("");
    const [target, setTarget] = useState(wallOwner ? "person" : "room");
    const [person, setPerson] = useState(wallOwner || null);
    const [lvl, setLvl] = useState("anonymous");
    const [hf, setHf] = useState({ section: true });
    const [picking, setPicking] = useState(false);
    const sender = senderFor(me, lvl, hf);
    const canSend = text.trim().length > 0 && (target === "room" || person);
    const title = wallOwner ? `To ${first(wallOwner.name)}'s wall` : target === "room" ? "To the room" : person ? `To ${first(person.name)}` : "To a person";
    return (
      <DS.Sheet title={title} onClose={onClose} style={{ maxHeight: "94%" }}>
        {!wallOwner ? <DS.Tabs variant="segmented" value={target} onChange={(v) => { setTarget(v); if (v === "person" && !person) setPicking(true); }} items={[{ id: "room", label: "To the room" }, { id: "person", label: "To a person" }]} /> : null}
        {!wallOwner && target === "person" ? (picking || !person ? <PersonPicker members={members} value={person} onPick={(m) => { setPerson(m); setPicking(false); }} /> : (
          <button type="button" onClick={() => setPicking(true)} style={{ ...S.mrow, border: "1.5px solid var(--border-strong)", padding: "10px 12px" }}>
            <DS.Avatar name={person.name} size="sm" /><span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{person.name}</span><span style={S.sub}>Goes to their inbox. They decide if it goes public.</span></span><DS.Icon name="ChevronDown" size={18} />
          </button>
        )) : null}
        <DS.Input multiline rows={3} autoFocus value={text} onChange={setText} maxLength={280} placeholder={target === "room" ? "Say something to the room" : person ? `Say something to ${first(person.name)}` : "Pick a person first"} />
        <AnonPick me={me} lvl={lvl} setLvl={setLvl} hf={hf} setHf={setHf} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>Your card</span><DS.PostCard text={text.trim() || "…"} sender={sender} time="now" style={{ opacity: text.trim() ? 1 : 0.6 }} /></div>
        {target === "room" && ev && ev.mode === "approve_first" && ev.creator !== me.id ? <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--body-sm)", color: "var(--text-2)" }}><DS.Icon name="Clock" size={16} /><span>This board approves posts first. A moderator will release it.</span></div> : null}
        {target === "person" && person ? <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--body-sm)", color: "var(--text-2)" }}><DS.Icon name="Inbox" size={16} /><span>Goes to {first(person.name)}'s inbox first. They decide if it goes on their wall.</span></div> : null}
        <DS.Button size="lg" full icon="Send" disabled={!canSend} onClick={() => onSend({ text: text.trim(), sender, target, person })}>Send</DS.Button>
      </DS.Sheet>
    );
  }
  function ReplySheet({ me, post, onClose, onSend }) {
    const [text, setText] = useState("");
    const [lvl, setLvl] = useState("anonymous");
    const [hf, setHf] = useState({ section: true });
    return (
      <DS.Sheet title="Reply privately" onClose={onClose} style={{ maxHeight: "94%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={S.lbl}>Replying to</span><DS.PostCard text={post.text} sender={post.sender} time={rel(post.at)} source={post.source} /></div>
        <DS.Input multiline rows={3} autoFocus value={text} onChange={setText} maxLength={280} placeholder="Reply…" />
        <AnonPick me={me} lvl={lvl} setLvl={setLvl} hf={hf} setHf={setHf} label="Reply as" />
        <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--body-sm)", color: "var(--text-2)" }}><DS.Icon name="Lock" size={16} /><span>Starts a private thread. Only the two of you see it. You can reveal yourself later, they can't make you.</span></div>
        <DS.Button size="lg" full icon="Send" disabled={!text.trim()} onClick={() => onSend({ text: text.trim(), level: lvl, hints: senderFor(me, lvl, hf).hints })}>Send</DS.Button>
      </DS.Sheet>
    );
  }
  function Swipe({ onApprove, onReject, disabled, children }) {
    const [dx, setDx] = useState(0); const [snap, setSnap] = useState(true);
    const start = useRef(null), moved = useRef(false);
    const down = (e) => { if (disabled) return; start.current = { x: e.clientX, y: e.clientY }; moved.current = false; setSnap(false); };
    const move = (e) => { if (!start.current) return; const d = e.clientX - start.current.x, dy = e.clientY - start.current.y; if (!moved.current && Math.abs(d) < 8) return; if (!moved.current && Math.abs(dy) > Math.abs(d)) { start.current = null; return; } moved.current = true; e.currentTarget.setPointerCapture(e.pointerId); setDx(Math.max(-150, Math.min(150, d))); };
    const up = () => { if (!start.current) return; if (dx > 90) onApprove(); else if (dx < -90) onReject(); start.current = null; setSnap(true); setDx(0); };
    const click = (e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } };
    const pct = Math.min(1, Math.abs(dx) / 90);
    return (
      <div style={{ position: "relative", flex: "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={click}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "var(--r-card)", background: dx > 0 ? "var(--live)" : "var(--danger-soft)", color: dx > 0 ? "var(--ink-950)" : "var(--danger)", display: "flex", alignItems: "center", justifyContent: dx > 0 ? "flex-start" : "flex-end", padding: "0 22px", opacity: dx ? 0.35 + pct * 0.65 : 0 }}><DS.Icon name={dx > 0 ? "Check" : "X"} size={24} strokeWidth={2.75} /></div>
        <div style={{ transform: `translateX(${dx}px)`, transition: snap ? "transform var(--dur-base) var(--ease-out)" : "none", touchAction: "pan-y" }}>{children}</div>
      </div>
    );
  }
  const WallHeader = ({ user, count, onSection, compact }) => (
    <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 12, padding: compact ? "12px 0" : "4px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <DS.Avatar name={user.name} size={compact ? "lg" : "xl"} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}><h1 style={{ ...S.title, ...(compact ? { font: "var(--display-md)", overflowWrap: "anywhere" } : null) }}>{user.name}</h1><DS.Chip size="sm" icon="MapPin" tone="outline" onClick={onSection}>{user.section} · {user.country}</DS.Chip></div>
      </div>
      {user.bio ? <p style={{ margin: 0, font: "var(--body)", textWrap: "pretty" }}>{user.bio}</p> : null}
      <span style={{ ...S.mi, font: "var(--body-sm-strong)", color: "var(--text-2)" }}><DS.Icon name="MessageSquare" size={14} strokeWidth={2.25} />{count} on the wall</span>
    </div>
  );
  const TabBar = ({ tab, onChange, badges }) => (
    <nav style={{ flex: "none", height: 84, borderTop: "1px solid var(--border)", background: "var(--surface)", display: "grid", gridTemplateColumns: "repeat(4,1fr)", padding: "6px 8px 22px" }}>
      {[{ id: "events", label: "Events", icon: "CalendarDays" }, { id: "inbox", label: "Inbox", icon: "Inbox" }, { id: "threads", label: "Threads", icon: "MessagesSquare" }, { id: "profile", label: "Profile", icon: "StickyNote" }].map((it) => { const on = tab === it.id; const n = badges[it.id]; return (
        <button key={it.id} type="button" onClick={() => onChange(it.id)} style={{ appearance: "none", border: 0, background: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", color: on ? "var(--text)" : "var(--text-3)", font: "var(--caption)", fontWeight: on ? 600 : 500 }}>
          <span style={{ position: "relative", display: "inline-flex" }}><DS.Icon name={it.icon} size={22} strokeWidth={on ? 2.5 : 2} />{n ? <span style={{ position: "absolute", top: -6, right: -10, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "var(--ink-900)", color: "#fff", font: "700 11px/18px var(--font-body)", textAlign: "center" }}>{n}</span> : null}</span>{it.label}
        </button>); })}
    </nav>
  );

  // ---- onboarding -------------------------------------------------------------------------------
  const AppleLogo = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.7-1-2.7-4.2zM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" /></svg>;
  const GoogleLogo = () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5H1.2v3.1C3.2 21.4 7.3 24 12 24z" /><path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.2C.4 8.2 0 10 0 12s.4 3.8 1.2 5.4l4-3.1z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.2 2.6 1.2 6.6l4 3.1c1-2.9 3.7-4.9 6.8-4.9z" /></svg>;
  const Strip = ({ w = 22, h = 6 }) => <div style={{ display: "flex", gap: 5 }}>{COVERS.map((c) => <span key={c} style={{ width: w, height: h, borderRadius: 3, background: cv(c) }} />)}</div>;

  function Onboarding({ me, onDone, onLogin, say }) {
    const [step, setStep] = useState("splash");
    const [acct, setAcct] = useState({ email: "", pw: "", phone: "" });
    const [prof, setProf] = useState({ name: "", section: null, bio: "", hasPhoto: false });
    const [picking, setPicking] = useState(false);
    const [notif, setNotif] = useState(false);
    const [q, setQ] = useState("");
    useEffect(() => { if (step === "pending") { const id = setTimeout(() => setNotif(true), 4000); return () => clearTimeout(id); } }, [step]);
    const emailOk = /.+@.+\..+/.test(acct.email), pwOk = acct.pw.length >= 8;
    const preview = { name: prof.name.trim() || "Your name", section: prof.section ? prof.section.name : "Section", country: prof.section ? prof.section.country : "Country", bio: prof.bio.trim() };
    const groups = [...new Set(SECTIONS.map((s) => s.country))].map((c) => ({ c, items: SECTIONS.filter((s) => s.country === c && (has(s.name, q) || has(c, q))) })).filter((g) => g.items.length);
    if (step === "splash") return (
      <>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28, padding: "0 24px 80px" }}>
          <span style={{ font: "var(--display-xl)", textTransform: "uppercase", letterSpacing: "var(--display-tracking)" }}>[BRAND]</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><h1 style={{ ...S.title, fontSize: 40 }}>Say it. Keep your name out of it.</h1><p style={{ ...S.p, fontSize: 17 }}>Anonymous notes for exchange students, at the events you're actually at.</p></div>
          <Strip />
        </div>
        <div style={{ ...S.bottom, flexDirection: "column" }}><DS.Button size="lg" full onClick={() => setStep("signup")}>Sign up</DS.Button><DS.Button size="lg" full variant="ghost" onClick={() => setStep("login")}>Log in</DS.Button></div>
      </>
    );
    if (step === "signup" || step === "login") { const su = step === "signup"; return (
      <>
        <Back onBack={() => setStep("splash")} />
        <div style={{ ...S.feed, gap: 16, paddingBottom: 170 }}>
          <div style={{ ...S.item, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", paddingTop: 8 }}><Strip w={14} /><h1 style={S.title}>{su ? "Sign up" : "Log in"}</h1><p style={S.p}>{su ? "Two fields and you're nearly in." : "Good to see you again."}</p></div>
          <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}>
            <DS.Button size="lg" full variant="secondary" onClick={() => say("Apple sign-in placeholder")}><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><AppleLogo />Continue with Apple</span></DS.Button>
            <DS.Button size="lg" full variant="secondary" onClick={() => say("Google sign-in placeholder")}><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><GoogleLogo />Continue with Google</span></DS.Button>
          </div>
          <div style={{ ...S.item, display: "flex", alignItems: "center", gap: 12, color: "var(--text-3)", font: "var(--caption)" }}><span style={{ flex: 1, height: 1, background: "var(--border)" }} />or the classic way<span style={{ flex: 1, height: 1, background: "var(--border)" }} /></div>
          <DS.Input style={S.item} inputStyle={{ padding: "9px 14px", minHeight: 40 }} label="Email" type="email" value={acct.email} onChange={(v) => setAcct({ ...acct, email: v })} placeholder="the.real.you@uni.edu" />
          <DS.Input style={S.item} inputStyle={{ padding: "9px 14px", minHeight: 40 }} label="Password" type="password" value={acct.pw} onChange={(v) => setAcct({ ...acct, pw: v })} placeholder={su ? "Something only you'd guess" : "Your password"} hint={su && acct.pw && !pwOk ? "8 characters minimum." : undefined} />
          {su ? <DS.Input style={S.item} inputStyle={{ padding: "9px 14px", minHeight: 40 }} label="Phone" type="tel" value={acct.phone} onChange={(v) => setAcct({ ...acct, phone: v })} placeholder="+90 …" hint="Optional. For the day you forget the one above." /> : <DS.Button size="sm" variant="ghost" onClick={() => say("Reset link sent, if the address exists")} style={{ alignSelf: "flex-start" }}>Forgot password</DS.Button>}
        </div>
        <div style={{ ...S.bottom, flexDirection: "column" }}>
          <DS.Button size="md" full icon="ArrowRight" disabled={!emailOk || !pwOk} onClick={() => (su ? setStep("profile") : onLogin())}>{su ? "Continue" : "Log in"}</DS.Button>
          <DS.Button size="md" full variant="ghost" onClick={() => setStep(su ? "login" : "signup")}>{su ? "Already in? Log in" : "First time here? Sign up"}</DS.Button>
        </div>
      </>
    ); }
    if (step === "profile") return (
      <>
        <Back onBack={() => setStep("signup")} />
        <div style={{ ...S.feed, gap: 16 }}>
          <h1 style={{ ...S.title, ...S.item }}>Set up your profile</h1>
          <div style={{ ...S.item, display: "flex", alignItems: "center", gap: 14 }}>
            <button type="button" onClick={() => { setProf({ ...prof, hasPhoto: true }); say("Photo picker placeholder"); }} style={{ appearance: "none", border: 0, background: "none", padding: 0, position: "relative", cursor: "pointer" }}>
              {prof.hasPhoto ? <DS.Avatar name={prof.name || "You"} size="xl" /> : <span style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--surface-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", border: "1.5px dashed var(--border-strong)" }}><DS.Icon name="Camera" size={22} /></span>}
              <span style={{ position: "absolute", right: -4, bottom: -4, width: 24, height: 24, borderRadius: "50%", background: "var(--ink-900)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px var(--bg)" }}><DS.Icon name={prof.hasPhoto ? "Pencil" : "Plus"} size={13} strokeWidth={2.5} /></span>
            </button>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ font: "var(--body-sm-strong)" }}>Photo</span><span style={S.sub}>Real face, please. An admin checks it once.</span></span>
          </div>
          <DS.Input style={S.item} label="Name" value={prof.name} onChange={(v) => setProf({ ...prof, name: v })} placeholder="How people know you" maxLength={40} />
          <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)" }}>Your section</span>
            <button type="button" onClick={() => setPicking(true)} style={{ ...S.row, border: "1.5px solid var(--border-strong)", borderRadius: "var(--r-input)", minHeight: 48, color: prof.section ? "var(--text)" : "var(--text-3)" }}><DS.Icon name="MapPin" size={18} style={{ color: "var(--text-2)" }} /><span style={{ flex: 1 }}>{prof.section ? prof.section.name : "Pick your section"}</span><DS.Icon name="ChevronDown" size={18} style={{ color: "var(--text-3)" }} /></button>
            <span style={S.sub}>A tag, not a gatekeeper. Sections have no admins.</span>
          </div>
          <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 6 }}><span style={{ font: "var(--body-sm-strong)" }}>Country</span><div style={{ ...S.row, cursor: "default", background: "var(--surface-muted)", borderRadius: "var(--r-input)", minHeight: 48, color: prof.section ? "var(--text)" : "var(--text-3)" }}><DS.Icon name="Flag" size={18} style={{ color: "var(--text-2)" }} /><span style={{ flex: 1 }}>{prof.section ? prof.section.country : "Filled from your section"}</span>{prof.section ? <DS.Icon name="Lock" size={16} style={{ color: "var(--text-3)" }} /> : null}</div></div>
          <DS.Input style={S.item} label="One-line bio" value={prof.bio} onChange={(v) => setProf({ ...prof, bio: v })} placeholder="Where you're from, what you're into" maxLength={80} />
          <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>Your wall header</span><div style={{ padding: "0 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)" }}><WallHeader user={preview} count={0} compact /></div></div>
        </div>
        <div style={S.bottom}><DS.Button size="lg" full icon="Send" disabled={!prof.name.trim() || !prof.section} onClick={() => setStep("pending")}>Send for approval</DS.Button></div>
        {picking ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 10 }}><DS.Sheet title="Your section" onClose={() => setPicking(false)} style={{ maxHeight: "90%" }}>
            <DS.Input placeholder="Search sections or countries" value={q} onChange={setQ} autoFocus />
            <span style={S.sub}>Sections are tags, not admins. Yours only shows where you're from.</span>
            {groups.map((g) => <div key={g.c} style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={S.lbl}>{g.c}</span><div style={{ ...S.group, borderRadius: "var(--r-md)" }}>{g.items.map((s, i) => <button key={s.id} type="button" onClick={() => { setProf({ ...prof, section: s }); setPicking(false); }} style={{ ...S.row, borderTop: i ? "1px solid var(--border)" : 0 }}><span style={{ flex: 1 }}>{s.name}</span><span style={S.sub}>{s.members}</span></button>)}</div></div>)}
          </DS.Sheet></div>
        ) : null}
      </>
    );
    return ( // pending
      <>
        <header style={S.header}><div style={S.hrow}><span style={{ font: "var(--display-sm)", textTransform: "uppercase", letterSpacing: "var(--display-tracking)" }}>[BRAND]</span><DS.Button size="sm" variant="ghost" onClick={() => setStep("splash")}>Log out</DS.Button></div></header>
        <div style={{ ...S.feed, gap: 16 }}>
          <DS.PendingState style={S.item} title="You're in the queue" subtitle="An admin checks every profile by hand, so everyone here is real."
            steps={[{ label: "Profile sent", done: true, description: `${prof.name} · ${prof.section.name}` }, { label: "Admin review", current: true, description: "A person looks at your name and photo. No bots, no ghosts." }, { label: "You're in", description: "We send a notification. Then you can join events." }]}
            note="We'll let you know. Nothing to do until then. You can close the app." />
          <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}><span style={S.lbl}>Your wall header</span><div style={{ padding: "0 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)" }}><WallHeader user={preview} count={0} compact /></div></div>
        </div>
        {notif ? (
          <button type="button" onClick={() => onDone(prof)} style={{ position: "absolute", top: 58, left: 10, right: 10, zIndex: 8, appearance: "none", border: 0, textAlign: "left", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 22, background: "rgba(255,255,255,.92)", backdropFilter: "blur(20px)", boxShadow: "0 8px 30px rgba(0,0,0,.18)", fontFamily: "var(--font-body)", color: "var(--text)", animation: "post-in var(--dur-slow) var(--ease-out) both" }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ink-900)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "700 13px var(--font-display)", flex: "none" }}>[B]</span>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}><span style={{ display: "flex", justifyContent: "space-between" }}><span style={{ font: "var(--body-sm-strong)" }}>You're approved</span><span style={{ ...S.sub, color: "var(--text-3)" }}>now</span></span><span style={{ font: "var(--body-sm)", color: "var(--text-2)" }}>Welcome in. Join your first event with a code or QR.</span></span>
          </button>
        ) : null}
      </>
    );
  }

  // ---- events -----------------------------------------------------------------------------------
  const Ev = ({ e, compact, onPress }) => <DS.EventCard style={S.item} name={e.name} status={e.status} cover={cv(e.cover)} coverSoft={cvs(e.cover)} day={e.day} month={e.month} dayEnd={e.dayEnd} monthEnd={e.monthEnd} timeRange={e.timeRange} scope={e.scope} memberCount={e.memberCount} postCount={e.postCount} compact={compact} onPress={onPress} />;

  function JoinSheet({ me, events, onClose, onJoined }) {
    const [code, setCode] = useState(""); const [err, setErr] = useState(null); const [scan, setScan] = useState(false); const [done, setDone] = useState(null);
    const submit = (c) => { const e = events.find((x) => x.code === c); if (!e) { setErr("No event with that code. Check it with whoever shared it."); return; } if (e.joined.includes(me.id)) { setErr(`You're already in ${e.name}.`); return; } setDone(e); onJoined(e); };
    if (done) return <DS.Sheet title="You're in" onClose={onClose}><Ev e={done} /><span style={S.sub}>{done.status === "live" ? "The board is live. Say hi." : `The board opens ${dateLabel(done)}. You'll see it in Upcoming until then.`}</span><DS.Button size="lg" full icon="ArrowRight" onClick={() => onClose(done)}>Open event</DS.Button></DS.Sheet>;
    if (scan) return (
      <DS.Sheet title="Scan QR" onClose={() => setScan(false)}>
        <div style={{ position: "relative", height: 300, borderRadius: "var(--r-card)", background: "var(--ink-950)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-500)", font: "var(--body-sm)" }}>
          {[["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].map(([v, h]) => <span key={v + h} aria-hidden="true" style={{ position: "absolute", [v]: 56, [h]: 72, width: 28, height: 28, [`border${v[0].toUpperCase() + v.slice(1)}`]: "3px solid #fafafa", [`border${h[0].toUpperCase() + h.slice(1)}`]: "3px solid #fafafa", borderRadius: 4 }} />)}
          <span>Camera · point at the event's QR</span>
        </div>
        <DS.Button size="lg" full variant="secondary" icon="ScanLine" onClick={() => submit("NPL026")}>Simulate a scan</DS.Button>
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
  function CreateSheet({ me, onClose, onCreate }) {
    const [name, setName] = useState(""); const [scope, setScope] = useState("section"); const [start, setStart] = useState("2026-11-28T20:00"); const [end, setEnd] = useState("2026-11-28T23:30"); const [cover, setCover] = useState("coral"); const [mode, setMode] = useState("approve_first");
    const s = new Date(start), e = new Date(end); const valid = name.trim().length > 1 && !isNaN(s) && !isNaN(e) && e > s; const multi = valid && (s.getDate() !== e.getDate() || s.getMonth() !== e.getMonth());
    const wd = (d) => d.toLocaleDateString("en", { weekday: "short" }), hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const draft = { name: name.trim() || "Event name", status: "upcoming", cover, day: String(s.getDate()), month: s.getMonth() + 1, dayEnd: multi ? String(e.getDate()) : undefined, monthEnd: multi && e.getMonth() !== s.getMonth() ? e.getMonth() + 1 : undefined, timeRange: multi ? `${wd(s)}–${wd(e)}` : `${hm(s)}–${hm(e)}`, scope: scope === "national" ? "National" : me.section };
    return (
      <DS.Sheet title="Create event" onClose={onClose} style={{ maxHeight: "94%" }}>
        <DS.Input label="Event name" value={name} onChange={setName} placeholder="İzmir Welcome Night" maxLength={40} autoFocus />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>Who's it for</span><DS.Tabs variant="segmented" value={scope} onChange={setScope} items={[{ id: "section", label: `My section · ${me.section.replace("ESN ", "")}` }, { id: "national", label: "National" }]} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ font: "var(--body-sm-strong)" }}>Starts</span><input type="datetime-local" value={start} onChange={(ev) => setStart(ev.target.value)} style={S.native} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ font: "var(--body-sm-strong)" }}>Ends</span><input type="datetime-local" value={end} onChange={(ev) => setEnd(ev.target.value)} style={S.native} /></label>
        </div>
        <span style={S.sub}>{!valid && name.trim().length > 1 ? "End must be after the start." : multi ? "Multi-day. The board stays open the whole time." : "One night. Set the end on a later day for a multi-day event."}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>Cover color</span><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{COVERS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={cover === c} onClick={() => setCover(c)} style={{ appearance: "none", border: 0, width: 36, height: 36, borderRadius: "50%", background: cv(c), cursor: "pointer", boxShadow: cover === c ? "0 0 0 2px var(--bg), 0 0 0 4px var(--ink-900)" : "none", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--on-cover)" }}>{cover === c ? <DS.Icon name="Check" size={16} strokeWidth={3} /> : null}</button>)}</div></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>Board mode</span><DS.Tabs variant="segmented" value={mode} onChange={setMode} items={[{ id: "approve_first", label: "Approve first" }, { id: "post_immediately", label: "Post immediately" }]} /><span style={S.sub}>{mode === "approve_first" ? "Posts to the room wait for you or a co-moderator before anyone sees them." : "Posts go up as they come. You can still hide them."}</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={S.lbl}>Preview</span><Ev e={draft} compact /></div>
        <DS.Button size="lg" full icon="Plus" disabled={!valid} onClick={() => onCreate({ ...draft, id: "new" + uid(), name: name.trim(), memberCount: 1, code: genCode(), mode, creator: me.id, mods: [], joined: [me.id], end: hm(e) })}>Create event</DS.Button>
      </DS.Sheet>
    );
  }

  // ---- app --------------------------------------------------------------------------------------
  function App() {
    const [persona, setPersona] = useState("deniz");
    const [people, setPeople] = useState(PEOPLE);
    const me = people[persona];
    const [stage, setStage] = useState("onboarding");
    const [tab, setTab] = useState("events");
    const [stack, setStack] = useState([]);
    const [events, setEvents] = useState(EVENTS0);
    const [posts, setPosts] = useState(POSTS0);
    const [inbox, setInbox] = useState(INBOX0);
    const [threads, setThreads] = useState(THREADS0);
    const [mine, setMine] = useState({});
    const [sheet, setSheet] = useState(null);
    const [toast, setToast] = useState(null);
    const [coach, setCoach] = useState(false);
    const [demo, setDemo] = useState(false);
    const [settings, setSettings] = useState({ who: "anyone", blocked: [{ id: "b1", name: "Burak Şen", section: "ESN Ankara" }], muted: ["crush", "ugly"], notif: { inbox: true, threads: true, board: true, events: true } });
    const [evTab, setEvTab] = useState("board");
    const [inboxFilter, setInboxFilter] = useState("new");
    const [qFilter, setQFilter] = useState("waiting");
    const [selecting, setSelecting] = useState(false);
    const [sel, setSel] = useState(new Set());
    const [q, setQ] = useState("");
    const [draft, setDraft] = useState("");
    const [typed, setTyped] = useState("");
    const timers = useRef([]); const inc = useRef(0);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const say = (m, action, onAction) => { setToast({ message: m, action, onAction }); later(() => setToast(null), 3000); };
    const push = (s) => setStack((st) => [...st, s]);
    const pop = () => setStack((st) => st.slice(0, -1));
    const go = (t) => { setTab(t); setStack([]); setSheet(null); };
    const cur = stack[stack.length - 1] || null;

    // live: room posts keep arriving on the live board while it's open
    useEffect(() => {
      if (stage !== "app" || !cur || cur.name !== "event" || cur.id !== "np" || sheet) return;
      const id = setInterval(() => { const src = INCOMING[inc.current % INCOMING.length]; inc.current++; const e = events.find((x) => x.id === "np"); if (!e || e.closed) return; setPosts((ps) => [...ps, { id: uid(), ev: "np", ...src, at: Date.now(), status: e.mode === "approve_first" ? "pending" : "approved", reactions: {}, entering: true }]); }, 12000);
      return () => clearInterval(id);
    }, [stage, cur && cur.name, cur && cur.id, sheet, events]);

    // derived
    const myInbox = inbox.filter((m) => m.to === me.id);
    const newCount = myInbox.filter((m) => m.state === "new").length;
    const myThreads = threads.filter((t) => t.parts[me.id]).sort((a, b) => b.lastAt - a.lastAt);
    const unread = myThreads.filter((t) => t.unread[me.id]).length;
    const wallOf = (id) => inbox.filter((m) => m.to === id && m.state === "approved").sort((a, b) => b.at - a.at);
    const ev = cur && cur.id ? events.find((e) => e.id === cur.id) : null;
    const isMod = (e) => e && (e.creator === me.id || e.mods.includes(me.id));

    // actions
    const patchEv = (id, fn) => setEvents((es) => es.map((e) => (e.id === id ? fn(e) : e)));
    const join = (e) => patchEv(e.id, (x) => ({ ...x, joined: [...x.joined, me.id], memberCount: x.memberCount + 1 }));
    const openEvent = (e) => { setEvTab("board"); setQ(""); push({ name: "event", id: e.id }); };
    const react = (id, em) => { setPosts((ps) => ps.map((p) => { if (p.id !== id) return p; const r = { ...p.reactions }; const prev = mine[id]; if (prev) r[prev] = Math.max(0, (r[prev] || 0) - 1); if (prev !== em) r[em] = (r[em] || 0) + 1; return { ...p, reactions: r }; })); setMine((m) => ({ ...m, [id]: m[id] === em ? null : em })); };
    const decide = (ids, status) => { const set = new Set(ids); setPosts((ps) => ps.map((p) => (set.has(p.id) ? { ...p, anim: status } : p))); later(() => setPosts((ps) => ps.map((p) => (set.has(p.id) ? { ...p, anim: undefined, status, at: Date.now(), entering: true } : p))), 320); say(status === "approved" ? (ids.length > 1 ? `${ids.length} posts on the board` : "On the board") : "Not published. Only the sender sees that."); };
    const sendFromBoard = ({ text, sender, target, person }) => {
      setSheet(null);
      if (target === "person") { setInbox((ib) => [{ id: uid(), to: person.id, from: me.id, text, sender, source: ev.name, state: "new", at: Date.now(), entering: true }, ...ib]); say(`Sent to ${first(person.name)}'s inbox. They decide if it goes public.`); return; }
      const immediate = ev.mode === "post_immediately" || isMod(ev);
      const id = uid();
      setPosts((ps) => [...ps, { id, ev: ev.id, text, sender, by: me.id, at: Date.now(), status: immediate ? "approved" : "pending", reactions: {}, entering: true }]);
      if (immediate) say("On the board"); else later(() => setPosts((ps) => ps.map((p) => (p.id === id && p.status === "pending" ? { ...p, status: "approved", at: Date.now(), entering: true } : p))), 8000); // a moderator releases it unless Kaan gets there first
    };
    const sendToWall = (owner) => ({ text, sender }) => { setInbox((ib) => [{ id: uid(), to: owner.id, from: me.id, text, sender, state: "new", at: Date.now(), entering: true }, ...ib]); setSheet(null); say(`Sent to ${first(owner.name)}'s inbox. They decide if it goes public.`); };
    const setMsg = (id, state) => setInbox((ib) => ib.map((m) => (m.id === id ? { ...m, state, entering: state === "approved" } : m)));
    const approveMsg = (m) => { setMsg(m.id, "approved"); say("On your wall", "View", () => { setToast(null); go("profile"); }); };
    const keepPrivate = (m) => { setMsg(m.id, "private"); say(m.state === "approved" ? "Off the wall. Kept private." : "Kept private"); };
    const startThread = ({ otherId, other, origin, source, text, level, hints }) => {
      const id = "t" + uid();
      const th = { id, parts: { [me.id]: { level, hints }, [otherId]: other }, source, origin, msgs: [{ id: uid(), who: me.id, asLevel: level, text, at: Date.now() }], lastAt: Date.now(), unread: {}, n: 0 };
      setThreads((ts) => [th, ...ts]); setSheet(null); go("threads"); push({ name: "thread", id });
      later(() => setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, msgs: [...t.msgs, { id: uid(), who: otherId, asLevel: t.parts[otherId].level, text: REPLIES[0], at: Date.now() }], lastAt: Date.now() } : t))), 2000);
    };
    const partOf = (sender, id) => (sender.level === "named" ? { level: "named" } : sender.level === "hint" ? { level: "hint", hints: sender.hints } : { level: "anonymous" });
    const sendMsg = (th, text) => {
      const otherId = Object.keys(th.parts).find((k) => k !== me.id); const n = (th.n || 0) + 1;
      setThreads((ts) => ts.map((t) => (t.id === th.id ? { ...t, n, msgs: [...t.msgs, { id: uid(), who: me.id, asLevel: t.parts[me.id].level, text, at: Date.now() }], lastAt: Date.now() } : t)));
      later(() => setThreads((ts) => ts.map((t) => (t.id === th.id ? { ...t, msgs: [...t.msgs, { id: uid(), who: otherId, asLevel: t.parts[otherId].level, text: REPLIES[n % REPLIES.length], at: Date.now() }], lastAt: Date.now() } : t))), 1800);
    };
    const reveal = (th) => { setThreads((ts) => ts.map((t) => (t.id === th.id ? { ...t, parts: { ...t.parts, [me.id]: { level: "named" } }, msgs: [...t.msgs, { id: uid(), who: "sys", text: `${first(me.name)} revealed themselves`, at: Date.now() }], lastAt: Date.now() } : t))); say("They see your name now"); };
    const switchPersona = (p) => { setPersona(p); setStage("app"); setStack([]); setTab("events"); setSheet(null); setDemo(false); setCoach(false); };
    const finishOnboarding = (prof) => { setPeople((pp) => ({ ...pp, [me.id]: { ...pp[me.id], name: prof.name.trim(), bio: prof.bio.trim() || pp[me.id].bio, section: prof.section.name, country: prof.section.country } })); setStage("app"); setCoach(true); };

    const labels = { events: "Events", inbox: "Inbox", threads: "Threads", profile: "Profile" };
    const screenLabel = stage === "onboarding" ? "Onboarding" : cur ? cur.name : labels[tab];

    // ---- screens --------------------------------------------------------------------------------
    const renderEventsRoot = () => {
      const minePlus = events.filter((e) => e.joined.includes(me.id)); const by = (s) => minePlus.filter((e) => e.status === s);
      return (
        <>
          <header style={S.header}><div style={S.hrow}><h1 style={S.title}>Events</h1><button type="button" onClick={() => go("profile")} style={{ appearance: "none", border: 0, background: "none", padding: 0, cursor: "pointer" }}><DS.Avatar name={me.name} size="sm" /></button></div></header>
          <div style={S.feed}>
            {!minePlus.length ? <Empty icon="CalendarDays" text="Nothing here yet. Events you join or create show up in this list." /> : null}
            {by("live").length ? <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 10 }}><span style={{ ...S.lbl, padding: "6px 2px 0" }}>Live</span>{by("live").map((e) => <Ev key={e.id} e={{ ...e, postCount: posts.filter((p) => p.ev === e.id && p.status === "approved").length }} onPress={() => openEvent(e)} />)}</div> : null}
            {by("upcoming").length ? <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 10 }}><span style={{ ...S.lbl, padding: "6px 2px 0" }}>Upcoming</span>{by("upcoming").map((e) => <Ev key={e.id} e={e} compact onPress={() => openEvent(e)} />)}</div> : null}
            {by("archived").length ? <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 10 }}><span style={{ ...S.lbl, padding: "6px 2px 0" }}>Archived</span>{by("archived").map((e) => <Ev key={e.id} e={{ ...e, postCount: posts.filter((p) => p.ev === e.id).length }} compact onPress={() => openEvent(e)} />)}</div> : null}
          </div>
          {coach ? (
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 158, zIndex: 6, display: "flex", flexDirection: "column", alignItems: "flex-start", animation: "post-in var(--dur-slow) var(--ease-out) both" }}>
              <div style={{ background: "var(--ink-900)", color: "#fff", borderRadius: "var(--r-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, width: "100%", boxSizing: "border-box" }}><span style={{ font: "var(--body-strong)" }}>Join an event to get started</span><span style={{ font: "var(--body-sm)", color: "var(--ink-300)" }}>Every event has a 6-character code and a QR at the door. Ask the organiser.</span><DS.Button size="sm" variant="secondary" onClick={() => setCoach(false)} style={{ alignSelf: "flex-end" }}>Got it</DS.Button></div>
              <span aria-hidden="true" style={{ width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "10px solid var(--ink-900)", marginLeft: 60 }} />
            </div>
          ) : null}
          <div style={{ ...S.bottom, bottom: 100 }}><DS.Button size="lg" icon="LogIn" onClick={() => { setCoach(false); setSheet({ kind: "join" }); }} style={{ flex: 1 }}>Join an event</DS.Button><DS.Button size="lg" variant="secondary" icon="Plus" onClick={() => { setCoach(false); setSheet({ kind: "create" }); }}>Create</DS.Button></div>
        </>
      );
    };

    const renderEvent = () => {
      const e = ev; const mod = isMod(e); const joined = e.joined.includes(me.id);
      const approved = posts.filter((p) => p.ev === e.id && p.status === "approved").sort((a, b) => b.at - a.at);
      const pending = posts.filter((p) => p.ev === e.id && (p.status === "pending" || p.anim)).sort((a, b) => a.at - b.at);
      const waiting = posts.filter((p) => p.ev === e.id && p.status === "pending").length;
      const rejectedAll = posts.filter((p) => p.ev === e.id && p.status === "rejected").sort((a, b) => b.at - a.at);
      const myPendings = posts.filter((p) => p.ev === e.id && p.by === me.id && (p.status === "pending" || p.status === "rejected") && !p.dismissed).sort((a, b) => b.at - a.at);
      const members = e.joined.map((id) => people[id]).filter(Boolean);
      const roster = members.filter((m) => has(m.name, q));
      const tabs = [{ id: "board", label: "Board", count: approved.length }, ...(mod && e.mode === "approve_first" ? [{ id: "queue", label: "Queue", count: waiting || undefined, hot: waiting > 0 }] : []), { id: "people", label: "People", count: e.memberCount }];
      const live = e.status === "live" && !e.closed;
      return (
        <>
          <header style={S.header}>
            <div style={S.hrow}>
              <DS.IconButton icon="ArrowLeft" label="Back" onClick={pop} />
              <div style={{ display: "flex", gap: 6 }}>
                {mod ? <DS.IconButton icon="Users" label="Moderators" variant="outline" badge={e.mods.length + 1} onClick={() => setSheet({ kind: "mods" })} /> : null}
                {mod ? <DS.IconButton icon="Settings2" label="Board controls" variant="outline" onClick={() => setSheet({ kind: "controls" })} /> : null}
                {live ? <DS.IconButton icon="Projector" label="Projector mode" variant="outline" onClick={() => push({ name: "projector", id: e.id })} /> : null}
                <DS.IconButton icon="Share" label="Share join code" onClick={() => push({ name: "code", id: e.id })} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}><h1 style={{ ...S.title, font: "var(--display-md)" }}>{e.name}</h1>{e.closed ? <DS.StatusPill status="archived" label="Closed" /> : <DS.StatusPill status={e.status} label={{ live: "Live", upcoming: "Upcoming", archived: "Archived" }[e.status]} />}</div>
            <div style={S.meta}><span style={S.mi}><DS.Icon name="CalendarDays" size={14} strokeWidth={2.25} />{dateLabel(e)} · {e.timeRange}</span><span style={S.mi}><DS.Icon name="MapPin" size={14} strokeWidth={2.25} />{e.scope}</span>{mod ? <DS.Chip size="sm" tone="event" icon={e.mode === "approve_first" ? "ShieldCheck" : "Zap"} onClick={() => setSheet({ kind: "controls" })}>{e.mode === "approve_first" ? "Approve first" : "Post immediately"}</DS.Chip> : null}</div>
            <DS.Tabs value={evTab} onChange={(v) => { setEvTab(v); setSelecting(false); }} items={tabs} />
          </header>
          <div style={{ ...S.feed, paddingTop: 12 }}>
            {evTab === "board" ? (e.status === "upcoming" ? <Empty icon="Radio" tint="var(--event-soft)" text={`The board opens ${dateLabel(e)}. Until then, see who's coming.`} /> : (
              <>
                {e.status === "archived" || e.closed ? <div style={{ ...S.item, display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: "var(--r-card)", background: "var(--surface-muted)", font: "var(--body-sm)", color: "var(--text-2)" }}><DS.Icon name="Lock" size={16} /><span>This board is closed. You can read, not post.</span></div> : null}
                {myPendings.map((myPending) => (
                  <div key={myPending.id} style={{ ...S.item, border: myPending.status === "pending" ? "1.5px dashed var(--border-strong)" : "1px solid var(--border)", borderRadius: "var(--r-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, background: myPending.status === "pending" ? "var(--surface-muted)" : "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><DS.StatusPill status={myPending.status} label={myPending.status === "pending" ? "Waiting for approval" : "Not published"} /><span style={{ font: "var(--caption)", color: "var(--text-3)" }}>Only you see this</span></div>
                    <p style={{ font: "var(--post)", margin: 0, color: myPending.status === "pending" ? "var(--text-2)" : "var(--text-3)", textDecoration: myPending.status === "rejected" ? "line-through" : "none", textDecorationColor: "var(--ink-300)" }}>{myPending.text}</p>
                    {myPending.status === "pending" ? <div style={{ display: "flex", alignItems: "center", gap: 8, font: "var(--body-sm)", color: "var(--text-2)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warning)", animation: "live-pulse var(--dur-pulse) ease-out infinite", "--live": "var(--warning)" }} />A moderator is looking at it</div>
                      : <div style={{ display: "flex", gap: 8 }}><DS.Button size="sm" variant="secondary" icon="PenLine" onClick={() => { setPosts((ps) => ps.map((p) => (p.id === myPending.id ? { ...p, dismissed: true } : p))); setSheet({ kind: "compose" }); }}>Rewrite</DS.Button><DS.Button size="sm" variant="ghost" onClick={() => setPosts((ps) => ps.map((p) => (p.id === myPending.id ? { ...p, dismissed: true } : p)))}>Dismiss</DS.Button></div>}
                  </div>
                ))}
                {approved.map((p) => <DS.PostCard key={p.id} style={S.item} text={p.text} sender={p.sender} time={e.status === "archived" ? dateLabel(e) : rel(p.at)} reactions={p.reactions} myReaction={mine[p.id]} entering={p.entering} eventOutline={p.by === me.id} onReact={live ? (em) => react(p.id, em) : undefined} onReply={live && p.by !== me.id ? () => setSheet({ kind: "reply", post: { ...p, source: e.name } }) : undefined} onMore={live && p.by !== me.id ? () => setSheet({ kind: "report", post: p }) : undefined} labels={{ reply: "Reply privately" }} />)}
                {!approved.length ? <Empty icon="Radio" text="Quiet in here. Say something." /> : <div style={{ textAlign: "center", font: "var(--caption)", color: "var(--text-3)", padding: 12, flex: "none" }}>{e.status === "archived" ? `Board closed ${dateLabel(e)}` : "Board opened 19:00"}</div>}
              </>
            )) : null}
            {evTab === "queue" ? (
              <>
                <div style={{ ...S.hrow, flex: "none" }}><DS.Tabs variant="segmented" value={qFilter} onChange={(f) => { setQFilter(f); setSelecting(false); }} items={[{ id: "waiting", label: "Waiting", count: waiting || undefined }, { id: "rejected", label: "Rejected" }]} style={{ flex: 1 }} />{qFilter === "waiting" && waiting > 1 ? <DS.Button size="sm" variant="ghost" onClick={() => { setSelecting((s) => !s); setSel(new Set()); }}>{selecting ? "Cancel" : "Select"}</DS.Button> : null}</div>
                {qFilter === "waiting" ? (pending.length ? pending.map((p, i) => <Swipe key={p.id} disabled={selecting || !!p.anim} onApprove={() => decide([p.id], "approved")} onReject={() => decide([p.id], "rejected")}><DS.QueueCard index={i + 1} text={p.text} sender={p.sender} time={rel(p.at)} state={p.anim || "pending"} selectable={selecting} selected={sel.has(p.id)} onSelect={() => setSel((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} onApprove={() => decide([p.id], "approved")} onReject={() => decide([p.id], "rejected")} /></Swipe>) : <Empty icon="ListChecks" text="All clear." />)
                  : (rejectedAll.length ? rejectedAll.map((p) => <div key={p.id} style={{ ...S.item, display: "flex", flexDirection: "column", gap: 6 }}><div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px" }}><DS.StatusPill status="rejected" label="Not published" /><span style={S.sub}>Only the sender sees this</span></div><DS.PostCard text={p.text} sender={p.sender} time={rel(p.at)} style={{ opacity: 0.7 }} actions={[{ label: "Approve anyway", icon: "Check", variant: "secondary", onClick: () => decide([p.id], "approved") }]} /></div>) : <Empty icon="X" text="Nothing rejected." />)}
                {qFilter === "waiting" ? <p style={{ ...S.item, margin: "8px 4px 0", font: "var(--caption)", color: "var(--text-3)", display: "flex", gap: 8 }}><DS.Icon name="Inbox" size={14} style={{ flex: "none", marginTop: 2 }} />Messages to a person go straight to that person's inbox and never appear in this queue.</p> : null}
              </>
            ) : null}
            {evTab === "people" ? (
              <>
                <DS.Input placeholder="Search people" value={q} onChange={setQ} style={S.item} />
                <div style={{ ...S.group, ...S.item }}>{roster.map((m, i) => <PersonRow key={m.id} p={m} first={!i} me={m.id === me.id} onClick={() => (m.id === me.id ? go("profile") : push({ name: "wall", id: m.id }))} />)}{!roster.length ? <div style={{ padding: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>No one by that name here.</div> : null}</div>
                <span style={{ ...S.sub, textAlign: "center", padding: 4 }}>{e.memberCount} joined · everyone here was approved by an admin</span>
              </>
            ) : null}
          </div>
          {selecting && evTab === "queue" ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px 34px", background: "var(--surface)", borderTop: "1px solid var(--border)", display: "flex", gap: 8, zIndex: 5 }}><DS.Button size="lg" variant="ghost" onClick={() => setSel(sel.size === pending.length ? new Set() : new Set(pending.map((p) => p.id)))}>{sel.size === pending.length ? "None" : "All"}</DS.Button><DS.Button size="lg" full icon="Check" disabled={!sel.size} onClick={() => { decide([...sel], "approved"); setSel(new Set()); setSelecting(false); }} style={{ flex: 1 }}>Approve all selected{sel.size ? ` (${sel.size})` : ""}</DS.Button></div> : null}
          {evTab === "board" && live && joined && !selecting ? <div style={{ position: "absolute", right: 16, bottom: 34, zIndex: 5 }}><DS.IconButton icon="PenLine" label="Write" variant="filled" size="lg" onClick={() => setSheet({ kind: "compose" })} /></div> : null}
        </>
      );
    };

    const renderProjector = () => {
      const list = posts.filter((p) => p.ev === ev.id && p.status === "approved").sort((a, b) => b.at - a.at).slice(0, 2);
      const scale = Math.min(844 / 1920, 390 / 1080);
      return (
        <div data-theme="projector" onClick={pop} style={{ position: "absolute", inset: 0, background: "var(--ink-950)", zIndex: 20, cursor: "pointer", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 14, left: 0, right: 0, textAlign: "center", font: "var(--caption)", color: "var(--ink-500)", letterSpacing: ".06em", textTransform: "uppercase", zIndex: 2 }}>Projector · 1920×1080 · tap to exit</div>
          <div style={{ position: "absolute", left: 195, top: 422, width: 1920, height: 1080, marginLeft: -960, marginTop: -540, transform: `rotate(90deg) scale(${scale})`, transformOrigin: "50% 50%", padding: "72px 96px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 56, overflow: "hidden", color: "#fafafa", background: "var(--ink-950)", boxShadow: "0 0 0 1px var(--ink-800)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ font: "var(--projector-title)", textTransform: "uppercase", letterSpacing: "var(--display-tracking)" }}>{ev.name}</span><span style={{ display: "inline-flex", alignItems: "center", gap: 18, font: "var(--projector-meta)", textTransform: "uppercase", color: "var(--live)" }}><span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--live)", animation: "live-pulse var(--dur-pulse) ease-out infinite" }} />Live · {ev.memberCount}</span></div>
            {list.map((p) => <DS.ProjectorPost key={p.id} text={p.text} sender={p.sender} time={rel(p.at)} reactions={p.reactions} />)}
          </div>
        </div>
      );
    };

    const renderCode = () => (
      <>
        <Back onBack={pop} title={cur.created ? "Event created" : "Join code"} />
        <div style={{ ...S.feed, paddingTop: 8 }}>
          <span style={{ ...S.sub, ...S.item, marginTop: -8 }}>{cur.created ? "Share the code or QR. People who join land in People; the board opens at the start time." : "Anyone with the code or QR can join."}</span>
          <Ev e={ev} compact />
          <DS.JoinCodeBlock style={S.item} code={ev.code} eventColorSoft={cvs(ev.cover)} onCopy={() => say("Copied")} onShare={() => say(`Share sheet · “Join ${ev.name}: ${ev.code}”`)} />
        </div>
        <div style={S.bottom}><DS.Button size="lg" full icon="Check" onClick={pop}>Done</DS.Button></div>
      </>
    );

    const renderWall = (userId) => {
      const owner = people[userId]; const isMe = userId === me.id; const wall = wallOf(userId);
      return (
        <>
          <header style={S.header}><div style={S.hrow}>{isMe ? <h1 style={S.title}>Profile</h1> : <DS.IconButton icon="ArrowLeft" label="Back" onClick={pop} />}<div style={{ display: "flex", gap: 6 }}>{isMe ? <DS.IconButton icon="Settings" label="Settings" variant="outline" onClick={() => push({ name: "settings" })} /> : null}<DS.IconButton icon="Share" label="Share wall" onClick={() => say("Link copied")} /></div></div></header>
          <div style={{ ...S.feed, paddingTop: 4 }}>
            <WallHeader user={owner} count={wall.length} onSection={() => push({ name: "section", sec: sectionOf(owner.section).id })} />
            {wall.length ? wall.map((m) => <DS.PostCard key={m.id} style={S.item} large text={m.text} sender={m.sender} time={rel(m.at)} approvedFromBoard={m.fromBoard} entering={m.entering} onMore={isMe ? () => setSheet({ kind: "more", msg: m }) : undefined} />) : <Empty icon="StickyNote" text={isMe ? "Approved messages will show here. Approve one from your inbox." : "Nothing on the wall yet."} />}
          </div>
          {!isMe ? <div style={S.bottom}><DS.Button size="lg" full icon="PenLine" onClick={() => setSheet({ kind: "wallCompose", owner })}>Write on the wall</DS.Button></div> : null}
        </>
      );
    };

    const renderSection = () => {
      const s = SECTIONS.find((x) => x.id === cur.sec); const members = Object.values(people).filter((p) => p.section === s.name);
      return (
        <>
          <Back onBack={pop} />
          <div style={S.feed}>
            <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>Section</span><h1 style={S.title}>{s.name}</h1><div style={S.meta}><span style={S.mi}><DS.Icon name="Flag" size={14} strokeWidth={2.25} />{s.country}</span><span style={S.mi}><DS.Icon name="Users" size={14} strokeWidth={2.25} />{s.members} members</span></div></div>
            <Note icon="Tag">A section is a tag people put on their profile. It has no admins and no board of its own.</Note>
            <div style={{ ...S.group, ...S.item }}>{members.map((m, i) => <PersonRow key={m.id} p={m} first={!i} me={m.id === me.id} onClick={() => (m.id === me.id ? go("profile") : push({ name: "wall", id: m.id }))} />)}<div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", ...S.sub, textAlign: "center" }}>and {s.members - members.length} more</div></div>
          </div>
        </>
      );
    };

    const renderInbox = () => {
      const list = myInbox.filter((m) => m.state === (inboxFilter === "wall" ? "approved" : inboxFilter)).sort((a, b) => b.at - a.at);
      const actionsFor = (m) => m.state === "new" ? [{ label: "Approve to wall", icon: "Check", onClick: () => approveMsg(m) }, { label: "Keep private", onClick: () => keepPrivate(m) }] : m.state === "private" ? [{ label: "Approve to wall", icon: "Check", variant: "secondary", onClick: () => approveMsg(m) }] : [{ label: "Keep private", icon: "EyeOff", variant: "secondary", onClick: () => keepPrivate(m) }];
      return (
        <>
          <header style={S.header}><div style={S.hrow}><h1 style={S.title}>Inbox</h1><DS.IconButton icon="Settings" label="Who can write to me" onClick={() => { push({ name: "set:who" }); }} /></div><DS.Tabs variant="segmented" value={inboxFilter} onChange={setInboxFilter} items={[{ id: "new", label: "New", count: newCount || undefined }, { id: "private", label: "Private" }, { id: "wall", label: "On wall" }]} /></header>
          <div style={S.feed}>
            {list.length ? list.map((m) => m.locked ? (
              // Stage 1: locked cards ship unlocked. When unlocking launches, drop `unlocked` and pass onUnlock.
              <DS.LockedCard key={m.id} style={S.item} unlocked level={m.sender.level} hints={m.sender.hints} text={m.text} time={rel(m.at)} source={m.source}><div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{actionsFor(m).map((a, i) => <DS.Button key={i} size="sm" variant={a.variant || (i === 0 ? "primary" : "secondary")} icon={a.icon} onClick={a.onClick}>{a.label}</DS.Button>)}<span style={{ flex: 1 }} /><DS.IconButton icon="Ellipsis" label="More" size="sm" onClick={() => setSheet({ kind: "more", msg: m })} /></div></DS.LockedCard>
            ) : <DS.PostCard key={m.id} style={S.item} text={m.text} sender={m.sender} time={rel(m.at)} source={m.source} entering={m.entering && m.state === "new"} onMore={() => setSheet({ kind: "more", msg: m })} actions={actionsFor(m)} />)
              : <Empty icon={inboxFilter === "new" ? "Inbox" : inboxFilter === "private" ? "EyeOff" : "StickyNote"} text={inboxFilter === "new" ? "Nothing yet — join an event to get messages" : inboxFilter === "private" ? "Messages you keep private land here" : "Approved messages will show here"} />}
          </div>
        </>
      );
    };

    const renderThreads = () => (
      <>
        <header style={{ ...S.header, paddingBottom: 40 /* reserved for a Requests tab later */ }}><div style={S.hrow}><h1 style={S.title}>Threads</h1></div></header>
        <div style={S.feed}>
          {myThreads.length ? (
            <div style={{ ...S.group, ...S.item }}>
              {myThreads.map((t, i) => { const otherId = Object.keys(t.parts).find((k) => k !== me.id); const other = vis(otherId, t.parts[otherId]); const last = t.msgs[t.msgs.length - 1]; const un = t.unread[me.id]; return (
                <button key={t.id} type="button" onClick={() => { setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, unread: { ...x.unread, [me.id]: false } } : x))); push({ name: "thread", id: t.id }); }} style={{ appearance: "none", border: 0, borderTop: i ? "1px solid var(--border)" : 0, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", minHeight: 72, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}><DS.AnonymityBadge level={other.level} name={other.name} hints={other.hints} size="md" /><span style={{ marginLeft: "auto", ...S.sub, color: "var(--text-3)", flex: "none" }}>{rel(t.lastAt)}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}><span style={{ flex: 1, font: un ? "var(--body-sm-strong)" : "var(--body-sm)", color: un ? "var(--text)" : "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last.who === me.id ? "You: " : ""}{last.text}</span>{un ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink-900)", flex: "none" }} /> : null}</div>
                  {other.level !== "named" ? <span style={S.sub}>from {t.source}</span> : null}
                </button>); })}
            </div>
          ) : <Empty icon="MessagesSquare" text="No threads yet. Reply privately to a post to start one." />}
        </div>
      </>
    );

    const renderThread = () => {
      const th = threads.find((t) => t.id === cur.id); if (!th) return <Back onBack={pop} title="Thread removed" />;
      const otherId = Object.keys(th.parts).find((k) => k !== me.id); const other = vis(otherId, th.parts[otherId]); const canReveal = th.parts[me.id].level !== "named";
      return (
        <>
          <header style={{ ...S.header, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}><div style={S.hrow}><DS.IconButton icon="ArrowLeft" label="Back" onClick={pop} /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><DS.AnonymityBadge level={other.level} name={other.name} hints={other.hints} size="md" />{other.level !== "named" ? <span style={S.sub}>from {th.source}</span> : null}</div><DS.IconButton icon="Ellipsis" label="More" onClick={() => setSheet({ kind: "threadMore", th, canReveal })} /></div></header>
          <div style={{ ...S.feed, gap: 10, padding: "12px 16px 16px" }}>
            <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 6, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}><span style={{ ...S.lbl, display: "inline-flex", gap: 6, alignItems: "center" }}><DS.Icon name="Pin" size={12} strokeWidth={2.5} />{th.origin.by === me.id ? "Your post" : "Their post"} · {th.source}</span><DS.PostCard text={th.origin.text} sender={th.origin.sender} time="" eventOutline /></div>
            {th.msgs.map((m) => m.who === "sys" ? <DS.ThreadBubble key={m.id} system text={m.text} style={S.item} /> : <DS.ThreadBubble key={m.id} text={m.text} mine={m.who === me.id} sender={m.who === me.id ? undefined : vis(m.who, { level: m.asLevel, hints: th.parts[m.who].hints })} time={clock(m.at)} style={S.item} />)}
          </div>
          <div style={{ flex: "none", display: "flex", gap: 8, alignItems: "center", padding: "8px 16px 34px", borderTop: "1px solid var(--border)", background: "var(--surface)" }}><DS.Input value={draft} onChange={setDraft} placeholder="Reply…" maxLength={500} style={{ flex: 1 }} /><DS.IconButton icon="ArrowUp" label="Send" variant="filled" disabled={!draft.trim()} onClick={() => { sendMsg(th, draft.trim()); setDraft(""); }} /></div>
        </>
      );
    };

    const renderSettings = () => {
      const st = settings, set = (patch) => setSettings({ ...st, ...patch });
      const whoLabel = { anyone: "Anyone", namedOnly: "Named only", nobody: "Nobody" }[st.who];
      const name = cur.name;
      if (name === "settings") return (
        <>
          <Back onBack={pop} title="Settings" />
          <div style={{ ...S.feed, gap: 16 }}>
            <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}><span style={{ ...S.lbl, padding: "0 2px" }}>Privacy</span><div style={S.group}><Row first icon="MessageSquareLock" label="Who can write to me" value={whoLabel} onClick={() => push({ name: "set:who" })} /><Row icon="Ban" label="Blocked people" value={String(st.blocked.length)} onClick={() => push({ name: "set:blocked" })} /><Row icon="VolumeX" label="Muted words" value={String(st.muted.length)} onClick={() => push({ name: "set:muted" })} /></div></div>
            <div style={{ ...S.group, ...S.item }}><Row first icon="Bell" label="Notifications" value={`${Object.values(st.notif).filter(Boolean).length}/4`} onClick={() => push({ name: "set:notif" })} /><Row icon="Languages" label="Language" value="English" onClick={() => push({ name: "set:lang" })} /></div>
            <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}><span style={{ ...S.lbl, padding: "0 2px" }}>Account</span><div style={S.group}><Row first icon="UserPen" label="Edit profile" onClick={() => push({ name: "set:profile" })} /><Row icon="MapPin" label="Change section" value={me.section} onClick={() => push({ name: "set:section" })} /><Row icon="LogOut" label="Log out" onClick={() => setSheet({ kind: "logout" })} /><Row icon="Trash2" label="Delete account" danger onClick={() => setSheet({ kind: "delete1" })} /></div></div>
            <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}><span style={{ ...S.lbl, padding: "0 2px" }}>Legal</span><div style={S.group}><Row first icon="Shield" label="Privacy policy" value="Opens in your browser" external onClick={() => say("Opens in your browser")} /><Row icon="FileText" label="Terms of use" value="Opens in your browser" external onClick={() => say("Opens in your browser")} /></div></div>
            <span style={{ ...S.sub, ...S.item, textAlign: "center", color: "var(--text-3)" }}>Version 0.1 · stage 1</span>
          </div>
        </>
      );
      if (name === "set:who") return (
        <><Back onBack={pop} title="Who can write to me" /><div style={{ ...S.feed, gap: 16 }}>
          <div style={{ ...S.group, ...S.item }}>{[["anyone", "Anyone", "Anyone at an event you joined can write to your inbox, anonymously or not.", "Users"], ["namedOnly", "Named only", "Only people who show their name can write. Anonymous and hint messages bounce.", "User"], ["nobody", "Nobody", "Your inbox closes. Board posts and threads you already have still work.", "MessageSquareOff"]].map(([id, l, d, ic], i) => <button key={id} type="button" onClick={() => set({ who: id })} aria-pressed={st.who === id} style={{ ...S.row, borderTop: i ? "1px solid var(--border)" : 0, minHeight: 64, alignItems: "flex-start", padding: "12px 14px" }}><DS.Icon name={ic} size={20} style={{ color: "var(--text-2)", flex: "none", marginTop: 2 }} /><span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}><span style={{ font: st.who === id ? "var(--body-strong)" : "var(--body)" }}>{l}</span><span style={S.sub}>{d}</span></span><span style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", border: st.who === id ? 0 : "1.5px solid var(--border-strong)", background: st.who === id ? "var(--ink-900)" : "transparent", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{st.who === id ? <DS.Icon name="Check" size={14} strokeWidth={3} /> : null}</span></button>)}</div>
          <Note>Applies from now on. Messages already in your inbox stay.</Note>
        </div></>
      );
      if (name === "set:blocked") return (
        <><Back onBack={pop} title="Blocked people" /><div style={{ ...S.feed, gap: 16 }}>
          {st.blocked.length ? <div style={{ ...S.group, ...S.item }}>{st.blocked.map((b, i) => <PersonRow key={b.id} p={b} first={!i} right={<DS.Button size="sm" variant="secondary" onClick={() => { set({ blocked: st.blocked.filter((x) => x.id !== b.id) }); say(`${first(b.name)} unblocked`); }}>Unblock</DS.Button>} />)}</div> : <p style={{ ...S.p, ...S.item, textAlign: "center", padding: "32px 0" }}>Nobody blocked. Good sign.</p>}
          <Note icon="Ban">Blocked people can't write to you or reply in your threads. They aren't told.</Note>
        </div></>
      );
      if (name === "set:muted") return (
        <><Back onBack={pop} title="Muted words" /><div style={{ ...S.feed, gap: 16 }}>
          <div style={{ ...S.item, display: "flex", gap: 8, alignItems: "flex-start" }}><DS.Input value={draft} onChange={setDraft} placeholder="Add a word" style={{ flex: 1 }} maxLength={30} /><DS.Button icon="Plus" variant="secondary" disabled={!draft.trim()} onClick={() => { const w = draft.trim().toLowerCase(); if (w && !st.muted.includes(w)) set({ muted: [...st.muted, w] }); setDraft(""); }}>Add</DS.Button></div>
          {st.muted.length ? <div style={{ ...S.item, display: "flex", flexWrap: "wrap", gap: 8 }}>{st.muted.map((w) => <DS.Chip key={w} icon="X" tone="outline" onClick={() => set({ muted: st.muted.filter((x) => x !== w) })}>{w}</DS.Chip>)}</div> : <p style={{ ...S.p, ...S.item, textAlign: "center", padding: "24px 0" }}>No muted words yet.</p>}
          <Note icon="VolumeX">Messages with these words skip your inbox and land in Private. Case doesn't matter.</Note>
        </div></>
      );
      if (name === "set:notif") return (
        <><Back onBack={pop} title="Notifications" /><div style={{ ...S.feed, gap: 16 }}><div style={{ ...S.group, ...S.item, padding: "0 14px" }}>{[["inbox", "Inbox", "Someone writes to you"], ["threads", "Threads", "A reply in a private thread"], ["board", "Board mentions", "A moderator releases your post, or people react to it"], ["events", "Event reminders", "An event you joined is about to start"]].map(([k, l, d], i) => <div key={k} style={{ borderTop: i ? "1px solid var(--border)" : 0, padding: "4px 0" }}><DS.Switch checked={st.notif[k]} onChange={(v) => set({ notif: { ...st.notif, [k]: v } })} label={l} description={d} /></div>)}</div></div></>
      );
      if (name === "set:lang") return (
        <><Back onBack={pop} title="Language" /><div style={{ ...S.feed, gap: 16 }}><div style={{ ...S.group, ...S.item }}>{[["en", "English", "English", true], ["tr", "Türkçe", "Turkish", false]].map(([id, l, d, on], i) => <button key={id} type="button" onClick={() => (on ? null : say("Full Turkish UI: see the Settings prototype"))} style={{ ...S.row, borderTop: i ? "1px solid var(--border)" : 0, minHeight: 60 }}><span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ font: on ? "var(--body-strong)" : "var(--body)" }}>{l}</span><span style={S.sub}>{d}</span></span>{on ? <DS.Icon name="Check" size={20} strokeWidth={2.5} /> : null}</button>)}</div><Note icon="Languages">Changes every label in the app. What people wrote stays as written.</Note></div></>
      );
      if (name === "set:profile") return (
        <><Back onBack={pop} title="Edit profile" /><div style={{ ...S.feed, gap: 16 }}>
          <div style={{ ...S.item, display: "flex", alignItems: "center", gap: 14 }}><DS.Avatar name={me.name} size="xl" /><DS.Button size="sm" variant="secondary" icon="Camera" onClick={() => say("Photo picker placeholder")}>Change photo</DS.Button></div>
          <DS.Input style={S.item} label="Name" value={me.name} onChange={(v) => setPeople({ ...people, [me.id]: { ...me, name: v } })} maxLength={40} />
          <DS.Input style={S.item} label="One-line bio" value={me.bio} onChange={(v) => setPeople({ ...people, [me.id]: { ...me, bio: v } })} maxLength={80} />
        </div><div style={S.bottom}><DS.Button size="lg" full icon="Check" onClick={() => { say("Saved"); pop(); }}>Save</DS.Button></div></>
      );
      if (name === "set:section") return (
        <><Back onBack={pop} title="Change section" /><div style={{ ...S.feed, gap: 16 }}>
          <Note icon="Clock">Changing your section sends your profile back to the admin queue. You can read everything while you wait, but you can't post or write to anyone until you're approved again.</Note>
          <div style={{ ...S.group, ...S.item }}>{SECTIONS.map((s, i) => { const on = s.name === me.section; return <button key={s.id} type="button" disabled={on} onClick={() => setSheet({ kind: "section", s })} style={{ ...S.row, borderTop: i ? "1px solid var(--border)" : 0, minHeight: 56, cursor: on ? "default" : "pointer" }}><span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: on ? "var(--body-strong)" : "var(--body)" }}>{s.name}</span><span style={S.sub}>{s.country} · {s.members} members</span></span>{on ? <DS.Chip size="sm">Now</DS.Chip> : <DS.Icon name="ChevronRight" size={18} style={{ color: "var(--text-3)" }} />}</button>; })}</div>
        </div></>
      );
      return null;
    };

    const renderScreen = () => {
      if (!cur) return { events: renderEventsRoot, inbox: renderInbox, threads: renderThreads, profile: () => renderWall(me.id) }[tab]();
      switch (cur.name) {
        case "event": return ev ? renderEvent() : null;
        case "projector": return renderProjector();
        case "code": return renderCode();
        case "wall": return renderWall(cur.id);
        case "section": return renderSection();
        case "thread": return renderThread();
        default: return renderSettings();
      }
    };

    // ---- sheets ---------------------------------------------------------------------------------
    const renderSheet = () => {
      if (!sheet) return null;
      const k = sheet.kind;
      if (k === "join") return <JoinSheet me={me} events={events} onJoined={join} onClose={(e) => { setSheet(null); if (e) openEvent(e); }} />;
      if (k === "create") return <CreateSheet me={me} onClose={() => setSheet(null)} onCreate={(e) => { setEvents((es) => [e, ...es]); setSheet(null); push({ name: "code", id: e.id, created: true }); }} />;
      if (k === "compose") return <Composer me={me} ev={ev} members={ev.joined.filter((id) => id !== me.id).map((id) => people[id]).filter(Boolean)} onClose={() => setSheet(null)} onSend={sendFromBoard} />;
      if (k === "wallCompose") return <Composer me={me} wallOwner={sheet.owner} onClose={() => setSheet(null)} onSend={sendToWall(sheet.owner)} />;
      if (k === "reply") { const p = sheet.post; return <ReplySheet me={me} post={p} onClose={() => setSheet(null)} onSend={({ text, level, hints }) => startThread({ otherId: p.by || p.from, other: partOf(p.sender), origin: { text: p.text, sender: p.sender, by: p.by || p.from }, source: p.source || NP, text, level, hints })} />; }
      if (k === "report") return <ReportSheet post={sheet.post} onClose={() => setSheet(null)} onDone={() => { setSheet(null); say("Reported. Only the admin sees who sent it."); }} />;
      if (k === "more") { const m = sheet.msg; return (
        <DS.Sheet onClose={() => setSheet(null)}>
          <DS.PostCard text={m.text} sender={m.sender} time={rel(m.at)} source={m.source} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <button type="button" style={S.mrow} onClick={() => setSheet({ kind: "reply", post: { ...m, at: m.at } })}><DS.Icon name="Reply" size={20} /><span>Reply privately</span></button>
            {m.state === "approved" ? <button type="button" style={S.mrow} onClick={() => { setSheet(null); keepPrivate(m); }}><DS.Icon name="EyeOff" size={20} /><span>Take off the wall</span></button> : null}
            <button type="button" style={S.mrow} onClick={() => setSheet({ kind: "report", post: m })}><DS.Icon name="Flag" size={20} /><span>Report</span></button>
            <button type="button" style={S.mrow} onClick={() => setSheet({ kind: "block", msg: m })}><DS.Icon name="Ban" size={20} /><span>{m.sender.level === "named" ? `Block ${first(m.sender.name)}` : "Block sender"}</span></button>
            <button type="button" style={{ ...S.mrow, color: "var(--danger)" }} onClick={() => setSheet({ kind: "delete", msg: m })}><DS.Icon name="Trash2" size={20} /><span>Delete</span></button>
          </div>
        </DS.Sheet>
      ); }
      if (k === "delete") return <ConfirmSheet title="Delete message?" body="It goes from your inbox and your wall. No undo." action="Delete" onClose={() => setSheet(null)} onConfirm={() => { setInbox((ib) => ib.filter((x) => x.id !== sheet.msg.id)); setSheet(null); say("Deleted"); }} />;
      if (k === "block") { const m = sheet.msg; return <ConfirmSheet title="Block sender?" body={m.sender.level === "named" ? `${first(m.sender.name)} can't write to you again. This message is removed.` : "You won't learn who they are, but they can't write to you again. This message is removed."} action="Block" onClose={() => setSheet(null)} onConfirm={() => { setInbox((ib) => ib.filter((x) => x.id !== m.id)); setSettings((st) => ({ ...st, blocked: [...st.blocked, { id: m.from, name: m.sender.level === "named" ? m.sender.name : "Anonymous sender", section: people[m.from] ? people[m.from].section : "" }] })); setSheet(null); say("Blocked. They can't write to you again."); }} />; }
      if (k === "threadMore") { const th = sheet.th; const otherId = Object.keys(th.parts).find((x) => x !== me.id); const other = vis(otherId, th.parts[otherId]); return (
        <DS.Sheet onClose={() => setSheet(null)}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sheet.canReveal ? <button type="button" style={S.mrow} onClick={() => setSheet({ kind: "reveal", th })}><DS.Icon name="Eye" size={20} /><span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span>Reveal myself</span><span style={S.sub}>They see your name and photo. Can't be undone here.</span></span></button> : null}
            <button type="button" style={S.mrow} onClick={() => setSheet({ kind: "report", post: null })}><DS.Icon name="Flag" size={20} /><span>Report</span></button>
            <button type="button" style={{ ...S.mrow, color: "var(--danger)" }} onClick={() => setSheet({ kind: "blockThread", th, other })}><DS.Icon name="Ban" size={20} /><span>{other.level === "named" ? `Block ${first(other.name)}` : "Block"}</span></button>
          </div>
        </DS.Sheet>
      ); }
      if (k === "reveal") return <ConfirmSheet title="Reveal myself?" danger={false} body="They will see your name and photo from now on. Earlier messages stay as they were. One-way, permanent in this thread." preview={<div style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={S.lbl}>They'll see</span><div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: "var(--r-card)" }}><DS.AnonymityBadge level="named" name={me.name} size="lg" /></div></div>} action="Reveal myself" onClose={() => setSheet(null)} onConfirm={() => { setSheet(null); reveal(sheet.th); }} />;
      if (k === "blockThread") return <ConfirmSheet title="Block?" body={`${sheet.other.level === "named" ? first(sheet.other.name) : "They"} can't write to you again and this thread is removed for you.`} action="Block" onClose={() => setSheet(null)} onConfirm={() => { setThreads((ts) => ts.filter((t) => t.id !== sheet.th.id)); setSheet(null); pop(); say("Blocked. They can't write to you again."); }} />;
      if (k === "mods") { const e = ev; const mods = e.mods.map((id) => people[id]); return <ModsSheet me={me} e={e} mods={mods} people={people} onClose={() => setSheet(null)} onAdd={(m) => { patchEv(e.id, (x) => ({ ...x, mods: [...x.mods, m.id] })); say(`${first(m.name)} can approve posts now`); }} onRemove={(m) => { patchEv(e.id, (x) => ({ ...x, mods: x.mods.filter((id) => id !== m.id) })); say(`${first(m.name)} removed`); }} />; }
      if (k === "controls") { const e = ev; const waiting = posts.filter((p) => p.ev === e.id && p.status === "pending").length; return (
        <DS.Sheet title="Board controls" onClose={() => setSheet(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>Board mode</span><DS.Tabs variant="segmented" value={e.mode} onChange={(m) => { patchEv(e.id, (x) => ({ ...x, mode: m })); say(m === "approve_first" ? "Posts wait for you now" : "Posts go up as they come now"); }} items={[{ id: "approve_first", label: "Approve first" }, { id: "post_immediately", label: "Post immediately" }]} /><span style={S.sub}>{e.mode === "approve_first" ? "Posts to the room wait for you." : `Posts go up as they come.${waiting ? ` The ${waiting} already waiting still need a decision.` : ""}`}</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>Ends</span><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{["01:00", "02:00", "03:00", "No end"].map((v) => <DS.Chip key={v} selected={e.end === v} onClick={() => { patchEv(e.id, (x) => ({ ...x, end: v })); say(v === "No end" ? "No end time. Close it by hand." : `Board ends at ${v}`); }}>{v}</DS.Chip>)}</div><span style={S.sub}>The board closes itself at this time. Posts stay readable.</span></div>
          <DS.Button size="lg" full variant="danger" icon="Square" onClick={() => setSheet({ kind: "close" })}>Close board now</DS.Button>
        </DS.Sheet>
      ); }
      if (k === "close") return <ConfirmSheet title="Close the board?" body="No one can post after this. Everything already on the board stays readable." action="Close board" onClose={() => setSheet({ kind: "controls" })} onConfirm={() => { patchEv(ev.id, (x) => ({ ...x, closed: true })); setSheet(null); say("Board closed. It stays readable."); }} />;
      if (k === "logout") return <DS.Sheet title="Log out" onClose={() => setSheet(null)}><p style={S.p}>Your inbox, wall and threads stay. Log back in any time.</p><DS.Button size="lg" full onClick={() => { setSheet(null); setStack([]); setStage("onboarding"); }}>Log out</DS.Button><DS.Button size="lg" full variant="ghost" onClick={() => setSheet(null)}>Cancel</DS.Button></DS.Sheet>;
      if (k === "section") return <ConfirmSheet title={`Change to ${sheet.s.name}?`} danger={false} body="You go back to the queue. Reading works, posting waits for approval." action="Change" onClose={() => setSheet(null)} onConfirm={() => { setPeople({ ...people, [me.id]: { ...me, section: sheet.s.name, country: sheet.s.country } }); setSheet(null); pop(); say("Section changed. You're back in the queue."); }} />;
      if (k === "delete1") return <DS.Sheet title="Delete your account?" onClose={() => setSheet(null)}><p style={S.p}>This deletes, it doesn't deactivate. Your profile, wall, inbox, threads and every post you made are removed from our servers. Messages you sent to others are removed from their inboxes and walls too.</p><Note icon="TriangleAlert">No undo, no grace period, no “restore” email.</Note><DS.Button size="lg" full variant="danger" onClick={() => { setTyped(""); setSheet({ kind: "delete2" }); }}>Continue</DS.Button><DS.Button size="lg" full variant="ghost" onClick={() => setSheet(null)}>Cancel</DS.Button></DS.Sheet>;
      if (k === "delete2") return <DS.Sheet title="Last check" onClose={() => setSheet(null)}><p style={S.p}>Type DELETE to confirm. Everything goes now.</p><DS.Input value={typed} onChange={setTyped} placeholder="DELETE" autoFocus inputStyle={{ textTransform: "uppercase", letterSpacing: ".12em", textAlign: "center", font: "var(--display-sm)" }} /><DS.Button size="lg" full variant="danger" icon="Trash2" disabled={typed.trim().toUpperCase() !== "DELETE"} onClick={() => { setSheet(null); setStack([]); setStage("onboarding"); say("Deleted. Nothing of yours is left."); }}>Delete everything</DS.Button><DS.Button size="lg" full variant="ghost" onClick={() => setSheet(null)}>Cancel</DS.Button></DS.Sheet>;
      return null;
    };

    const showTabs = stage === "app" && !cur;
    const frameVars = ev ? { "--event": cv(ev.cover), "--event-soft": cvs(ev.cover) } : {};
    return (
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", padding: 32, minHeight: "100vh", boxSizing: "border-box", background: "#e8e8e8", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ ...S.frame, ...frameVars }} data-screen-label={`${screenLabel} · ${first(me.name)}`}>
          <StatusBar onClock={() => setDemo((d) => !d)} />
          {stage === "onboarding" ? <Onboarding key={persona} me={me} say={say} onDone={finishOnboarding} onLogin={() => setStage("app")} /> : renderScreen()}
          {showTabs ? <TabBar tab={tab} onChange={go} badges={{ inbox: newCount, threads: unread }} /> : null}
          {toast ? <div style={{ position: "absolute", bottom: showTabs ? 100 : 108, left: 16, right: 16, display: "flex", justifyContent: "center", zIndex: 6 }}><DS.Toast message={toast.message} action={toast.action} onAction={toast.onAction || (() => setToast(null))} /></div> : null}
          {stage === "app" && sheet ? <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>{renderSheet()}</div> : null}
          {demo ? (
            <div style={{ position: "absolute", inset: 0, zIndex: 11 }}><DS.Sheet title="Demo" onClose={() => setDemo(false)}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={S.lbl}>Persona</span><DS.Tabs variant="segmented" value={persona} onChange={switchPersona} items={[{ id: "deniz", label: "Deniz · member" }, { id: "kaan", label: "Kaan · creator" }]} /><span style={S.sub}>Kaan created National Platform 2026 and sees its Queue. Deniz joins it with code NPL-026. Both see the same board, inboxes and threads are their own.</span></div>
              {stage === "onboarding" ? <DS.Button size="lg" full variant="secondary" icon="FastForward" onClick={() => { setStage("app"); setDemo(false); }}>Skip onboarding</DS.Button> : null}
              <DS.Button size="lg" full variant="ghost" icon="RotateCcw" onClick={() => { setEvents(EVENTS0); setPosts(POSTS0); setInbox(INBOX0); setThreads(THREADS0); setPeople(PEOPLE); setPersona("deniz"); setStage("onboarding"); setStack([]); setTab("events"); setSheet(null); setDemo(false); setCoach(false); }}>Reset everything</DS.Button>
              <span style={{ ...S.sub, textAlign: "center" }}>Tap the clock to open this panel.</span>
            </DS.Sheet></div>
          ) : null}
        </div>
        <aside style={{ width: 240, display: "flex", flexDirection: "column", gap: 10, padding: 16, background: "#fff", borderRadius: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>
          <span style={S.lbl}>Tester notes</span>
          <span>Start at the splash. Hidden demo panel: tap the clock (21:41) in the status bar to switch persona, skip onboarding or reset.</span>
          <span>Join code for National Platform 2026: <b style={{ color: "var(--text)", fontFamily: "ui-monospace, Menlo, monospace" }}>NPL-026</b>. The test script is in <a href="./Test Script.dc.html" style={{ color: "var(--text)" }}>Test Script</a>.</span>
        </aside>
      </div>
    );
  }

  function ModsSheet({ me, e, mods, people, onAdd, onRemove, onClose }) {
    const [adding, setAdding] = useState(false); const [q, setQ] = useState("");
    const ids = new Set([e.creator, ...e.mods]);
    const pool = e.joined.filter((id) => !ids.has(id)).map((id) => people[id]).filter((m) => m && has(m.name, q));
    return (
      <DS.Sheet title={adding ? "Add co-moderator" : "Moderators"} onClose={adding ? () => setAdding(false) : onClose} style={{ maxHeight: "88%" }}>
        {adding ? (<>
          <DS.Input placeholder="Search members who joined" value={q} onChange={setQ} autoFocus /><span style={S.sub}>Only people who joined {e.name} can moderate it.</span>
          <div style={{ ...S.group, borderRadius: "var(--r-md)" }}>{pool.map((m, i) => <PersonRow key={m.id} p={m} first={!i} onClick={() => { onAdd(m); setAdding(false); setQ(""); }} right={<DS.Icon name="Plus" size={18} strokeWidth={2.5} />} />)}{!pool.length ? <div style={{ padding: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>No one by that name has joined.</div> : null}</div>
        </>) : (<>
          <div style={{ display: "flex", flexDirection: "column" }}>{[{ ...people[e.creator], role: "Creator" }, ...mods.map((m) => ({ ...m, role: "Co-moderator" }))].map((m) => <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "6px 0" }}><DS.Avatar name={m.name} size="md" /><span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{m.name}{m.id === me.id ? <span style={{ color: "var(--text-3)", fontWeight: 500 }}> · you</span> : null}</span><span style={S.sub}>{m.role} · {m.section}</span></span>{m.id !== e.creator ? <DS.IconButton icon="X" label={`Remove ${first(m.name)}`} size="sm" onClick={() => onRemove(m)} /> : null}</div>)}</div>
          <span style={S.sub}>Co-moderators see the same queue and can approve or reject. They can't change board settings.</span>
          <DS.Button size="lg" full variant="secondary" icon="UserPlus" onClick={() => setAdding(true)}>Add co-moderator</DS.Button>
        </>)}
      </DS.Sheet>
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
  window.FullApp = Gate;
})();
