import React from "react";
import { IconButton } from "./IconButton.jsx";
import { ensureStyle } from "./styleInject.js";

const CSS = `
.b-sheet__scrim{position:absolute;inset:0;background:rgba(11,11,11,.45);animation:b-fade var(--dur-base) both}
.b-sheet{position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:var(--r-sheet);box-shadow:var(--shadow-sheet);padding:8px var(--screen-x) calc(var(--screen-x) + 8px);font-family:var(--font-body);animation:b-up var(--dur-slow) var(--ease-out) both;max-height:92%;display:flex;flex-direction:column}
.b-sheet__grab{width:36px;height:4px;border-radius:2px;background:var(--ink-200);margin:4px auto 10px}
.b-sheet__hd{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;margin-bottom:8px}
.b-sheet__title{font:var(--display-sm);letter-spacing:var(--display-tracking);text-transform:uppercase}
.b-sheet__body{overflow:auto;display:flex;flex-direction:column;gap:12px}
@keyframes b-fade{from{opacity:0}to{opacity:1}}
@keyframes b-up{from{transform:translateY(100%)}to{transform:none}}
`;

export function Sheet({ open = true, title, onClose, children, style }) {
  ensureStyle("b-sheet-css", CSS);
  if (!open) return null;
  return (
    <>
      <div className="b-sheet__scrim" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="b-sheet" style={style}>
        <div className="b-sheet__grab" />
        {(title || onClose) ? (
          <div className="b-sheet__hd">
            <span className="b-sheet__title">{title}</span>
            {onClose ? <IconButton icon="X" label="Close" size="sm" onClick={onClose} /> : null}
          </div>
        ) : null}
        <div className="b-sheet__body">{children}</div>
      </div>
    </>
  );
}
