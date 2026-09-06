import React from "react";

const SIZES = { xs: 20, sm: 28, md: 36, lg: 48, xl: 72 };
const HUES = [350, 25, 60, 90, 130, 170, 240, 295];
function hueFor(name = "") { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; }

export function Avatar({ name = "", src, size = "md", style }) {
  const px = SIZES[size] || size;
  const initial = name.trim().charAt(0).toLocaleUpperCase("tr");
  const hue = hueFor(name);
  return (
    <span aria-label={name} style={{ width: px, height: px, borderRadius: "50%", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      background: src ? "var(--surface-muted)" : `oklch(0.9 0.06 ${hue})`, color: "var(--ink-900)", font: `700 ${Math.round(px * 0.46)}px/1 var(--font-display)`, ...style }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
    </span>
  );
}
