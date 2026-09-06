import React from "react";
import { Icon } from "./Icon.jsx";
import { ensureStyle } from "./styleInject.js";

const CSS = `
.b-btn{appearance:none;border:0;margin:0;cursor:pointer;font:var(--body-strong);font-family:var(--font-body);display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var(--r-button);transition:transform var(--dur-fast) var(--ease-out),background var(--dur-fast),opacity var(--dur-fast);white-space:nowrap;text-decoration:none;position:relative}
.b-btn:active:not(:disabled){transform:scale(var(--press-scale))}
.b-btn:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.b-btn:disabled{opacity:.4;cursor:not-allowed}
.b-btn--primary{background:var(--primary);color:var(--on-primary)}
.b-btn--primary:hover:not(:disabled){background:var(--primary-hover)}
.b-btn--secondary{background:var(--surface);color:var(--text);box-shadow:inset 0 0 0 1.5px var(--border-strong)}
.b-btn--secondary:hover:not(:disabled){background:var(--surface-muted)}
.b-btn--ghost{background:transparent;color:var(--text)}
.b-btn--ghost:hover:not(:disabled){background:var(--surface-muted)}
.b-btn--danger{background:var(--danger-soft);color:var(--danger)}
.b-btn--event{background:var(--event);color:var(--on-cover)}
.b-btn--event:hover:not(:disabled){filter:brightness(1.05)}
.b-btn--sm{height:36px;padding:0 14px;font-size:14px}
.b-btn--md{height:44px;padding:0 18px;font-size:15px}
.b-btn--lg{height:52px;padding:0 24px;font-size:16px}
.b-btn--full{width:100%}
@keyframes b-spin{to{transform:rotate(360deg)}}
.b-spin{width:16px;height:16px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:b-spin .7s linear infinite}
`;

export function Button({ children, variant = "primary", size = "md", icon, iconRight, loading = false, disabled = false, full = false, onClick, type = "button", style, ...rest }) {
  ensureStyle("b-btn-css", CSS);
  const iconSize = size === "sm" ? 16 : 18;
  return (
    <button type={type} className={`b-btn b-btn--${variant} b-btn--${size}${full ? " b-btn--full" : ""}`} disabled={disabled || loading} onClick={onClick} style={style} {...rest}>
      {loading ? <span className="b-spin" /> : icon ? <Icon name={icon} size={iconSize} strokeWidth={2.25} /> : null}
      <span>{children}</span>
      {iconRight && !loading ? <Icon name={iconRight} size={iconSize} strokeWidth={2.25} /> : null}
    </button>
  );
}
