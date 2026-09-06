import React from "react";
import { Icon } from "../core/Icon.jsx";
import { AnonymityBadge } from "../anonymity/AnonymityBadge.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.c-q{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);padding:14px 16px 12px;display:flex;flex-direction:column;gap:10px;font-family:var(--font-body);animation:post-in var(--dur-slow) var(--ease-out) both;transition:opacity var(--dur-base),transform var(--dur-slow) var(--ease-out)}
.c-q--approved{transform:translateX(24px);opacity:0}
.c-q--rejected{transform:translateX(-24px);opacity:0}
.c-q__hd{display:flex;align-items:center;gap:10px}
.c-q__idx{font:var(--display-sm);color:var(--text-3);font-variant-numeric:tabular-nums;min-width:28px}
.c-q__time{margin-left:auto;font:var(--caption);color:var(--text-3);font-variant-numeric:tabular-nums}
.c-q__body{font:var(--post);margin:0;overflow-wrap:anywhere;text-wrap:pretty}
.c-q__acts{display:grid;grid-template-columns:56px 1fr;gap:8px;margin-top:2px}
.c-q__btn{appearance:none;border:0;height:52px;border-radius:var(--r-pill);display:inline-flex;align-items:center;justify-content:center;gap:8px;font:var(--body-strong);font-family:var(--font-body);cursor:pointer;transition:transform var(--dur-fast) var(--ease-out),background var(--dur-fast)}
.c-q__btn:active{transform:scale(var(--press-scale))}
.c-q__btn:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.c-q__reject{background:var(--danger-soft);color:var(--danger)}
.c-q__approve{background:var(--live);color:var(--ink-950)}
.c-q__approve:hover{filter:brightness(1.04)}
.c-q--selectable{cursor:pointer}
.c-q--selected{box-shadow:inset 0 0 0 2px var(--ink-900);border-color:transparent}
.c-q__check{appearance:none;border:1.5px solid var(--border-strong);background:var(--surface);width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;flex:none;cursor:pointer;padding:0;transition:background var(--dur-fast),border-color var(--dur-fast)}
.c-q--selected .c-q__check{background:var(--ink-900);border-color:var(--ink-900)}
`;

// One-thumb moderation: big green approve on the right (thumb side), small reject on the left.
// `selectable` swaps the action row for a check circle; the whole card toggles `onSelect`.
export function QueueCard({ index, text, sender = { level: "anonymous" }, time, state = "pending", selectable = false, selected = false, onSelect, onApprove, onReject, labels = {}, style }) {
  ensureStyle("c-q-css", CSS);
  const L = { approve: "Approve", reject: "Reject", select: "Select", ...labels };
  return (
    <article className={`c-q${state !== "pending" ? ` c-q--${state}` : ""}${selectable ? " c-q--selectable" : ""}${selected ? " c-q--selected" : ""}`} style={style} onClick={selectable ? onSelect : undefined} aria-selected={selectable ? selected : undefined}>
      <header className="c-q__hd">
        {selectable ? <button type="button" className="c-q__check" aria-label={L.select} aria-pressed={selected} onClick={(e) => { e.stopPropagation(); onSelect && onSelect(); }}>{selected ? <Icon name="Check" size={14} strokeWidth={3} /> : null}</button> : null}
        {index != null ? <span className="c-q__idx">{index}</span> : null}
        <AnonymityBadge level={sender.level} name={sender.name} avatar={sender.avatar} hints={sender.hints} labels={labels} size="sm" />
        <span className="c-q__time">{time}</span>
      </header>
      <p className="c-q__body">{text}</p>
      {!selectable ? (
        <div className="c-q__acts">
          <button type="button" className="c-q__btn c-q__reject" aria-label={L.reject} onClick={onReject}><Icon name="X" size={22} strokeWidth={2.5} /></button>
          <button type="button" className="c-q__btn c-q__approve" onClick={onApprove}><Icon name="Check" size={22} strokeWidth={2.75} /><span>{L.approve}</span></button>
        </div>
      ) : null}
    </article>
  );
}
