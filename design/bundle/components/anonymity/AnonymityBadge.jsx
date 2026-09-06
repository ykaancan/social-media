import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Avatar } from "../core/Avatar.jsx";
import { HintChip } from "./HintChip.jsx";
import { ensureStyle } from "../core/styleInject.js";

const CSS = `
.a-badge{display:inline-flex;align-items:center;gap:8px;}.a-badge--xl{gap:16px;font-family:var(--font-body);min-width:0;white-space:nowrap}
.a-badge--hint{flex-wrap:wrap;row-gap:6px;white-space:normal}
.a-badge__mask{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--anon-anonymous);color:var(--on-primary);flex:none}
.a-badge__mask--sm{width:22px;height:22px}.a-badge__mask--lg{width:44px;height:44px}.a-badge__mask--xl{width:60px;height:60px}
.a-badge__name{font:var(--body-sm-strong);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a-badge__name--lg{font-size:24px}.a-badge__name--xl{font-size:36px;font-weight:700}
.a-badge__lvl{font:var(--caption-caps);letter-spacing:var(--caption-caps-tracking);text-transform:uppercase;color:var(--text-2);white-space:nowrap}
.a-badge__lvl--lg{font-size:16px}.a-badge__lvl--xl{font-size:26px;letter-spacing:.1em}
.a-badge__hintico{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--anon-hint-bg);color:var(--anon-hint);flex:none}
.a-badge__hintico--sm{width:22px;height:22px}.a-badge__hintico--lg{width:44px;height:44px}.a-badge__hintico--xl{width:60px;height:60px}
`;

// The sender identity block that appears on every card. Level is always legible:
// anonymous = solid ink mask, hint = violet dashed clue chips, named = avatar + name.
export function AnonymityBadge({ level = "anonymous", name, avatar, hints = {}, labels = {}, size = "md", showLevel = true, style }) {
  ensureStyle("a-badge-css", CSS);
  const L = { anonymous: "Anonymous", hint: "Hint", named: "", ...labels };
  const ico = { sm: 13, md: 16, lg: 22, xl: 30 }[size] || 16;
  const big = size === "lg" ? "--lg" : size === "xl" ? "--xl" : "";
  const rootCls = "a-badge" + (size === "xl" ? " a-badge--xl" : "");
  if (level === "named") {
    return (
      <span className={rootCls} style={style}>
        <Avatar name={name} src={avatar} size={{ sm: "xs", md: "sm", lg: "lg", xl: 60 }[size] || "sm"} />
        <span className={`a-badge__name${big ? " a-badge__name" + big : ""}`}>{name}</span>
      </span>
    );
  }
  if (level === "hint") {
    const chips = [];
    if (hints.section) chips.push(<HintChip key="s" kind="section" value={hints.section} size={size} />);
    if (hints.country) chips.push(<HintChip key="c" kind="country" value={hints.country} size={size} />);
    if (hints.letter) chips.push(<HintChip key="l" kind="letter" value={hints.letter} size={size} />);
    return (
      <span className={rootCls + " a-badge--hint"} style={style}>
        <span className={`a-badge__hintico a-badge__hintico--${size}`}><Icon name="Sparkles" size={ico} strokeWidth={2.25} /></span>
        {chips.length ? chips : (showLevel ? <span className={`a-badge__lvl${big ? " a-badge__lvl" + big : ""}`}>{L.hint}</span> : null)}
      </span>
    );
  }
  return (
    <span className={rootCls} style={style}>
      <span className={`a-badge__mask a-badge__mask--${size}`}><Icon name="VenetianMask" size={ico} strokeWidth={2.25} /></span>
      {showLevel ? <span className={`a-badge__lvl${big ? " a-badge__lvl" + big : ""}`}>{L.anonymous}</span> : null}
    </span>
  );
}
