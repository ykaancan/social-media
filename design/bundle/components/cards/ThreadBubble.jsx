import React from "react";
import { AnonymityBadge } from "../anonymity/AnonymityBadge.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.c-tb{display:flex;flex-direction:column;gap:4px;max-width:82%;font-family:var(--font-body);animation:post-in var(--dur-base) var(--ease-out) both}
.c-tb--mine{align-self:flex-end;align-items:flex-end}
.c-tb__sender{margin-bottom:2px}
.c-tb__bubble{padding:10px 14px;border-radius:18px;font:var(--body);color:var(--text);background:var(--surface-muted);overflow-wrap:anywhere;text-wrap:pretty}
.c-tb--theirs .c-tb__bubble{border-bottom-left-radius:6px}
.c-tb--mine .c-tb__bubble{background:var(--primary);color:var(--on-primary);border-bottom-right-radius:6px}
.c-tb__time{font:var(--caption);color:var(--text-3);font-variant-numeric:tabular-nums;padding:0 4px}
.c-tb--sys{align-self:center;max-width:90%;text-align:center}
.c-tb--sys .c-tb__bubble{background:transparent;color:var(--text-2);font:var(--body-sm);padding:4px 8px}
`;

export function ThreadBubble({ text, mine = false, system = false, time, sender, labels = {}, style }) {
  ensureStyle("c-tb-css", CSS);
  const cls = system ? "c-tb c-tb--sys" : `c-tb c-tb--${mine ? "mine" : "theirs"}`;
  return (
    <div className={cls} style={style}>
      {sender && !mine && !system ? <span className="c-tb__sender"><AnonymityBadge level={sender.level} name={sender.name} avatar={sender.avatar} hints={sender.hints} labels={labels} size="sm" /></span> : null}
      <span className="c-tb__bubble">{text}</span>
      {time ? <span className="c-tb__time">{time}</span> : null}
    </div>
  );
}
