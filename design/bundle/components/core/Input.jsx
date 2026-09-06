import React from "react";
import { ensureStyle } from "./styleInject.js";

const CSS = `
.b-in{display:flex;flex-direction:column;gap:6px;font-family:var(--font-body)}
.b-in__label{font:var(--body-sm-strong);color:var(--text)}
.b-in__box{display:flex;align-items:flex-start;background:var(--surface);border:1.5px solid var(--border-strong);border-radius:var(--r-input);transition:border-color var(--dur-fast),box-shadow var(--dur-fast)}
.b-in__box:focus-within{border-color:var(--text);box-shadow:var(--focus-ring)}
.b-in--error .b-in__box{border-color:var(--danger)}
.b-in__ctl{flex:1;min-width:0;appearance:none;border:0;outline:0;background:transparent;color:var(--text);font:var(--body);padding:12px 14px;min-height:48px;resize:none;line-height:1.45;font-family:inherit}
.b-in__ctl::placeholder{color:var(--text-3)}
.b-in__foot{display:flex;justify-content:space-between;gap:12px;font:var(--caption);color:var(--text-2);font-variant-numeric:tabular-nums}
.b-in--error .b-in__foot{color:var(--danger)}
`;

export function Input({ label, value, onChange, placeholder, multiline = false, rows = 3, hint, error, maxLength, type = "text", autoFocus, style, inputStyle }) {
  ensureStyle("b-in-css", CSS);
  const Tag = multiline ? "textarea" : "input";
  const v = value ?? "";
  return (
    <label className={`b-in${error ? " b-in--error" : ""}`} style={style}>
      {label ? <span className="b-in__label">{label}</span> : null}
      <span className="b-in__box">
        <Tag className="b-in__ctl" value={v} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder}
          rows={multiline ? rows : undefined} type={multiline ? undefined : type} maxLength={maxLength} autoFocus={autoFocus} style={inputStyle} />
      </span>
      {(hint || error || maxLength) ? (
        <span className="b-in__foot">
          <span>{error || hint || ""}</span>
          {maxLength ? <span>{v.length}/{maxLength}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
