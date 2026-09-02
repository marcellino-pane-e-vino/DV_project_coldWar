let tooltip = null;
export function getColdWarTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.className = "cw-tooltip";
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}
export function showTooltip(el, event, html) {
  el.innerHTML = html;
  el.hidden = false;
  moveTooltip(el, event);
}
export function moveTooltip(el, event) {
  const offset = 14;
  let x = event.clientX + offset, y = event.clientY + offset;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) el.style.left = `${Math.max(8, event.clientX - r.width - offset)}px`;
    if (r.bottom > window.innerHeight - 8) el.style.top = `${Math.max(8, event.clientY - r.height - offset)}px`;
  });
}
export function hideTooltip(el) { el.hidden = true; }
