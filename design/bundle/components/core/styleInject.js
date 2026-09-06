// Injects a stylesheet once per id. Used for pseudo-states (:active, :focus-visible) and keyframes.
export function ensureStyle(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}
