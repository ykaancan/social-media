import React, { useState } from "react";
import { Icon } from "../core/Icon.jsx";
import { Chip } from "../core/Chip.jsx";
import { Button } from "../core/Button.jsx";
import { IconButton } from "../core/IconButton.jsx";
import { AnonymityBadge } from "../anonymity/AnonymityBadge.jsx";
import { ensureStyle } from "../core/styleInject.js";

export const REACTIONS = ["🔥", "😂", "❤️", "👀", "😳"];

const CSS = `
.c-post{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);padding:var(--card-pad);display:flex;flex-direction:column;gap:12px;font-family:var(--font-body);position:relative}
.c-post--entering{animation:post-in var(--dur-slow) var(--ease-out) both}
.c-post--event{border-color:transparent;box-shadow:inset 0 0 0 2px var(--event)}
.c-post__hd{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.c-post__time{font:var(--caption);color:var(--text-3);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.c-post__body{font:var(--post);color:var(--text);margin:0;overflow-wrap:anywhere;text-wrap:pretty}
.c-post__body--lg{font:var(--post-lg)}
.c-post__meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.c-post__ft{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.c-react{appearance:none;border:0;height:32px;padding:0 10px 0 8px;border-radius:var(--r-pill);background:var(--surface-muted);display:inline-flex;align-items:center;gap:5px;font:var(--body-sm-strong);font-family:var(--font-body);color:var(--text);cursor:pointer;font-variant-numeric:tabular-nums;transition:background var(--dur-fast),transform var(--dur-fast) var(--ease-out)}
.c-react:active{transform:scale(.94)}
.c-react--mine{background:var(--ink-900);color:#fff}
.c-react__e{font-size:16px;line-height:1;display:inline-block}
.c-react--burst .c-react__e{animation:react-burst var(--dur-slow) var(--ease-pop)}
.c-react__n{animation:count-bump var(--dur-base) var(--ease-pop)}
.c-tray{display:inline-flex;gap:2px;padding:2px;border-radius:var(--r-pill);background:var(--surface);border:1px solid var(--border-strong);animation:post-in var(--dur-base) var(--ease-out)}
.c-tray button{appearance:none;border:0;background:none;width:36px;height:32px;font-size:18px;cursor:pointer;border-radius:var(--r-pill)}
.c-tray button:hover{background:var(--surface-muted)}
.c-post__spacer{flex:1}
.c-post__actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--border);margin-top:2px;padding-top:12px}
`;

export function PostCard({ text, sender = { level: "anonymous" }, time, source, approvedFromBoard = false, reactions = {}, myReaction, onReact, onReply, onMore, actions, large = false, entering = false, eventOutline = false, labels = {}, style }) {
  ensureStyle("c-post-css", CSS);
  const L = { reply: "Reply privately", approvedFromBoard: "Approved from the board", from: "From", ...labels };
  const [tray, setTray] = useState(false);
  const [burst, setBurst] = useState(null);
  const react = (e) => { setBurst(e); setTimeout(() => setBurst(null), 400); setTray(false); onReact && onReact(e); };
  const shown = REACTIONS.filter((e) => (reactions[e] || 0) > 0 || myReaction === e);
  return (
    <article className={`c-post${entering ? " c-post--entering" : ""}${eventOutline ? " c-post--event" : ""}`} style={style}>
      <header className="c-post__hd">
        <AnonymityBadge level={sender.level} name={sender.name} avatar={sender.avatar} hints={sender.hints} labels={labels} />
        <span className="c-post__time">{time}</span>
      </header>
      <p className={`c-post__body${large ? " c-post__body--lg" : ""}`}>{text}</p>
      {(source || approvedFromBoard) ? (
        <div className="c-post__meta">
          {source ? <Chip size="sm" tone="event" icon="Radio">{L.from} {source}</Chip> : null}
          {approvedFromBoard ? <Chip size="sm" icon="BadgeCheck">{L.approvedFromBoard}</Chip> : null}
        </div>
      ) : null}
      {(onReact || onReply || onMore || shown.length) ? (
        <footer className="c-post__ft">
          {shown.map((e) => (
            <button key={e} type="button" className={`c-react${myReaction === e ? " c-react--mine" : ""}${burst === e ? " c-react--burst" : ""}`} onClick={() => react(e)}>
              <span className="c-react__e">{e}</span><span className="c-react__n" key={reactions[e]}>{reactions[e] || 0}</span>
            </button>
          ))}
          {onReact ? (tray ? <span className="c-tray">{REACTIONS.map((e) => <button key={e} type="button" onClick={() => react(e)}>{e}</button>)}</span>
            : <IconButton icon="SmilePlus" label="React" size="sm" onClick={() => setTray(true)} />) : null}
          <span className="c-post__spacer" />
          {onReply ? <IconButton icon="Reply" label={L.reply} size="sm" onClick={onReply} /> : null}
          {onMore ? <IconButton icon="Ellipsis" label="More" size="sm" onClick={onMore} /> : null}
        </footer>
      ) : null}
      {actions && actions.length ? (
        <div className="c-post__actions">
          {actions.map((a, i) => <Button key={i} size="sm" variant={a.variant || (i === 0 ? "primary" : "secondary")} icon={a.icon} onClick={a.onClick}>{a.label}</Button>)}
        </div>
      ) : null}
    </article>
  );
}
