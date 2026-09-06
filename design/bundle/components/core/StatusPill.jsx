import React from "react";
import { ensureStyle } from "./styleInject.js";

const CSS = `
.b-sp{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:var(--r-pill);font:var(--caption-caps);letter-spacing:var(--caption-caps-tracking);text-transform:uppercase;font-family:var(--font-body);white-space:nowrap}
.b-sp--live{background:var(--live);color:var(--ink-950)}
.b-sp--upcoming{background:var(--surface-muted);color:var(--text)}
.b-sp--archived{background:transparent;color:var(--text-3);box-shadow:inset 0 0 0 1px var(--border-strong)}
.b-sp--pending{background:var(--warning-soft);color:var(--ink-900)}
.b-sp--rejected{background:var(--danger-soft);color:var(--danger)}
.b-sp--onwall{background:var(--ink-900);color:#fff}
.b-sp__dot{width:8px;height:8px;border-radius:50%;background:var(--ink-950);animation:live-pulse var(--dur-pulse) ease-out infinite}
.b-sp--lg{height:32px;padding:0 14px;font-size:13px}
`;
const LABEL = { live: "Live", upcoming: "Upcoming", archived: "Archived", pending: "In queue", rejected: "Not published", onwall: "On wall" };

export function StatusPill({ status = "upcoming", label, size = "md", style }) {
  ensureStyle("b-sp-css", CSS);
  return (
    <span className={`b-sp b-sp--${status}${size === "lg" ? " b-sp--lg" : ""}`} style={style}>
      {status === "live" ? <span className="b-sp__dot" /> : null}
      <span>{label || LABEL[status]}</span>
    </span>
  );
}
