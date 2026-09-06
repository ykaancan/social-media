import React from "react";
import { Icon } from "../core/Icon.jsx";
import { StatusPill } from "../core/StatusPill.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.c-ev{appearance:none;border:0;text-align:left;width:100%;border-radius:var(--r-card);padding:16px;display:flex;flex-direction:column;gap:14px;font-family:var(--font-body);cursor:pointer;position:relative;overflow:hidden;color:var(--text);background:var(--surface);box-shadow:inset 0 0 0 1px var(--border);transition:transform var(--dur-fast) var(--ease-out)}
.c-ev:active{transform:scale(.985)}
.c-ev:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.c-ev--live{background:var(--event);color:var(--on-cover);box-shadow:none}
.c-ev--archived{background:var(--surface-muted);color:var(--text-2);box-shadow:none}
.c-ev__top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.c-ev__date{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:52px;height:56px;padding:0;border-radius:var(--r-md);background:var(--event-soft);color:var(--text);flex:none}
.c-ev--live .c-ev__date{background:rgba(11,11,11,.12);color:var(--on-cover)}
.c-ev--archived .c-ev__date{background:var(--ink-100);color:var(--text-2)}
.c-ev__day{font:var(--display-md);letter-spacing:var(--display-tracking);line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}
.c-ev__date--range{padding:0 10px}
.c-ev__date--range .c-ev__day{font:var(--display-sm);line-height:1}
.c-ev__mon{font:var(--caption-caps);letter-spacing:var(--caption-caps-tracking);text-transform:uppercase;white-space:nowrap}
.c-ev__name{font:var(--display-lg);letter-spacing:var(--display-tracking);text-transform:uppercase;margin:0;text-wrap:balance;overflow-wrap:anywhere}
.c-ev--compact .c-ev__name{font:var(--display-md)}
.c-ev__meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font:var(--body-sm-strong);opacity:.85}
.c-ev__meta span{display:inline-flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums}
.c-ev__dot{position:absolute;right:-30px;bottom:-30px;width:120px;height:120px;border-radius:50%;background:var(--event);opacity:.18;pointer-events:none}
.c-ev--archived .c-ev__dot{opacity:.08;filter:grayscale(1)}
`;

// Locale tables. One `locale` switches every piece of copy the card renders itself:
// month abbreviations, status pill, and the uppercase rule (tr: i → İ).
export const EVENT_MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
};
export const EVENT_LABELS = {
  en: { live: "Live", upcoming: "Upcoming", archived: "Archived" },
  tr: { live: "Canlı", upcoming: "Yaklaşan", archived: "Arşiv" },
};
const monthName = (m, locale) => (typeof m === "number" ? EVENT_MONTHS[locale][m - 1] : m);

export function EventCard({ name, status = "upcoming", locale = "en", cover = "var(--cover-magenta)", coverSoft = "var(--cover-magenta-soft)", day, month, dayEnd, monthEnd, timeRange, scope, memberCount, postCount, compact = false, onPress, labels = {}, style }) {
  ensureStyle("c-ev-css", CSS);
  const L = { ...EVENT_LABELS[locale], ...labels };
  const m1 = monthName(month, locale), m2 = monthName(monthEnd, locale);
  const range = dayEnd != null;
  const crossMonth = range && m2 && m2 !== m1;
  // 14–16 / Nov   ·   30 Nov–2 Dec (cross-month: month moves into the day line)
  const dayText = range ? (crossMonth ? `${day} ${m1}–${dayEnd} ${m2}` : `${day}–${dayEnd}`) : day;
  const monText = crossMonth ? null : m1;
  return (
    <button type="button" lang={locale} className={`c-ev c-ev--${status}${compact ? " c-ev--compact" : ""}`} onClick={onPress} style={{ "--event": cover, "--event-soft": coverSoft, ...style }}>
      {status !== "live" ? <span className="c-ev__dot" aria-hidden="true" /> : null}
      <div className="c-ev__top">
        <span className={`c-ev__date${range ? " c-ev__date--range" : ""}`}><span className="c-ev__day">{dayText}</span>{monText ? <span className="c-ev__mon">{monText}</span> : null}</span>
        <StatusPill status={status} label={L[status]} />
      </div>
      <h3 className="c-ev__name">{name}</h3>
      <div className="c-ev__meta">
        {scope ? <span><Icon name="MapPin" size={14} strokeWidth={2.25} />{scope}</span> : null}
        {timeRange ? <span><Icon name="Clock" size={14} strokeWidth={2.25} />{timeRange}</span> : null}
        {memberCount != null ? <span><Icon name="Users" size={14} strokeWidth={2.25} />{memberCount}</span> : null}
        {postCount != null ? <span><Icon name="MessageSquare" size={14} strokeWidth={2.25} />{postCount}</span> : null}
      </div>
    </button>
  );
}
