const d3 = globalThis.d3;

/**
 * IronNeverden-style chart help.
 *
 * The trigger lives below the visualization. Hovering it reveals an overlay
 * confined to the visualization wrapper; leaving the trigger hides it.
 * The project-specific visual difference from IronNeverden is defined in CSS:
 * the divider under the title is green instead of red.
 */
export function createChartHelp({ wrapperId, hostId, title = "How to read the chart?", steps = [] }) {
  if (!d3) {
    console.error("createChartHelp: D3.js is required.");
    return null;
  }

  const triggerContainer = d3.select(`#${hostId}`);
  const overlayContainer = d3.select(`#${wrapperId}`);

  if (triggerContainer.empty() || overlayContainer.empty()) {
    console.error("createChartHelp: missing container", { wrapperId, hostId });
    return null;
  }

  // Same idempotent cleanup pattern used by IronNeverden.
  overlayContainer.selectAll(".chart-help-overlay").remove();
  triggerContainer.selectAll(".chart-help-trigger").remove();

  // The absolute overlay must be positioned relative to the chart wrapper.
  if (overlayContainer.style("position") === "static") {
    overlayContainer.style("position", "relative");
  }

  const overlay = overlayContainer
    .append("div")
    .attr("class", "chart-help-overlay")
    .style("visibility", "hidden")
    .style("opacity", "0")
    .style("display", "flex")
    .style("transition", "opacity 0.2s, visibility 0.2s")
    .style("pointer-events", "none");

  const contentBox = overlay
    .append("div")
    .attr("class", "chart-help-content");

  contentBox
    .append("h4")
    .text(title || "How to read the chart?");

  contentBox
    .append("div")
    .attr("class", "chart-help-divider");

  const list = contentBox.append("ul");
  steps.forEach(step => list.append("li").html(step));

  const trigger = triggerContainer
    .append("div")
    .attr("class", "chart-help-trigger")
    .style("pointer-events", "auto")
    .html(`
      <span class="chart-help-icon">i</span>
      <span class="chart-help-text">How to read the chart?</span>
    `);

  trigger.on("mouseenter", function () {
    overlay
      .style("visibility", "visible")
      .style("opacity", "1");
  });

  trigger.on("mouseleave", function () {
    overlay
      .style("visibility", "hidden")
      .style("opacity", "0");
  });

  return { overlay, trigger };
}
