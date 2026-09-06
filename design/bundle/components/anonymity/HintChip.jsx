import React from "react";
import { Icon } from "../core/Icon.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.a-hint{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px 0 7px;border-radius:var(--r-pill);background:var(--anon-hint-bg);color:var(--anon-hint);border:1.5px dashed color-mix(in oklch,var(--anon-hint) 45%,transparent);font:var(--body-sm-strong);font-size:13px;font-family:var(--font-body);white-space:nowrap}
.a-hint--sm{height:22px;font-size:12px;padding:0 8px 0 6px}
.a-hint--lg{height:44px;font-size:24px;padding:0 16px 0 12px;gap:8px;border-width:2px}
.a-hint--xl{height:60px;font-size:32px;padding:0 22px 0 16px;gap:12px;border-width:2.5px;border-radius:999px}
.a-hint__letter{font-weight:800;font-size:1.15em;line-height:1}
`;
const ICON = { section: "MapPin", country: "Flag", letter: null };
const ICON_PX = { sm: 12, md: 14, lg: 22, xl: 30 };

// A dashed chip = "this is a clue, not an identity".
export function HintChip({ kind = "section", value, size = "md", style }) {
  ensureStyle("a-hint-css", CSS);
  return (
    <span className={`a-hint a-hint--${size}`} title={kind} style={style}>
      {kind === "letter" ? <Icon name="CaseUpper" size={ICON_PX[size] || 14} strokeWidth={2.25} /> : <Icon name={ICON[kind]} size={ICON_PX[size] || 14} strokeWidth={2.25} />}
      {kind === "letter" ? <span><span className="a-hint__letter">{String(value || "?").charAt(0).toLocaleUpperCase("tr")}</span>···</span> : <span>{value}</span>}
    </span>
  );
}
