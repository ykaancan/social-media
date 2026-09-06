import React from "react";
import { Button } from "../core/Button.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.c-jc{display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px 16px 16px;border-radius:var(--r-card);background:var(--event-soft);font-family:var(--font-body);text-align:center}
.c-jc__lbl{font:var(--caption-caps);letter-spacing:var(--caption-caps-tracking);text-transform:uppercase;color:var(--text-2)}
.c-jc__code{font:var(--display-xl);letter-spacing:.08em;color:var(--text);font-variant-numeric:tabular-nums;padding-left:.08em}
.c-jc__qr{width:180px;height:180px;border-radius:var(--r-md);background:repeating-linear-gradient(45deg,var(--ink-100) 0 6px,var(--ink-0) 6px 12px);border:1.5px dashed var(--border-strong);display:flex;align-items:center;justify-content:center;font:500 12px/1.3 ui-monospace,Menlo,monospace;color:var(--text-2);overflow:hidden}
.c-jc__qr img{width:100%;height:100%;object-fit:contain}
.c-jc__row{display:flex;gap:8px;width:100%}
.c-jc__row>*{flex:1}
`;

// QR image is rendered by the app (e.g. react-native-qrcode-svg). Without `qrSrc` a labelled placeholder is shown.
export function JoinCodeBlock({ code = "", qrSrc, eventColorSoft, onCopy, onShare, labels = {}, style }) {
  ensureStyle("c-jc-css", CSS);
  const L = { joinCode: "Join code", copy: "Copy", share: "Share", qrPlaceholder: "QR code", ...labels };
  const pretty = code.replace(/[^A-Z0-9]/gi, "").toUpperCase().replace(/(.{3})(?=.)/g, "$1 ");
  return (
    <section className="c-jc" style={{ ...(eventColorSoft ? { "--event-soft": eventColorSoft } : null), ...style }}>
      <span className="c-jc__lbl">{L.joinCode}</span>
      <span className="c-jc__code">{pretty}</span>
      <div className="c-jc__qr" aria-label={L.qrPlaceholder}>{qrSrc ? <img src={qrSrc} alt={L.qrPlaceholder} /> : <span>{L.qrPlaceholder}</span>}</div>
      <div className="c-jc__row">
        <Button variant="secondary" icon="Copy" onClick={onCopy}>{L.copy}</Button>
        <Button icon="Share" onClick={onShare}>{L.share}</Button>
      </div>
    </section>
  );
}
