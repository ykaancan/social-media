import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Button } from "../core/Button.jsx";
import { AnonymityBadge } from "../anonymity/AnonymityBadge.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.c-lock{background:var(--locked-bg);background-image:var(--locked-hatch);border:1.5px dashed var(--locked-border);border-radius:var(--r-card);padding:var(--card-pad);display:flex;flex-direction:column;gap:12px;font-family:var(--font-body);position:relative;overflow:hidden;flex:none}
.c-lock__hd{display:flex;align-items:center;justify-content:space-between;gap:12px}
.c-lock__time{font:var(--caption);color:var(--text-3);font-variant-numeric:tabular-nums;white-space:nowrap}
.c-lock__lines{display:flex;flex-direction:column;gap:10px;padding:6px 0 4px;filter:blur(var(--locked-blur));user-select:none;pointer-events:none}
.c-lock__line{height:11px;border-radius:6px;background:var(--ink-400);opacity:.42}
.c-lock__meta{display:flex;align-items:center;gap:8px;font:var(--body-sm);color:var(--text-2);flex-wrap:wrap}
.c-lock__meta b{font-weight:600;color:var(--text)}
.c-lock__badge{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;background:var(--ink-900);color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px var(--locked-bg)}
.c-lock__hd .c-lock__time{margin-right:40px}
.c-lock__text{font:var(--post);color:var(--text);margin:0;overflow-wrap:anywhere;text-wrap:pretty}
.c-lock--open .c-lock__badge{background:var(--ink-700)}
`;

// Real metadata, hidden content. Line lengths are derived from the true character count.
// `unlocked` (stage 1 default state in the app): same hatched shell, LockOpen badge, readable `text`, no Unlock button.
export function LockedCard({ level = "anonymous", hints, length, text, time, source, unlocked = false, onUnlock, children, labels = {}, style }) {
  ensureStyle("c-lock-css", CSS);
  const L = { unlock: "Unlock", chars: "characters", fromSomeoneAt: "from someone at", locked: "Locked", ...labels };
  length = length != null ? length : text ? text.length : 120;
  const perLine = 42;
  const n = Math.max(1, Math.min(6, Math.ceil(length / perLine)));
  const widths = Array.from({ length: n }, (_, i) => (i < n - 1 ? 100 : Math.max(18, Math.round(((length % perLine) || perLine) / perLine * 100))));
  return (
    <article className={`c-lock${unlocked ? " c-lock--open" : ""}`} aria-label={unlocked ? undefined : L.locked} style={style}>
      <span className="c-lock__badge"><Icon name={unlocked ? "LockOpen" : "Lock"} size={16} strokeWidth={2.5} /></span>
      <header className="c-lock__hd">
        <AnonymityBadge level={level} hints={hints} labels={labels} showLevel />
        <span className="c-lock__time">{time}</span>
      </header>
      {unlocked && text ? <p className="c-lock__text">{text}</p> : <div className="c-lock__lines" aria-hidden="true">{widths.map((w, i) => <span key={i} className="c-lock__line" style={{ width: `${w}%` }} />)}</div>}
      <div className="c-lock__meta">
        <span><b>{length}</b> {L.chars}</span>
        {source ? <><span aria-hidden="true">·</span><span>{L.fromSomeoneAt} <b>{source}</b></span></> : null}
      </div>
      {children}
      {!unlocked ? <Button variant="secondary" icon="LockOpen" full onClick={onUnlock}>{L.unlock}</Button> : null}
    </article>
  );
}
