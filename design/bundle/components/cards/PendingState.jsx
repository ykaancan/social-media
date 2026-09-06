import React from "react";
import { Icon } from "../core/Icon.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.c-pend{display:flex;flex-direction:column;gap:20px;font-family:var(--font-body);padding:8px 0}
.c-pend__title{font:var(--display-lg);letter-spacing:var(--display-tracking);text-transform:uppercase;margin:0;text-wrap:balance}
.c-pend__sub{font:var(--body);color:var(--text-2);margin:0;text-wrap:pretty}
.c-pend__steps{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none}
.c-pend__step{display:grid;grid-template-columns:28px 1fr;gap:12px;align-items:start;position:relative;padding-bottom:18px}
.c-pend__step:not(:last-child)::before{content:"";position:absolute;left:13px;top:28px;bottom:0;width:2px;background:var(--border)}
.c-pend__step--done:not(:last-child)::before{background:var(--text)}
.c-pend__dot{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--surface-muted);color:var(--text-3);font:var(--caption-caps);border:2px solid var(--border)}
.c-pend__step--done .c-pend__dot{background:var(--text);color:var(--bg);border-color:var(--text)}
.c-pend__step--current .c-pend__dot{border-color:var(--text);color:var(--text);background:var(--bg);animation:live-pulse var(--dur-pulse) ease-out infinite;--live:var(--ink-900)}
.c-pend__lbl{font:var(--body-strong);padding-top:3px}
.c-pend__step--current .c-pend__lbl{font-weight:600}
.c-pend__desc{font:var(--body-sm);color:var(--text-2);margin-top:2px}
.c-pend__note{font:var(--body-sm);color:var(--text-2);padding:12px 14px;border-radius:var(--r-md);background:var(--surface-muted);display:flex;gap:10px;align-items:flex-start}
`;

export function PendingState({ title, subtitle, steps = [], note, style }) {
  ensureStyle("c-pend-css", CSS);
  return (
    <section className="c-pend" style={style}>
      <div>
        <h2 className="c-pend__title">{title}</h2>
        {subtitle ? <p className="c-pend__sub">{subtitle}</p> : null}
      </div>
      <ol className="c-pend__steps">
        {steps.map((s, i) => (
          <li key={i} className={`c-pend__step${s.done ? " c-pend__step--done" : s.current ? " c-pend__step--current" : ""}`}>
            <span className="c-pend__dot">{s.done ? <Icon name="Check" size={14} strokeWidth={3} /> : i + 1}</span>
            <span><div className="c-pend__lbl">{s.label}</div>{s.description ? <div className="c-pend__desc">{s.description}</div> : null}</span>
          </li>
        ))}
      </ol>
      {note ? <div className="c-pend__note"><Icon name="Info" size={18} strokeWidth={2.25} /><span>{note}</span></div> : null}
    </section>
  );
}
