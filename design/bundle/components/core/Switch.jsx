import React from "react";
import { ensureStyle } from "./styleInject.js";

const CSS = `
.b-sw{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:var(--tap-min);font-family:var(--font-body);cursor:pointer}
.b-sw__txt{display:flex;flex-direction:column;gap:2px}
.b-sw__label{font:var(--body);color:var(--text)}
.b-sw__desc{font:var(--body-sm);color:var(--text-2)}
.b-sw__track{flex:none;width:48px;height:28px;border-radius:14px;background:var(--ink-200);position:relative;transition:background var(--dur-base) var(--ease-out);border:0;padding:0;cursor:pointer}
.b-sw__track[aria-checked="true"]{background:var(--primary)}
.b-sw__track:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.b-sw__knob{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform var(--dur-base) var(--ease-pop)}
.b-sw__track[aria-checked="true"] .b-sw__knob{transform:translateX(20px)}
`;

export function Switch({ checked = false, onChange, label, description, style }) {
  ensureStyle("b-sw-css", CSS);
  const toggle = () => onChange && onChange(!checked);
  const track = (
    <button type="button" role="switch" aria-checked={checked} className="b-sw__track" onClick={toggle} aria-label={label}>
      <span className="b-sw__knob" />
    </button>
  );
  if (!label) return track;
  return (
    <div className="b-sw" style={style} onClick={toggle}>
      <span className="b-sw__txt"><span className="b-sw__label">{label}</span>{description ? <span className="b-sw__desc">{description}</span> : null}</span>
      <span onClick={(e) => e.stopPropagation()}>{track}</span>
    </div>
  );
}
