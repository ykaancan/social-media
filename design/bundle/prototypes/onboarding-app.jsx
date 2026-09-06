// Onboarding prototype (splash → sign up → profile → pending → approved → events) — uses window.DS and window.React.
(function () {
  const { useState, useEffect, useRef } = React;
  const DS = new Proxy({}, { get: (_, k) => (window.DS || {})[k] });

  // Sections are tags, grouped by country. No admins, no permissions.
  const SECTIONS = [
    { id: "ank", name: "ESN Ankara", country: "Türkiye", members: 212, roster: ["Ece Kara", "Deniz Aksoy", "Burak Şen", "Zeynep Acar", "Kerem Uslu"] },
    { id: "izm", name: "ESN İzmir", country: "Türkiye", members: 148, roster: ["Şeyma Kaya", "Ahmet Yıldız", "Melis Er"] },
    { id: "bog", name: "ESN Boğaziçi", country: "Türkiye", members: 176, roster: ["İrem Doğan", "Can Özkan"] },
    { id: "metu", name: "ESN METU", country: "Türkiye", members: 131, roster: ["Selin Ateş", "Ozan Demir"] },
    { id: "bol", name: "ESN Bologna", country: "Italy", members: 264, roster: ["Giulia Ferri", "Marco Riva"] },
    { id: "mil", name: "ESN Milano", country: "Italy", members: 310, roster: ["Sara Conti"] },
    { id: "sev", name: "ESN Sevilla", country: "Spain", members: 198, roster: ["Mateo Ruiz", "Lucía Ortega"] },
    { id: "brn", name: "ESN Brno", country: "Czechia", members: 122, roster: ["Lena Novak", "Tomáš Král"] },
    { id: "kol", name: "ESN Köln", country: "Germany", members: 241, roster: ["Jonas Weber", "Mia Schulz"] },
  ];
  const COUNTRIES = [...new Set(SECTIONS.map((s) => s.country))];

  const S = {
    frame: { width: 390, height: 844, borderRadius: 48, background: "var(--bg)", position: "relative", overflow: "hidden", boxShadow: "0 0 0 10px #111, 0 30px 80px rgba(0,0,0,.35)", fontFamily: "var(--font-body)", color: "var(--text)", display: "flex", flexDirection: "column" },
    status: { height: 54, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 30px 6px", font: "600 15px/1 var(--font-body)", flex: "none" },
    header: { padding: "6px 16px 12px", display: "flex", flexDirection: "column", gap: 10, flex: "none" },
    hrow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 },
    title: { font: "var(--display-lg)", letterSpacing: "var(--display-tracking)", textTransform: "uppercase", margin: 0, lineHeight: 0.95, textWrap: "balance" },
    body: { flex: 1, overflowY: "auto", padding: "4px 16px 130px", display: "flex", flexDirection: "column", gap: 16, position: "relative" },
    item: { flex: "none" },
    field: { flex: "none" },
    fieldIn: { padding: "9px 14px", minHeight: 40 },
    lbl: { font: "var(--caption-caps)", letterSpacing: "var(--caption-caps-tracking)", textTransform: "uppercase", color: "var(--text-2)" },
    sub: { font: "var(--caption)", color: "var(--text-2)" },
    p: { margin: 0, font: "var(--body)", color: "var(--text-2)", textWrap: "pretty" },
    bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "20px 16px 34px", zIndex: 5, display: "flex", flexDirection: "column", gap: 8, background: "linear-gradient(to bottom, rgba(250,250,250,0), var(--bg) 20px)" },
    row: { appearance: "none", border: 0, background: "var(--surface)", display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "0 14px", cursor: "pointer", font: "var(--body)", color: "var(--text)", textAlign: "left", width: "100%" },
  };

  function StatusBar() {
    return (
      <div style={S.status}>
        <span>21:41</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}><DS.Icon name="Signal" size={15} strokeWidth={2.5} /><DS.Icon name="Wifi" size={15} strokeWidth={2.5} /><DS.Icon name="BatteryFull" size={18} strokeWidth={2} /></span>
      </div>
    );
  }
  const Back = ({ onClick }) => <header style={S.header}><div style={S.hrow}><DS.IconButton icon="ArrowLeft" label="Back" onClick={onClick} /></div></header>;
  const AppleLogo = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.7-1-2.7-4.2zM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" /></svg>;
  const GoogleLogo = () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5H1.2v3.1C3.2 21.4 7.3 24 12 24z" /><path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.2C.4 8.2 0 10 0 12s.4 3.8 1.2 5.4l4-3.1z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.2 2.6 1.2 6.6l4 3.1c1-2.9 3.7-4.9 6.8-4.9z" /></svg>;

  // Wall header preview: the same block the user's public wall will show.
  function WallHeader({ name, section, bio, hasPhoto, onSection }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {hasPhoto || name ? <DS.Avatar name={name || "?"} size="xl" /> : <span style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--surface-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}><DS.Icon name="User" size={26} /></span>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
            <span style={{ ...S.title, font: "var(--display-md)", overflowWrap: "anywhere", color: name ? "var(--text)" : "var(--text-3)" }}>{name || "Your name"}</span>
            {section ? <DS.Chip size="sm" icon="MapPin" tone="outline" onClick={onSection}>{section.name} · {section.country}</DS.Chip> : <span style={S.sub}>Section · Country</span>}
          </div>
        </div>
        <p style={{ margin: 0, font: "var(--body)", color: bio ? "var(--text)" : "var(--text-3)" }}>{bio || "One line about you"}</p>
      </div>
    );
  }

  function SectionSheet({ value, onPick, onClose }) {
    const [q, setQ] = useState("");
    const norm = (s) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");
    const groups = COUNTRIES.map((c) => ({ c, items: SECTIONS.filter((s) => s.country === c && (norm(s.name).includes(norm(q)) || norm(c).includes(norm(q)))) })).filter((g) => g.items.length);
    return (
      <DS.Sheet title="Your section" onClose={onClose} style={{ maxHeight: "90%" }}>
        <DS.Input placeholder="Search sections or countries" value={q} onChange={setQ} autoFocus />
        <span style={S.sub}>Sections are tags, not admins. Yours only shows where you're from.</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g) => (
            <div key={g.c} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ ...S.lbl, padding: "0 2px" }}>{g.c}</span>
              <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                {g.items.map((s, i) => (
                  <button key={s.id} type="button" onClick={() => onPick(s)} style={{ ...S.row, borderTop: i ? "1px solid var(--border)" : 0, background: value && value.id === s.id ? "var(--surface-muted)" : "var(--surface)" }}>
                    <span style={{ flex: 1 }}>{s.name}</span><span style={S.sub}>{s.members}</span>{value && value.id === s.id ? <DS.Icon name="Check" size={18} strokeWidth={2.5} /> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!groups.length ? <span style={{ ...S.sub, padding: 8 }}>No section by that name. Pick the closest one; you can change it in Settings.</span> : null}
        </div>
      </DS.Sheet>
    );
  }

  function Notification({ onTap }) {
    return (
      <button type="button" onClick={onTap} style={{ position: "absolute", top: 58, left: 10, right: 10, zIndex: 8, appearance: "none", border: 0, textAlign: "left", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 22, background: "rgba(255,255,255,.92)", backdropFilter: "blur(20px)", boxShadow: "0 8px 30px rgba(0,0,0,.18)", fontFamily: "var(--font-body)", color: "var(--text)", animation: "post-in var(--dur-slow) var(--ease-out) both" }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ink-900)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "var(--display-sm)", fontSize: 13, letterSpacing: 0, flex: "none" }}>[B]</span>
        <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ font: "var(--body-sm-strong)" }}>You're approved</span><span style={{ ...S.sub, color: "var(--text-3)" }}>now</span></span>
          <span style={{ font: "var(--body-sm)", color: "var(--text-2)" }}>Welcome in. Join your first event with a code or QR.</span>
        </span>
      </button>
    );
  }

  function App() {
    const [screen, setScreen] = useState("splash"); // splash | signup | login | profile | pending | events | me | section
    const [acct, setAcct] = useState({ email: "", pw: "", phone: "" });
    const [prof, setProf] = useState({ name: "", section: null, bio: "", hasPhoto: false });
    const [picking, setPicking] = useState(false);
    const [notif, setNotif] = useState(false);
    const [coach, setCoach] = useState(false);
    const [sectionView, setSectionView] = useState(null);
    const [back, setBack] = useState("events");
    const [toast, setToast] = useState(null);
    const timers = useRef([]);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const say = (m) => { setToast(m); later(() => setToast(null), 2600); };

    // Demo: the admin approves ~4 s after the profile is sent. No timeline is promised in the UI.
    useEffect(() => { if (screen === "pending") { const id = setTimeout(() => setNotif(true), 4000); return () => clearTimeout(id); } }, [screen]);
    const approve = () => { setNotif(false); setCoach(true); setScreen("events"); };
    const openSection = (s, from) => { setSectionView(s); setBack(from); setScreen("section"); };
    const emailOk = /.+@.+\..+/.test(acct.email), pwOk = acct.pw.length >= 8;
    const labels = { splash: "Splash", signup: "Sign up", login: "Log in", profile: "Profile setup", pending: "Pending approval", events: "Events", me: "My wall", section: "Section" };

    return (
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", padding: 32, minHeight: "100vh", boxSizing: "border-box", background: "#e8e8e8", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={S.frame} data-screen-label={labels[screen]}>
          <StatusBar />

          {screen === "splash" ? (
            <>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28, padding: "0 24px 80px" }}>
                <span style={{ font: "var(--display-xl)", textTransform: "uppercase", letterSpacing: "var(--display-tracking)" }}>[BRAND]</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <h1 style={{ ...S.title, fontSize: 40 }}>Say it. Keep your name out of it.</h1>
                  <p style={{ ...S.p, fontSize: 17 }}>Anonymous notes for exchange students, at the events you're actually at.</p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>{["magenta", "coral", "tangerine", "amber", "lime", "mint", "azure", "violet"].map((c) => <span key={c} style={{ width: 22, height: 6, borderRadius: 3, background: `var(--cover-${c})` }} />)}</div>
              </div>
              <div style={S.bottom}>
                <DS.Button size="lg" full onClick={() => setScreen("signup")}>Sign up</DS.Button>
                <DS.Button size="lg" full variant="ghost" onClick={() => setScreen("login")}>Log in</DS.Button>
              </div>
            </>
          ) : null}

          {screen === "signup" || screen === "login" ? (
            <>
              <Back onClick={() => setScreen("splash")} />
              <div style={S.body}>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", paddingTop: 8 }}>
                  <div style={{ display: "flex", gap: 5 }}>{["magenta", "coral", "tangerine", "amber", "lime", "mint", "azure", "violet"].map((c) => <span key={c} style={{ width: 14, height: 6, borderRadius: 3, background: `var(--cover-${c})` }} />)}</div>
                  <h1 style={S.title}>{screen === "signup" ? "Sign up" : "Log in"}</h1>
                  <p style={S.p}>{screen === "signup" ? "Two fields and you're nearly in." : "Good to see you again."}</p>
                </div>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}>
                  <DS.Button size="lg" full variant="secondary" onClick={() => say("Apple sign-in placeholder")}><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><AppleLogo />Continue with Apple</span></DS.Button>
                  <DS.Button size="lg" full variant="secondary" onClick={() => say("Google sign-in placeholder")}><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><GoogleLogo />Continue with Google</span></DS.Button>
                </div>
                <div style={{ ...S.item, display: "flex", alignItems: "center", gap: 12, color: "var(--text-3)", font: "var(--caption)" }}><span style={{ flex: 1, height: 1, background: "var(--border)" }} />or the classic way<span style={{ flex: 1, height: 1, background: "var(--border)" }} /></div>
                <DS.Input style={S.field} inputStyle={S.fieldIn} label="Email" type="email" value={acct.email} onChange={(v) => setAcct({ ...acct, email: v })} placeholder="the.real.you@uni.edu" />
                <DS.Input style={S.field} inputStyle={S.fieldIn} label="Password" type="password" value={acct.pw} onChange={(v) => setAcct({ ...acct, pw: v })} placeholder={screen === "signup" ? "Something only you'd guess" : "Your password"} hint={screen === "signup" && acct.pw && !pwOk ? "8 characters minimum." : undefined} />
                {screen === "signup" ? <DS.Input style={S.field} inputStyle={S.fieldIn} label="Phone" type="tel" value={acct.phone} onChange={(v) => setAcct({ ...acct, phone: v })} placeholder="+90 …" hint="Optional. For the day you forget the one above." /> : null}
                {screen === "login" ? <DS.Button size="sm" variant="ghost" onClick={() => say("Reset link sent, if the address exists")} style={{ alignSelf: "flex-start" }}>Forgot password</DS.Button> : null}
              </div>
              <div style={S.bottom}>
                <DS.Button size="md" full icon="ArrowRight" disabled={!emailOk || !pwOk} onClick={() => setScreen(screen === "signup" ? "profile" : "events")}>{screen === "signup" ? "Continue" : "Log in"}</DS.Button>
                <DS.Button size="md" full variant="ghost" onClick={() => setScreen(screen === "signup" ? "login" : "signup")}>{screen === "signup" ? "Already in? Log in" : "First time here? Sign up"}</DS.Button>
              </div>
            </>
          ) : null}

          {screen === "profile" ? (
            <>
              <Back onClick={() => setScreen("signup")} />
              <div style={S.body}>
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
                  <button type="button" onClick={() => setPicking(true)} style={{ ...S.row, border: "1.5px solid var(--border-strong)", borderRadius: "var(--r-input)", minHeight: 48, color: prof.section ? "var(--text)" : "var(--text-3)" }}>
                    <DS.Icon name="MapPin" size={18} style={{ color: "var(--text-2)" }} /><span style={{ flex: 1 }}>{prof.section ? prof.section.name : "Pick your section"}</span><DS.Icon name="ChevronDown" size={18} style={{ color: "var(--text-3)" }} />
                  </button>
                  <span style={S.sub}>A tag, not a gatekeeper. Sections have no admins.</span>
                </div>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ font: "var(--body-sm-strong)" }}>Country</span>
                  <div style={{ ...S.row, cursor: "default", background: "var(--surface-muted)", borderRadius: "var(--r-input)", minHeight: 48, color: prof.section ? "var(--text)" : "var(--text-3)" }}><DS.Icon name="Flag" size={18} style={{ color: "var(--text-2)" }} /><span style={{ flex: 1 }}>{prof.section ? prof.section.country : "Filled from your section"}</span>{prof.section ? <DS.Icon name="Lock" size={16} style={{ color: "var(--text-3)" }} /> : null}</div>
                </div>
                <DS.Input style={S.item} label="One-line bio" value={prof.bio} onChange={(v) => setProf({ ...prof, bio: v })} placeholder="Where you're from, what you're into" maxLength={80} />
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={S.lbl}>Your wall header</span>
                  <WallHeader name={prof.name.trim()} section={prof.section} bio={prof.bio.trim()} hasPhoto={prof.hasPhoto} onSection={() => prof.section && openSection(prof.section, "profile")} />
                </div>
              </div>
              <div style={S.bottom}><DS.Button size="lg" full icon="Send" disabled={!prof.name.trim() || !prof.section} onClick={() => setScreen("pending")}>Send for approval</DS.Button></div>
              {picking ? <SectionSheet value={prof.section} onPick={(s) => { setProf({ ...prof, section: s }); setPicking(false); }} onClose={() => setPicking(false)} /> : null}
            </>
          ) : null}

          {screen === "pending" ? (
            <>
              <header style={S.header}><div style={S.hrow}><span style={{ font: "var(--display-sm)", textTransform: "uppercase", letterSpacing: "var(--display-tracking)" }}>[BRAND]</span><DS.Button size="sm" variant="ghost" onClick={() => setScreen("splash")}>Log out</DS.Button></div></header>
              <div style={S.body}>
                <DS.PendingState style={S.item} title="You're in the queue" subtitle="An admin checks every profile by hand, so everyone here is real."
                  steps={[{ label: "Profile sent", done: true, description: `${prof.name || "You"} · ${prof.section ? prof.section.name : ""}` }, { label: "Admin review", current: true, description: "A person looks at your name and photo. No bots, no ghosts." }, { label: "You're in", description: "We send a notification. Then you can join events." }]}
                  note="We'll let you know. Nothing to do until then. You can close the app." />
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}>
                  <span style={S.lbl}>Your wall header</span>
                  <WallHeader name={prof.name.trim()} section={prof.section} bio={prof.bio.trim()} hasPhoto={prof.hasPhoto} onSection={() => prof.section && openSection(prof.section, "pending")} />
                </div>
              </div>
              {notif ? <Notification onTap={approve} /> : null}
            </>
          ) : null}

          {screen === "events" ? (
            <>
              <header style={S.header}><div style={S.hrow}><h1 style={S.title}>Events</h1><button type="button" onClick={() => setScreen("me")} style={{ appearance: "none", border: 0, background: "none", padding: 0, cursor: "pointer" }}><DS.Avatar name={prof.name || "Deniz Aksoy"} size="sm" /></button></div></header>
              <div style={S.body}>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "88px 24px 0", textAlign: "center" }}>
                  <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--surface-muted)", color: "var(--text-3)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><DS.Icon name="CalendarDays" size={24} /></span>
                  <p style={{ ...S.p, maxWidth: 250, textWrap: "balance" }}>Nothing here yet. Events you join or create show up in this list.</p>
                </div>
              </div>
              {coach ? (
                <div style={{ position: "absolute", left: 16, right: 16, bottom: 158, zIndex: 6, display: "flex", flexDirection: "column", alignItems: "flex-start", animation: "post-in var(--dur-slow) var(--ease-out) both" }}>
                  <div style={{ background: "var(--ink-900)", color: "#fff", borderRadius: "var(--r-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, width: "100%", boxSizing: "border-box" }}>
                    <span style={{ font: "var(--body-strong)" }}>Join an event to get started</span>
                    <span style={{ font: "var(--body-sm)", color: "var(--ink-300)" }}>Every event has a 6-character code and a QR at the door. Ask the organiser.</span>
                    <DS.Button size="sm" variant="secondary" onClick={() => setCoach(false)} style={{ alignSelf: "flex-end" }}>Got it</DS.Button>
                  </div>
                  <span aria-hidden="true" style={{ width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "10px solid var(--ink-900)", marginLeft: 60 }} />
                </div>
              ) : null}
              <div style={{ ...S.bottom, flexDirection: "row" }}>
                <DS.Button size="lg" icon="LogIn" onClick={() => { setCoach(false); say("Join flow lives in the Events prototype"); }} style={{ flex: 1 }}>Join an event</DS.Button>
                <DS.Button size="lg" variant="secondary" icon="Plus" onClick={() => { setCoach(false); say("Create flow lives in the Events prototype"); }}>Create</DS.Button>
              </div>
            </>
          ) : null}

          {screen === "me" ? (
            <>
              <Back onClick={() => setScreen("events")} />
              <div style={S.body}>
                <span style={{ ...S.lbl, ...S.item }}>My wall</span>
                <WallHeader name={prof.name.trim() || "Deniz Aksoy"} section={prof.section || SECTIONS[0]} bio={prof.bio.trim() || "Board member at ESN Ankara. Will fight you over the aux cable."} hasPhoto onSection={() => openSection(prof.section || SECTIONS[0], "me")} />
                <p style={{ ...S.p, ...S.item, textAlign: "center", padding: "32px 24px" }}>Approved messages will show here.</p>
              </div>
            </>
          ) : null}

          {screen === "section" && sectionView ? (
            <>
              <Back onClick={() => setScreen(back)} />
              <div style={S.body}>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={S.lbl}>Section</span>
                  <h1 style={S.title}>{sectionView.name}</h1>
                  <div style={{ display: "flex", gap: 12, font: "var(--body-sm)", color: "var(--text-2)", flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><DS.Icon name="Flag" size={14} strokeWidth={2.25} />{sectionView.country}</span>
                    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><DS.Icon name="Users" size={14} strokeWidth={2.25} />{sectionView.members} members</span>
                  </div>
                </div>
                <div style={{ ...S.item, display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: "var(--r-card)", background: "var(--surface-muted)", font: "var(--body-sm)", color: "var(--text-2)" }}><DS.Icon name="Tag" size={16} /><span>A section is a tag people put on their profile. It has no admins and no board of its own.</span></div>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", overflow: "hidden" }}>
                  {[...(prof.section && prof.section.id === sectionView.id && prof.name ? [prof.name] : []), ...sectionView.roster].map((n, i) => (
                    <div key={n} style={{ ...S.row, cursor: "default", borderTop: i ? "1px solid var(--border)" : 0, minHeight: 56 }}>
                      <DS.Avatar name={n} size="md" /><span style={{ flex: 1, font: "var(--body-sm-strong)" }}>{n}{n === prof.name ? <span style={{ color: "var(--text-3)", fontWeight: 500 }}> · you</span> : null}</span>
                    </div>
                  ))}
                  <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", ...S.sub, textAlign: "center" }}>and {sectionView.members - sectionView.roster.length} more</div>
                </div>
              </div>
            </>
          ) : null}

          {toast ? <div style={{ position: "absolute", bottom: 150, left: 16, right: 16, display: "flex", justifyContent: "center", zIndex: 7 }}><DS.Toast message={toast} onAction={() => setToast(null)} /></div> : null}
        </div>

        <aside style={{ width: 240, display: "flex", flexDirection: "column", gap: 14, padding: 16, background: "#fff", borderRadius: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>
          <span style={S.lbl}>Demo controls</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Flow</span>
            <span>Splash → Sign up (any email, 8+ char password) → Profile (name + section required; wall header previews live) → Pending. The “You're approved” push arrives after ~4 s; tap it → Events with the one-time coach mark.</span>
            <span>Section page: tap the section chip on any wall header.</span>
          </div>
          {screen === "pending" ? <DS.Button size="sm" variant="secondary" icon="BellRing" onClick={() => setNotif(true)}>Approve now</DS.Button> : null}
          <DS.Button size="sm" variant="ghost" icon="RotateCcw" onClick={() => { setScreen("splash"); setAcct({ email: "", pw: "", phone: "" }); setProf({ name: "", section: null, bio: "", hasPhoto: false }); setNotif(false); setCoach(false); }}>Reset</DS.Button>
        </aside>
      </div>
    );
  }

  function Gate() {
    const [ready, setReady] = useState(!!(window.DS && window.DS.PendingState));
    useEffect(() => {
      if (ready) return;
      const on = () => setReady(true);
      window.addEventListener("ds-ready", on);
      const iv = setInterval(() => { if (window.DS && window.DS.PendingState) { setReady(true); clearInterval(iv); } }, 100);
      return () => { window.removeEventListener("ds-ready", on); clearInterval(iv); };
    }, [ready]);
    if (!ready) return <div style={{ padding: 40, font: "500 14px/1.4 Figtree, sans-serif", color: "#6b6b6b" }}>Loading components…</div>;
    return <App />;
  }
  window.OnboardingApp = Gate;
})();
