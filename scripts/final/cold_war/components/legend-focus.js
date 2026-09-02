import { createInteractiveLegend } from "./interactive-legend.js";

/**
 * Shared legend-driven focus controller.
 *
 * Visualizations provide one or more target groups. Each group resolves a D3
 * selection at refresh time, so the controller remains valid after D3 joins.
 * JavaScript owns focus state/classes; CSS owns the fade transition.
 *
 * targetGroups entries:
 * - selection: () => D3 selection (required)
 * - key: datum => legend key (required unless dimWhenActive=true)
 * - dimWhenActive: dim every non-excluded target whenever a key is active
 * - exclude: datum => true for marks that must never react to legend focus
 */
export function createLegendFocus({
  legendId,
  items,
  targetGroups,
  activeKey = null,
  onChange = null
}) {
  if (!Array.isArray(targetGroups) || targetGroups.length === 0) {
    throw new TypeError("createLegendFocus requires at least one target group");
  }

  let current = activeKey;

  function refreshTargets() {
    targetGroups.forEach(group => {
      const selection = group.selection?.();
      if (!selection || typeof selection.classed !== "function") return;

      const exclude = group.exclude || (() => false);
      const key = group.key || (() => null);
      const dimWhenActive = Boolean(group.dimWhenActive);

      selection
        .classed("cw-focus-target", true)
        .classed("is-focus-dimmed", d => {
          if (!current || exclude(d)) return false;
          return dimWhenActive || key(d) !== current;
        })
        .classed("is-focus-active", d => {
          if (!current || exclude(d) || dimWhenActive) return false;
          return key(d) === current;
        });
    });
  }

  const legend = createInteractiveLegend(legendId, items, {
    activeKey: current,
    onToggle: key => {
      current = key;
      refreshTargets();
      onChange?.(current);
    }
  });

  return {
    refresh() {
      refreshTargets();
    },
    setActive(key) {
      current = key;
      legend.setActive(current);
      refreshTargets();
      onChange?.(current);
    },
    getActive() {
      return current;
    },
    destroy() {
      legend.destroy();
    }
  };
}
