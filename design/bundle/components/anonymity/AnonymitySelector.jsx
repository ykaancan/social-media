import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Chip } from "../core/Chip.jsx";
import { AnonymityBadge } from "./AnonymityBadge.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.a-sel{display:flex;flex-direction:column;gap:10px;font-family:var(--font-body)}
.a-sel__row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.a-sel__opt{appearance:none;border:1.5px solid var(--border-strong);background:var(--surface);border-radius:var(--r-lg);padding:12px 10px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;color:var(--text);transition:border-color var(--dur-fast),background var(--dur-fast),transform var(--dur-fast) var(--ease-out);min-height:88px;font-family:inherit}
.a-sel__opt:active{transform:scale(var(--press-scale))}
.a-sel__opt:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.a-sel__opt[aria-checked="true"]{border-color:var(--text);border-width:2px;padding:11px 9px 9px;background:var(--surface-muted)}
.a-sel__ico{width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--surface-muted);color:var(--text)}
.a-sel__opt[data-lvl="anonymous"] .a-sel__ico{background:var(--anon-anonymous);color:var(--on-primary)}
.a-sel__opt[data-lvl="hint"] .a-sel__ico{background:var(--anon-hint-bg);color:var(--anon-hint)}
.a-sel__opt[data-lvl="named"] .a-sel__ico{background:var(--live-soft);color:var(--text)}
.a-sel__lbl{font:var(--body-sm-strong)}
.a-sel__sub{font:var(--caption);color:var(--text-2);text-align:center}
.a-sel__hints{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px;border-radius:var(--r-md);background:var(--anon-hint-bg);animation:post-in var(--dur-base) var(--ease-out)}
.a-sel__hints-lbl{font:var(--caption-caps);letter-spacing:var(--caption-caps-tracking);text-transform:uppercase;color:var(--anon-hint);width:100%}
.a-sel__preview{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--r-md);border:1px dashed var(--border-strong)}
.a-sel__preview-lbl{font:var(--caption);color:var(--text-2)}
`;
const DEFAULT_LABELS = {
  anonymous: "Anonymous", anonymousSub: "No trace", hint: "Hint", hintSub: "Pick your clues", named: "Named", namedSub: "Name + photo",
  showThem: "Show them", section: "Section", country: "Country", letter: "First letter", preview: "They'll see",
};

export function AnonymitySelector({ value = "anonymous", onChange, hintFields = { section: true }, onHintFieldsChange, me = {}, labels = {}, style }) {
  ensureStyle("a-sel-css", CSS);
  const L = { ...DEFAULT_LABELS, ...labels };
  const opts = [
    { id: "anonymous", icon: "VenetianMask", lbl: L.anonymous, sub: L.anonymousSub },
    { id: "hint", icon: "Sparkles", lbl: L.hint, sub: L.hintSub },
    { id: "named", icon: "User", lbl: L.named, sub: L.namedSub },
  ];
  const toggle = (k) => onHintFieldsChange && onHintFieldsChange({ ...hintFields, [k]: !hintFields[k] });
  const hints = value === "hint" ? { section: hintFields.section ? me.section : null, country: hintFields.country ? me.country : null, letter: hintFields.letter ? (me.name || "").charAt(0) : null } : {};
  return (
    <div className="a-sel" style={style}>
      <div className="a-sel__row" role="radiogroup">
        {opts.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} data-lvl={o.id} className="a-sel__opt" onClick={() => onChange && onChange(o.id)}>
            <span className="a-sel__ico"><Icon name={o.icon} size={20} strokeWidth={2.25} /></span>
            <span className="a-sel__lbl">{o.lbl}</span>
            <span className="a-sel__sub">{o.sub}</span>
          </button>
        ))}
      </div>
      {value === "hint" ? (
        <div className="a-sel__hints">
          <span className="a-sel__hints-lbl">{L.showThem}</span>
          <Chip size="sm" icon="MapPin" selected={!!hintFields.section} onClick={() => toggle("section")}>{L.section}</Chip>
          <Chip size="sm" icon="Flag" selected={!!hintFields.country} onClick={() => toggle("country")}>{L.country}</Chip>
          <Chip size="sm" icon="CaseUpper" selected={!!hintFields.letter} onClick={() => toggle("letter")}>{L.letter}</Chip>
        </div>
      ) : null}
      <div className="a-sel__preview">
        <span className="a-sel__preview-lbl">{L.preview}</span>
        <AnonymityBadge level={value} name={me.name} avatar={me.avatar} hints={hints} labels={{ anonymous: L.anonymous, hint: L.hint }} size="sm" />
      </div>
    </div>
  );
}
