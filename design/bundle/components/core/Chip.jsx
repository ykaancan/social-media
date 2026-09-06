import React from "react";
import { Icon } from "./Icon.jsx";
import { ensureStyle } from "./styleInject.js";

const CSS = `
.b-chip{appearance:none;margin:0;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:var(--r-chip);font:var(--body-sm-strong);font-family:var(--font-body);color:var(--text);background:var(--surface-muted);border:1.5px solid transparent;cursor:default;transition:background var(--dur-fast),border-color var(--dur-fast),transform var(--dur-fast) var(--ease-out);white-space:nowrap}
.b-chip--btn{cursor:pointer}
.b-chip--btn:active{transform:scale(var(--press-scale))}
.b-chip--btn:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.b-chip--sm{height:26px;padding:0 10px;font-size:12px;gap:4px}
.b-chip--selected{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}
.b-chip--outline{background:transparent;border-color:var(--border-strong)}
.b-chip--event{background:var(--event-soft);color:var(--text)}
.b-chip--event.b-chip--selected{background:var(--event);color:var(--on-cover);border-color:var(--event)}
.b-chip--live{background:var(--live-soft);color:var(--text)}
`;

export function Chip({ children, icon, selected = false, tone = "neutral", size = "md", onClick, style }) {
  ensureStyle("b-chip-css", CSS);
  const Tag = onClick ? "button" : "span";
  const cls = `b-chip b-chip--${size}${onClick ? " b-chip--btn" : ""}${selected ? " b-chip--selected" : ""}${tone !== "neutral" ? ` b-chip--${tone}` : ""}`;
  return (
    <Tag type={onClick ? "button" : undefined} className={cls} onClick={onClick} aria-pressed={onClick ? selected : undefined} style={style}>
      {icon ? <Icon name={icon} size={size === "sm" ? 13 : 15} strokeWidth={2.25} /> : null}
      <span>{children}</span>
    </Tag>
  );
}
