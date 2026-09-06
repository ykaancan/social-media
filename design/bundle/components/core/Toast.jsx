import React from "react";
import { Icon } from "./Icon.jsx";
import { ensureStyle } from "./styleInject.js";

const CSS = `
.b-toast{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:10px 12px 10px 14px;border-radius:var(--r-md);background:var(--ink-900);color:var(--ink-0);font:var(--body-sm-strong);font-family:var(--font-body);box-shadow:var(--shadow-toast);max-width:calc(100vw - 32px);animation:post-in var(--dur-slow) var(--ease-out)}
.b-toast__msg{flex:1}
.b-toast__act{appearance:none;border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:var(--r-pill);height:32px;padding:0 12px;font:inherit;cursor:pointer}
.b-toast--warn{background:var(--warning);color:var(--ink-950)}
.b-toast--warn .b-toast__act{background:rgba(0,0,0,.1);color:var(--ink-950)}
.b-toast--danger{background:var(--danger);color:#fff}
.b-toast--live{background:var(--live);color:var(--ink-950)}
.b-toast--live .b-toast__act{background:rgba(0,0,0,.1);color:var(--ink-950)}
`;
const ICONS = { neutral: "Check", warn: "TriangleAlert", danger: "CircleX", live: "Radio" };

export function Toast({ message, action, onAction, tone = "neutral", icon, style }) {
  ensureStyle("b-toast-css", CSS);
  const ic = icon === null ? null : icon || ICONS[tone];
  return (
    <div role="status" className={`b-toast b-toast--${tone}`} style={style}>
      {ic ? <Icon name={ic} size={18} strokeWidth={2.25} /> : null}
      <span className="b-toast__msg">{message}</span>
      {action ? <button type="button" className="b-toast__act" onClick={onAction}>{action}</button> : null}
    </div>
  );
}
