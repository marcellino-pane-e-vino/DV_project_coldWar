/**
 * Shared SVG boycott marker used by Cold War visualizations.
 *
 * The component owns the semantic SVG structure (group + empty outlined
 * rectangle + label) and the D3 enter/update/exit join. Individual charts
 * remain responsible for geometry: they provide x/y/width/height and label
 * placement appropriate to their own coordinate system.
 *
 * Presentation is centralized in cold_war.css through
 * `.cw-boycott-marker-rect` and `.cw-boycott-marker-label`.
 */

function resolve(value, datum, index, nodes) {
  return typeof value === "function" ? value(datum, index, nodes) : value;
}

export function renderBoycottMarkers(
  layer,
  data,
  {
    key = d => d.Year,
    x,
    y,
    width,
    height,
    rx = 4,
    label = d => d.label,
    labelX,
    labelY,
    labelAnchor = "middle",
    transition = null
  } = {}
) {
  if (!layer || typeof layer.selectAll !== "function") {
    throw new TypeError("renderBoycottMarkers requires a D3 selection as layer");
  }

  for (const [name, accessor] of Object.entries({ x, y, width, height, labelX, labelY })) {
    if (accessor == null) {
      throw new TypeError(`renderBoycottMarkers requires the ${name} option`);
    }
  }

  const markers = layer
    .selectAll("g.cw-boycott-marker")
    .data(data, key)
    .join(
      enter => {
        const group = enter
          .append("g")
          .attr("class", "cw-boycott-marker")
          .attr("aria-hidden", "true")
          .attr("opacity", transition ? 0 : 1);

        group
          .append("rect")
          .attr("class", "cw-boycott-marker-rect")
          // Structural invariant of this component: boycott markers are always
          // empty outlines. Apply the shared CSS variables inline as a defensive
          // fallback so a stale stylesheet can never produce SVG's default
          // black-filled rectangle.
          .style("fill", "none")
          .style("stroke", "var(--cw-color-boycott)")
          .style(
            "stroke-width",
            "var(--cw-boycott-marker-stroke-width, 1.4)"
          )
          .style(
            "stroke-dasharray",
            "var(--cw-boycott-marker-dash, 5 4)"
          );

        group
          .append("text")
          .attr("class", "cw-boycott-marker-label")
          .style("fill", "var(--cw-color-boycott)")
          .style("font-family", '"Fira Sans", sans-serif')
          .style(
            "font-size",
            "var(--cw-boycott-marker-label-size, 12px)"
          )
          .style("font-weight", "700");

        return group;
      },
      update => update,
      exit => {
        if (transition) {
          return exit
            .transition(transition)
            .attr("opacity", 0)
            .remove();
        }
        return exit.remove();
      }
    );

  const rects = markers
    .select("rect.cw-boycott-marker-rect")
    .attr("rx", (d, i, nodes) => resolve(rx, d, i, nodes));

  const labels = markers
    .select("text.cw-boycott-marker-label")
    .attr("text-anchor", (d, i, nodes) => resolve(labelAnchor, d, i, nodes))
    .text((d, i, nodes) => resolve(label, d, i, nodes));

  if (transition) {
    markers
      .transition(transition)
      .attr("opacity", 1);

    rects
      .transition(transition)
      .attr("x", (d, i, nodes) => resolve(x, d, i, nodes))
      .attr("y", (d, i, nodes) => resolve(y, d, i, nodes))
      .attr("width", (d, i, nodes) => resolve(width, d, i, nodes))
      .attr("height", (d, i, nodes) => resolve(height, d, i, nodes));

    labels
      .transition(transition)
      .attr("x", (d, i, nodes) => resolve(labelX, d, i, nodes))
      .attr("y", (d, i, nodes) => resolve(labelY, d, i, nodes));
  } else {
    rects
      .attr("x", (d, i, nodes) => resolve(x, d, i, nodes))
      .attr("y", (d, i, nodes) => resolve(y, d, i, nodes))
      .attr("width", (d, i, nodes) => resolve(width, d, i, nodes))
      .attr("height", (d, i, nodes) => resolve(height, d, i, nodes));

    labels
      .attr("x", (d, i, nodes) => resolve(labelX, d, i, nodes))
      .attr("y", (d, i, nodes) => resolve(labelY, d, i, nodes));
  }

  return markers;
}
