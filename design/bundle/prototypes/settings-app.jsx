// Settings & safety prototype — uses window.DS and window.React. Every visible string comes from STR[locale].
(function () {
  const { useState, useEffect, useRef } = React;
  const DS = new Proxy({}, { get: (_, k) => (window.DS || {})[k] });

  const STR = {
    en: {
      settings: "Settings", privacy: "Privacy", whoCanWrite: "Who can write to me",
      anyone: "Anyone", anyoneDesc: "Anyone at an event you joined can write to your inbox, anonymously or not.",
      namedOnly: "Named only", namedOnlyDesc: "Only people who show their name can write. Anonymous and hint messages bounce.",
      nobody: "Nobody", nobodyDesc: "Your inbox closes. Board posts and threads you already have still work.",
      whoNote: "Applies from now on. Messages already in your inbox stay.",
      blocked: "Blocked people", blockedEmpty: "Nobody blocked. Good sign.", unblock: "Unblock", unblocked: "{name} unblocked", blockedNote: "Blocked people can't write to you or reply in your threads. They aren't told.",
      mutedWords: "Muted words", addWord: "Add a word", add: "Add", mutedEmpty: "No muted words yet.", mutedNote: "Messages with these words skip your inbox and land in Private. Case doesn't matter.",
      notifications: "Notifications", notifInbox: "Inbox", notifInboxDesc: "Someone writes to you", notifThreads: "Threads", notifThreadsDesc: "A reply in a private thread", notifBoard: "Board mentions", notifBoardDesc: "A moderator releases your post, or people react to it", notifEvents: "Event reminders", notifEventsDesc: "An event you joined is about to start",
      language: "Language", languageNote: "Changes every label in the app. What people wrote stays as written.",
      account: "Account", editProfile: "Edit profile", name: "Name", bio: "One-line bio", save: "Save", saved: "Saved",
      changeSection: "Change section", now: "Now", changeSectionNote: "Changing your section sends your profile back to the admin queue. You can read everything while you wait, but you can't post or write to anyone until you're approved again.", sectionConfirmTitle: "Change to {name}?", sectionConfirmBody: "You go back to the queue. Reading works, posting waits for approval.", change: "Change", changed: "Section changed. You're back in the queue.", pickSection: "Pick a section",
      logOut: "Log out", logOutBody: "Your inbox, wall and threads stay. Log back in any time.", loggedOut: "Logged out",
      deleteAccount: "Delete account", delete1Title: "Delete your account?", delete1Body: "This deletes, it doesn't deactivate. Your profile, wall, inbox, threads and every post you made are removed from our servers. Messages you sent to others are removed from their inboxes and walls too.", delete1Note: "No undo, no grace period, no “restore” email.", continue: "Continue",
      delete2Title: "Last check", delete2Body: "Type {word} to confirm. Everything goes now.", deleteWord: "DELETE", deleteEverything: "Delete everything", deleted: "Deleted. Nothing of yours is left.",
      legal: "Legal", privacyPolicy: "Privacy policy", terms: "Terms of use", opensBrowser: "Opens in your browser", cancel: "Cancel", you: "you", members: "{n} members",
      version: "Version 0.1 · stage 1",
    },
    tr: {
      settings: "Ayarlar", privacy: "Gizlilik", whoCanWrite: "Bana kim yazabilir",
      anyone: "Herkes", anyoneDesc: "Katıldığın bir etkinlikteki herkes, anonim ya da isimli, gelen kutuna yazabilir.",
      namedOnly: "Sadece isimliler", namedOnlyDesc: "Sadece ismini gösterenler yazabilir. Anonim ve ipuçlu mesajlar geri döner.",
      nobody: "Kimse", nobodyDesc: "Gelen kutun kapanır. Pano gönderileri ve mevcut sohbetlerin çalışmaya devam eder.",
      whoNote: "Şu andan itibaren geçerli. Gelen kutundaki mesajlar kalır.",
      blocked: "Engellenenler", blockedEmpty: "Kimseyi engellememişsin. İyiye işaret.", unblock: "Engeli kaldır", unblocked: "{name} engeli kaldırıldı", blockedNote: "Engellediğin kişiler sana yazamaz, sohbetlerinde yanıt veremez. Haberleri olmaz.",
      mutedWords: "Sessize alınan kelimeler", addWord: "Kelime ekle", add: "Ekle", mutedEmpty: "Henüz sessize alınan kelime yok.", mutedNote: "Bu kelimeleri içeren mesajlar gelen kutunu atlar, Gizli'ye düşer. Büyük-küçük harf fark etmez.",
      notifications: "Bildirimler", notifInbox: "Gelen kutusu", notifInboxDesc: "Biri sana yazınca", notifThreads: "Sohbetler", notifThreadsDesc: "Özel sohbette yanıt gelince", notifBoard: "Panoda bahsedilme", notifBoardDesc: "Moderatör gönderini yayınlayınca ya da tepki gelince", notifEvents: "Etkinlik hatırlatmaları", notifEventsDesc: "Katıldığın etkinlik başlamak üzereyken",
      language: "Dil", languageNote: "Uygulamadaki her etiketi değiştirir. İnsanların yazdıkları olduğu gibi kalır.",
      account: "Hesap", editProfile: "Profili düzenle", name: "İsim", bio: "Tek satırlık bio", save: "Kaydet", saved: "Kaydedildi",
      changeSection: "Section değiştir", now: "Şu an", changeSectionNote: "Section'ını değiştirince profilin admin sırasına geri döner. Beklerken her şeyi okuyabilirsin ama yeniden onaylanana kadar gönderi paylaşamaz, kimseye yazamazsın.", sectionConfirmTitle: "{name} olsun mu?", sectionConfirmBody: "Sıraya geri dönersin. Okumak serbest, paylaşmak onayı bekler.", change: "Değiştir", changed: "Section değişti. Yeniden sıradasın.", pickSection: "Section seç",
      logOut: "Çıkış yap", logOutBody: "Gelen kutun, duvarın ve sohbetlerin kalır. İstediğin zaman geri gir.", loggedOut: "Çıkış yapıldı",
      deleteAccount: "Hesabı sil", delete1Title: "Hesabın silinsin mi?", delete1Body: "Bu silme, dondurma değil. Profilin, duvarın, gelen kutun, sohbetlerin ve paylaştığın her gönderi sunucularımızdan kaldırılır. Başkalarına gönderdiğin mesajlar onların gelen kutusundan ve duvarından da silinir.", delete1Note: "Geri alma yok, bekleme süresi yok, “geri getir” e-postası yok.", continue: "Devam",
      delete2Title: "Son kontrol", delete2Body: "Onaylamak için {word} yaz. Her şey şimdi gider.", deleteWord: "SİL", deleteEverything: "Her şeyi sil", deleted: "Silindi. Senden geriye hiçbir şey kalmadı.",
      legal: "Yasal", privacyPolicy: "Gizlilik politikası", terms: "Kullanım koşulları", opensBrowser: "Tarayıcında açılır", cancel: "Vazgeç", you: "sen", members: "{n} üye",
      version: "Sürüm 0.1 · aşama 1",
    },
  };
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  const SECTIONS = [
    { id: "ank", name: "ESN Ankara", country: "Türkiye", members: 212 }, { id: "izm", name: "ESN İzmir", country: "Türkiye", members: 148 }, { id: "bog", name: "ESN Boğaziçi", country: "Türkiye", members: 176 },
    { id: "bol", name: "ESN Bologna", country: "Italy", members: 264 }, { id: "sev", name: "ESN Sevilla", country: "Spain", members: 198 }, { id: "brn", name: "ESN Brno", country: "Czechia", members: 122 }, { id: "kol", name: "ESN Köln", country: "Germany", members: 241 },
  ];
  const BLOCKED = [{ id: "b1", name: "Burak Şen", section: "ESN Ankara" }, { id: "b2", name: "Marco Riva", section: "ESN Bologna" }];

  const S = {
    frame: { width: 390, height: 844, borderRadius: 48, background: "var(--bg)", position: "relative", overflow: "hidden", boxShadow: "0 0 0 10px #111, 0 30px 80px rgba(0,0,0,.35)", fontFamily: "var(--font-body)", color: "var(--text)", display: "flex", flexDirection: "column" },
    status: { height: 54, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 30px 6px", font: "600 15px/1 var(--font-body)", flex: "none" },
    header: { padding: "6px 16px 12px", display: "flex", flexDirection: "column", gap: 10, flex: "none" },
    hrow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 },
    title: { font: "var(--display-lg)", letterSpacing: "var(--display-tracking)", textTransform: "uppercase", margin: 0, lineHeight: 0.95, textWrap: "balance" },
    body: { flex: 1, overflowY: "auto", padding: "4px 16px 120px", display: "flex", flexDirection: "column", gap: 16, position: "relative" },
    item: { flex: "none" },
    lbl: { font: "var(--caption-caps)", letterSpacing: "var(--caption-caps-tracking)", textTransform: "uppercase", color: "var(--text-2)", padding: "0 2px" },
    sub: { font: "var(--caption)", color: "var(--text-2)" },
    p: { margin: 0, font: "var(--body)", color: "var(--text-2)", textWrap: "pretty" },
    group: { display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", overflow: "hidden" },
    row: { appearance: "none", border: 0, background: "var(--surface)", display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "6px 14px", cursor: "pointer", font: "var(--body)", color: "var(--text)", textAlign: "left", width: "100%" },
    note: { display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: "var(--r-md)", background: "var(--surface-muted)", font: "var(--body-sm)", color: "var(--text-2)" },
    bottom: { position: "absolute", left: 16, right: 16, bottom: 34, zIndex: 5, display: "flex", flexDirection: "column", gap: 8 },
  };
  const up = (s, loc) => s.toLocaleUpperCase(loc);

  function StatusBar() {
    return (
      <div style={S.status}>
        <span>21:41</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}><DS.Icon name="Signal" size={15} strokeWidth={2.5} /><DS.Icon name="Wifi" size={15} strokeWidth={2.5} /><DS.Icon name="BatteryFull" size={18} strokeWidth={2} /></span>
      </div>
    );
  }
  const Row = ({ icon, label, value, onClick, danger, first, external, children }) => (
    <button type="button" onClick={onClick} style={{ ...S.row, borderTop: first ? 0 : "1px solid var(--border)", color: danger ? "var(--danger)" : "var(--text)", cursor: onClick ? "pointer" : "default" }}>
      {icon ? <DS.Icon name={icon} size={20} style={{ color: danger ? "var(--danger)" : "var(--text-2)", flex: "none" }} /> : null}
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>{label}{children}</span>
      {value ? <span style={{ ...S.sub, whiteSpace: "nowrap" }}>{value}</span> : null}
      {onClick ? <DS.Icon name={external ? "ExternalLink" : "ChevronRight"} size={18} style={{ color: "var(--text-3)", flex: "none" }} /> : null}
    </button>
  );
  const Note = ({ icon = "Info", children }) => <div style={{ ...S.note, ...S.item }}><DS.Icon name={icon} size={16} style={{ flex: "none", marginTop: 2 }} /><span>{children}</span></div>;
  const Screen = ({ title, onBack, children, loc }) => (
    <>
      <header style={S.header}><div style={S.hrow}><DS.IconButton icon="ArrowLeft" label="Back" onClick={onBack} /></div><h1 style={S.title} lang={loc}>{title}</h1></header>
      <div style={S.body}>{children}</div>
    </>
  );

  function App() {
    const [loc, setLoc] = useState("en");
    const t = STR[loc];
    const [screen, setScreen] = useState("root");
    const [who, setWho] = useState("anyone");
    const [blocked, setBlocked] = useState(BLOCKED);
    const [muted, setMuted] = useState(["crush", "ugly"]);
    const [word, setWord] = useState("");
    const [notif, setNotif] = useState({ inbox: true, threads: true, board: true, events: true });
    const [prof, setProf] = useState({ name: "Deniz Aksoy", bio: "Board member at ESN Ankara. Will fight you over the aux cable.", section: SECTIONS[0] });
    const [pendingSection, setPendingSection] = useState(null);
    const [sheet, setSheet] = useState(null); // logout | delete1 | delete2 | section
    const [typed, setTyped] = useState("");
    const [toast, setToast] = useState(null);
    const timers = useRef([]);
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const say = (m) => { setToast(m); later(() => setToast(null), 2600); };
    const back = () => setScreen("root");
    const whoLabel = { anyone: t.anyone, namedOnly: t.namedOnly, nobody: t.nobody }[who];
    const addWord = () => { const w = word.trim().toLocaleLowerCase(loc); if (!w || muted.includes(w)) { setWord(""); return; } setMuted((m) => [...m, w]); setWord(""); };
    const labels = { root: t.settings, who: t.whoCanWrite, blocked: t.blocked, muted: t.mutedWords, notif: t.notifications, lang: t.language, profile: t.editProfile, section: t.changeSection };

    return (
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", padding: 32, minHeight: "100vh", boxSizing: "border-box", background: "#e8e8e8", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={S.frame} data-screen-label={`${labels[screen]} · ${loc}`} lang={loc}>
          <StatusBar />

          {screen === "root" ? (
            <>
              <header style={S.header}><div style={S.hrow}><DS.IconButton icon="ArrowLeft" label="Back" onClick={() => say(loc === "en" ? "Back to Events" : "Etkinliklere dön")} /><DS.Avatar name={prof.name} size="sm" /></div><h1 style={S.title}>{t.settings}</h1></header>
              <div style={S.body}>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={S.lbl}>{t.privacy}</span>
                  <div style={S.group}>
                    <Row first icon="MessageSquareLock" label={t.whoCanWrite} value={whoLabel} onClick={() => setScreen("who")} />
                    <Row icon="Ban" label={t.blocked} value={String(blocked.length)} onClick={() => setScreen("blocked")} />
                    <Row icon="VolumeX" label={t.mutedWords} value={String(muted.length)} onClick={() => setScreen("muted")} />
                  </div>
                </div>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={S.group}>
                    <Row first icon="Bell" label={t.notifications} value={`${Object.values(notif).filter(Boolean).length}/4`} onClick={() => setScreen("notif")} />
                    <Row icon="Languages" label={t.language} value={loc === "en" ? "English" : "Türkçe"} onClick={() => setScreen("lang")} />
                  </div>
                </div>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={S.lbl}>{t.account}</span>
                  <div style={S.group}>
                    <Row first icon="UserPen" label={t.editProfile} onClick={() => setScreen("profile")} />
                    <Row icon="MapPin" label={t.changeSection} value={prof.section.name} onClick={() => setScreen("section")} />
                    <Row icon="LogOut" label={t.logOut} onClick={() => setSheet("logout")} />
                    <Row icon="Trash2" label={t.deleteAccount} danger onClick={() => setSheet("delete1")} />
                  </div>
                </div>
                <div style={{ ...S.item, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={S.lbl}>{t.legal}</span>
                  <div style={S.group}>
                    <Row first icon="Shield" label={t.privacyPolicy} value={t.opensBrowser} external onClick={() => say(t.opensBrowser)} />
                    <Row icon="FileText" label={t.terms} value={t.opensBrowser} external onClick={() => say(t.opensBrowser)} />
                  </div>
                </div>
                <span style={{ ...S.sub, ...S.item, textAlign: "center", color: "var(--text-3)" }}>{t.version}</span>
              </div>
            </>
          ) : null}

          {screen === "who" ? (
            <Screen title={t.whoCanWrite} onBack={back} loc={loc}>
              <div style={{ ...S.group, ...S.item }}>
                {[["anyone", t.anyone, t.anyoneDesc, "Users"], ["namedOnly", t.namedOnly, t.namedOnlyDesc, "User"], ["nobody", t.nobody, t.nobodyDesc, "MessageSquareOff"]].map(([id, l, d, ic], i) => (
                  <button key={id} type="button" onClick={() => { setWho(id); }} style={{ ...S.row, borderTop: i ? "1px solid var(--border)" : 0, minHeight: 64, alignItems: "flex-start", padding: "12px 14px" }} aria-pressed={who === id}>
                    <DS.Icon name={ic} size={20} style={{ color: "var(--text-2)", flex: "none", marginTop: 2 }} />
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}><span style={{ font: who === id ? "var(--body-strong)" : "var(--body)" }}>{l}</span><span style={S.sub}>{d}</span></span>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", marginTop: 1, border: who === id ? 0 : "1.5px solid var(--border-strong)", background: who === id ? "var(--ink-900)" : "transparent", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{who === id ? <DS.Icon name="Check" size={14} strokeWidth={3} /> : null}</span>
                  </button>
                ))}
              </div>
              <Note>{t.whoNote}</Note>
            </Screen>
          ) : null}

          {screen === "blocked" ? (
            <Screen title={t.blocked} onBack={back} loc={loc}>
              {blocked.length ? (
                <div style={{ ...S.group, ...S.item }}>
                  {blocked.map((b, i) => (
                    <div key={b.id} style={{ ...S.row, cursor: "default", borderTop: i ? "1px solid var(--border)" : 0, minHeight: 60 }}>
                      <DS.Avatar name={b.name} size="md" />
                      <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "var(--body-sm-strong)" }}>{b.name}</span><span style={S.sub}>{b.section}</span></span>
                      <DS.Button size="sm" variant="secondary" onClick={() => { setBlocked((l) => l.filter((x) => x.id !== b.id)); say(fill(t.unblocked, { name: b.name.split(" ")[0] })); }}>{t.unblock}</DS.Button>
                    </div>
                  ))}
                </div>
              ) : <p style={{ ...S.p, ...S.item, textAlign: "center", padding: "32px 0" }}>{t.blockedEmpty}</p>}
              <Note icon="Ban">{t.blockedNote}</Note>
            </Screen>
          ) : null}

          {screen === "muted" ? (
            <Screen title={t.mutedWords} onBack={back} loc={loc}>
              <div style={{ ...S.item, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <DS.Input value={word} onChange={setWord} placeholder={t.addWord} style={{ flex: 1 }} maxLength={30} />
                <DS.Button icon="Plus" variant="secondary" disabled={!word.trim()} onClick={addWord}>{t.add}</DS.Button>
              </div>
              {muted.length ? (
                <div style={{ ...S.item, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {muted.map((w) => <DS.Chip key={w} icon="X" tone="outline" onClick={() => setMuted((m) => m.filter((x) => x !== w))}>{w}</DS.Chip>)}
                </div>
              ) : <p style={{ ...S.p, ...S.item, textAlign: "center", padding: "24px 0" }}>{t.mutedEmpty}</p>}
              <Note icon="VolumeX">{t.mutedNote}</Note>
            </Screen>
          ) : null}

          {screen === "notif" ? (
            <Screen title={t.notifications} onBack={back} loc={loc}>
              <div style={{ ...S.group, ...S.item, padding: "0 14px" }}>
                {[["inbox", t.notifInbox, t.notifInboxDesc], ["threads", t.notifThreads, t.notifThreadsDesc], ["board", t.notifBoard, t.notifBoardDesc], ["events", t.notifEvents, t.notifEventsDesc]].map(([k, l, d], i) => (
                  <div key={k} style={{ borderTop: i ? "1px solid var(--border)" : 0, padding: "4px 0" }}><DS.Switch checked={notif[k]} onChange={(v) => setNotif({ ...notif, [k]: v })} label={l} description={d} /></div>
                ))}
              </div>
            </Screen>
          ) : null}

          {screen === "lang" ? (
            <Screen title={t.language} onBack={back} loc={loc}>
              <div style={{ ...S.group, ...S.item }}>
                {[["en", "English", "English"], ["tr", "Türkçe", "Turkish"]].map(([id, l, d], i) => (
                  <button key={id} type="button" onClick={() => setLoc(id)} lang={id} style={{ ...S.row, borderTop: i ? "1px solid var(--border)" : 0, minHeight: 60 }} aria-pressed={loc === id}>
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ font: loc === id ? "var(--body-strong)" : "var(--body)" }}>{l}</span><span style={S.sub}>{d}</span></span>
                    {loc === id ? <DS.Icon name="Check" size={20} strokeWidth={2.5} /> : null}
                  </button>
                ))}
              </div>
              <Note icon="Languages">{t.languageNote}</Note>
            </Screen>
          ) : null}

          {screen === "profile" ? (
            <>
              <Screen title={t.editProfile} onBack={back} loc={loc}>
                <div style={{ ...S.item, display: "flex", alignItems: "center", gap: 14 }}><DS.Avatar name={prof.name} size="xl" /><DS.Button size="sm" variant="secondary" icon="Camera" onClick={() => say("…")}>{loc === "en" ? "Change photo" : "Fotoğrafı değiştir"}</DS.Button></div>
                <DS.Input style={S.item} label={t.name} value={prof.name} onChange={(v) => setProf({ ...prof, name: v })} maxLength={40} />
                <DS.Input style={S.item} label={t.bio} value={prof.bio} onChange={(v) => setProf({ ...prof, bio: v })} maxLength={80} />
                <div style={{ ...S.group, ...S.item }}><Row first icon="MapPin" label={prof.section.name} value={prof.section.country} onClick={() => setScreen("section")} /></div>
              </Screen>
              <div style={S.bottom}><DS.Button size="lg" full icon="Check" onClick={() => { say(t.saved); back(); }}>{t.save}</DS.Button></div>
            </>
          ) : null}

          {screen === "section" ? (
            <Screen title={t.changeSection} onBack={back} loc={loc}>
              <Note icon="Clock">{t.changeSectionNote}</Note>
              <span style={{ ...S.lbl, ...S.item }}>{t.pickSection}</span>
              <div style={{ ...S.group, ...S.item }}>
                {SECTIONS.map((s, i) => { const cur = s.id === prof.section.id; return (
                  <button key={s.id} type="button" disabled={cur} onClick={() => { setPendingSection(s); setSheet("section"); }} style={{ ...S.row, borderTop: i ? "1px solid var(--border)" : 0, minHeight: 56, cursor: cur ? "default" : "pointer" }}>
                    <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: cur ? "var(--body-strong)" : "var(--body)" }}>{s.name}</span><span style={S.sub}>{s.country} · {fill(t.members, { n: s.members })}</span></span>
                    {cur ? <DS.Chip size="sm">{t.now}</DS.Chip> : <DS.Icon name="ChevronRight" size={18} style={{ color: "var(--text-3)" }} />}
                  </button>
                ); })}
              </div>
            </Screen>
          ) : null}

          {toast ? <div style={{ position: "absolute", bottom: 108, left: 16, right: 16, display: "flex", justifyContent: "center", zIndex: 7 }}><DS.Toast message={toast} onAction={() => setToast(null)} /></div> : null}

          {sheet === "logout" ? (
            <DS.Sheet title={t.logOut} onClose={() => setSheet(null)}>
              <p style={S.p}>{t.logOutBody}</p>
              <DS.Button size="lg" full onClick={() => { setSheet(null); say(t.loggedOut); }}>{t.logOut}</DS.Button>
              <DS.Button size="lg" full variant="ghost" onClick={() => setSheet(null)}>{t.cancel}</DS.Button>
            </DS.Sheet>
          ) : null}
          {sheet === "section" && pendingSection ? (
            <DS.Sheet title={fill(t.sectionConfirmTitle, { name: pendingSection.name })} onClose={() => setSheet(null)}>
              <p style={S.p}>{t.sectionConfirmBody}</p>
              <DS.Button size="lg" full onClick={() => { setProf({ ...prof, section: pendingSection }); setSheet(null); say(t.changed); back(); }}>{t.change}</DS.Button>
              <DS.Button size="lg" full variant="ghost" onClick={() => setSheet(null)}>{t.cancel}</DS.Button>
            </DS.Sheet>
          ) : null}
          {sheet === "delete1" ? (
            <DS.Sheet title={t.delete1Title} onClose={() => setSheet(null)}>
              <p style={S.p}>{t.delete1Body}</p>
              <Note icon="TriangleAlert">{t.delete1Note}</Note>
              <DS.Button size="lg" full variant="danger" onClick={() => { setTyped(""); setSheet("delete2"); }}>{t.continue}</DS.Button>
              <DS.Button size="lg" full variant="ghost" onClick={() => setSheet(null)}>{t.cancel}</DS.Button>
            </DS.Sheet>
          ) : null}
          {sheet === "delete2" ? (
            <DS.Sheet title={t.delete2Title} onClose={() => setSheet(null)}>
              <p style={S.p}>{fill(t.delete2Body, { word: t.deleteWord })}</p>
              <DS.Input value={typed} onChange={setTyped} placeholder={t.deleteWord} autoFocus inputStyle={{ textTransform: "uppercase", letterSpacing: ".12em", textAlign: "center", font: "var(--display-sm)" }} />
              <DS.Button size="lg" full variant="danger" icon="Trash2" disabled={up(typed.trim(), loc) !== t.deleteWord} onClick={() => { setSheet(null); say(t.deleted); }}>{t.deleteEverything}</DS.Button>
              <DS.Button size="lg" full variant="ghost" onClick={() => setSheet(null)}>{t.cancel}</DS.Button>
            </DS.Sheet>
          ) : null}
        </div>

        <aside style={{ width: 240, display: "flex", flexDirection: "column", gap: 14, padding: 16, background: "#fff", borderRadius: 14, font: "var(--body-sm)", color: "var(--text-2)" }}>
          <span style={{ ...S.lbl, padding: 0 }}>Demo controls</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Language</span>
            <DS.Tabs variant="segmented" value={loc} onChange={setLoc} items={[{ id: "en", label: "English" }, { id: "tr", label: "Türkçe" }]} />
            <span>Same as the in-app Language screen. Every label on the visible screen switches at once; nothing user-written is translated.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--body-sm-strong)", color: "var(--text)" }}>Flow</span>
            <span>Settings → Who can write to me → pick → back (value updates in the list). Blocked: unblock rows. Muted: add / tap a chip to remove. Delete account: two steps, the second asks you to type {STR[loc].deleteWord}.</span>
          </div>
          <DS.Button size="sm" variant="ghost" icon="RotateCcw" onClick={() => { setScreen("root"); setLoc("en"); setWho("anyone"); setBlocked(BLOCKED); setMuted(["crush", "ugly"]); setNotif({ inbox: true, threads: true, board: true, events: true }); setProf({ name: "Deniz Aksoy", bio: "Board member at ESN Ankara. Will fight you over the aux cable.", section: SECTIONS[0] }); setSheet(null); }}>Reset</DS.Button>
        </aside>
      </div>
    );
  }

  function Gate() {
    const [ready, setReady] = useState(!!(window.DS && window.DS.Switch));
    useEffect(() => {
      if (ready) return;
      const on = () => setReady(true);
      window.addEventListener("ds-ready", on);
      const iv = setInterval(() => { if (window.DS && window.DS.Switch) { setReady(true); clearInterval(iv); } }, 100);
      return () => { window.removeEventListener("ds-ready", on); clearInterval(iv); };
    }, [ready]);
    if (!ready) return <div style={{ padding: 40, font: "500 14px/1.4 Figtree, sans-serif", color: "#6b6b6b" }}>Loading components…</div>;
    return <App />;
  }
  window.SettingsApp = Gate;
})();
