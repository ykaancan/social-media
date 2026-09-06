import React from "react";

// Lucide icon rendered from the CDN icon registry (window.lucide.icons).
// Load <script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"> before use.
export function Icon({ name, size = 20, strokeWidth = 2, color = "currentColor", style, ...rest }) {
  const lib = typeof window !== "undefined" && window.lucide && window.lucide.icons;
  let node = lib ? lib[name] : null;
  if (node && typeof node[0] === "string") node = node[2] || []; // older lucide shape: ["svg", attrs, children]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", display: "block", ...style }} {...rest}>
      {node ? node.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs })) : <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />}
    </svg>
  );
}
