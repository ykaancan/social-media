import React from "react";
import { AnonymityBadge } from "../anonymity/AnonymityBadge.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.p-post{display:grid;grid-template-columns:12px 1fr;gap:0 40px;font-family:var(--font-body);color:var(--text);animation:projector-in 600ms var(--ease-out) both;padding:8px 0}
.p-post__bar{background:var(--event);border-radius:6px;min-height:100%}
.p-post__in{display:flex;flex-direction:column;gap:24px;min-width:0}
.p-post__hd{display:flex;align-items:center;justify-content:space-between;gap:32px}
.p-post__time{font:var(--projector-meta);color:var(--text-3);font-variant-numeric:tabular-nums;letter-spacing:.02em;text-transform:uppercase}
.p-post__body{font:var(--projector-post);margin:0;text-wrap:balance;overflow-wrap:anywhere}
.p-post__body--short{font:var(--projector-post-short)}
.p-post__ft{display:flex;gap:20px;flex-wrap:wrap}
.p-post__react{display:inline-flex;align-items:center;gap:12px;font:var(--projector-meta);font-variant-numeric:tabular-nums;color:var(--text-2)}
.p-post__react span:first-child{font-size:48px;line-height:1}
`;

// Read from 15 m. Dark theme comes from the ancestor with data-theme="projector"; the event color is the only accent.
export function ProjectorPost({ text = "", sender = { level: "anonymous" }, time, reactions = {}, labels = {}, style }) {
  ensureStyle("p-post-css", CSS);
  const short = text.length <= 60;
  const shown = Object.entries(reactions).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <article className="p-post" style={style}>
      <span className="p-post__bar" aria-hidden="true" />
      <div className="p-post__in">
        <header className="p-post__hd">
          <AnonymityBadge level={sender.level} name={sender.name} avatar={sender.avatar} hints={sender.hints} labels={labels} size="xl" />
          <span className="p-post__time">{time}</span>
        </header>
        <p className={`p-post__body${short ? " p-post__body--short" : ""}`}>{text}</p>
        {shown.length ? <footer className="p-post__ft">{shown.map(([e, n]) => <span key={e} className="p-post__react"><span>{e}</span><span>{n}</span></span>)}</footer> : null}
      </div>
    </article>
  );
}
