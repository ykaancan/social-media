import React from "react";
import { ensureStyle } from "./styleInject.js";

const CSS = `
.b-tabs{display:flex;font-family:var(--font-body);position:relative}
.b-tabs--underline{gap:4px;border-bottom:1px solid var(--border)}
.b-tabs--underline .b-tab{background:none;border:0;padding:12px 14px;font:var(--body-sm-strong);color:var(--text-2);cursor:pointer;position:relative;display:inline-flex;align-items:center;gap:6px;min-height:var(--tap-min)}
.b-tabs--underline .b-tab[aria-selected="true"]{color:var(--text)}
.b-tabs--underline .b-tab[aria-selected="true"]::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:3px;border-radius:2px;background:var(--text)}
.b-tabs--segmented{background:var(--surface-muted);border-radius:var(--r-pill);padding:3px;gap:2px}
.b-tabs--segmented .b-tab{flex:1;background:transparent;border:0;height:36px;border-radius:var(--r-pill);font:var(--body-sm-strong);color:var(--text-2);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:background var(--dur-base),color var(--dur-base)}
.b-tabs--segmented .b-tab[aria-selected="true"]{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.b-tab:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.b-tab__count{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--surface-muted);font:700 11px/20px var(--font-body);color:var(--text-2);text-align:center;font-variant-numeric:tabular-nums}
.b-tab[aria-selected="true"] .b-tab__count{background:var(--primary);color:var(--on-primary)}
.b-tab__count--hot{background:var(--danger)!important;color:#fff!important}
`;

export function Tabs({ items = [], value, onChange, variant = "underline", style }) {
  ensureStyle("b-tabs-css", CSS);
  return (
    <div role="tablist" className={`b-tabs b-tabs--${variant}`} style={style}>
      {items.map((it) => (
        <button key={it.id} role="tab" type="button" className="b-tab" aria-selected={value === it.id} onClick={() => onChange && onChange(it.id)} disabled={it.disabled}>
          <span>{it.label}</span>
          {it.count != null ? <span className={`b-tab__count${it.hot ? " b-tab__count--hot" : ""}`}>{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
