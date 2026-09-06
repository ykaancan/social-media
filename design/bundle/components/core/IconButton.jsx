import React from "react";
import { Icon } from "./Icon.jsx";
import { ensureStyle } from "./styleInject.js";

const CSS = `
.b-ib{appearance:none;border:0;margin:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--r-pill);color:var(--text);background:transparent;transition:transform var(--dur-fast) var(--ease-out),background var(--dur-fast);position:relative;flex:none}
.b-ib:hover{background:var(--surface-muted)}
.b-ib:active{transform:scale(.92)}
.b-ib:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.b-ib--filled{background:var(--primary);color:var(--on-primary)}
.b-ib--filled:hover{background:var(--primary-hover)}
.b-ib--outline{box-shadow:inset 0 0 0 1.5px var(--border-strong);background:var(--surface)}
.b-ib--event{background:var(--event);color:var(--on-cover)}
.b-ib--sm{width:36px;height:36px}.b-ib--md{width:44px;height:44px}.b-ib--lg{width:56px;height:56px;box-shadow:var(--shadow-fab)}
.b-ib__badge{position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--danger);color:#fff;font:700 11px/18px var(--font-body);text-align:center;box-shadow:0 0 0 2px var(--bg)}
`;

export function IconButton({ icon, label, variant = "ghost", size = "md", badge, onClick, disabled, style }) {
  ensureStyle("b-ib-css", CSS);
  const s = size === "sm" ? 18 : size === "lg" ? 26 : 22;
  return (
    <button type="button" aria-label={label} title={label} className={`b-ib b-ib--${variant} b-ib--${size}`} onClick={onClick} disabled={disabled} style={style}>
      <Icon name={icon} size={s} strokeWidth={size === "sm" ? 2.25 : 2} />
      {badge ? <span className="b-ib__badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}
