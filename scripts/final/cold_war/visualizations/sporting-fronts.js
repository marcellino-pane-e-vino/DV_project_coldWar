import { CW_DEFAULTS } from "../core/config.js";
import {
  getColdWarTooltip,
  hideTooltip,
  moveTooltip,
  showTooltip
} from "../components/tooltip.js";

const d3 = globalThis.d3;

export function createSportingFronts(data, ids) {
  const state = { medal: "total" };
  const tooltip = getColdWarTooltip();
  const container = d3.select(`#${ids.containerId}`);

  const width = 1050;
  const margin = { top: 72, right: 78, bottom: 62, left: 205 };
  const rowHeight = 38;

  const svg = container
    .append("svg")
    .attr("class", "cw-chart-theme-universal cw-sporting-fronts-svg")
    .attr("viewBox", `0 0 ${width} 520`)
    .attr("role", "img")
    .attr(
      "aria-label",
      "Sporting Fronts horizontal diverging medal-difference chart"
    );

  const gridLayer = svg.append("g").attr("class", "cw-grid cw-sf-grid");
  const xAxis = svg.append("g").attr("class", "cw-axis cw-axis-x cw-sf-x");
  const yAxis = svg.append("g").attr("class", "cw-axis cw-axis-y cw-sf-y");
  const zeroLayer = svg.append("g").attr("class", "cw-sf-zero-layer");
  const barLayer = svg.append("g").attr("class", "cw-sf-bar-layer");
  const valueLabelLayer = svg
    .append("g")
    .attr("class", "cw-sf-value-label-layer");
  const hitAreaLayer = svg.append("g").attr("class", "cw-sf-hit-area-layer");
  const annotationLayer = svg.append("g").attr("class", "cw-sf-annotation-layer");

  const medalSelect = document.getElementById(ids.medalSelectId);
  const aggregateData = data.filter(d => d.Year === "ALL");

  if (medalSelect) medalSelect.value = state.medal;

  function visibleRows() {
    return aggregateData
      .filter(d => d.Scope === "all_games")
      .map(d => ({
        ...d,
        diff: state.medal === "gold" ? d.GoldDifference : d.TotalDifference
      }))
      .sort(
        (a, b) =>
          d3.ascending(a.diff, b.diff) ||
          d3.ascending(a.Sport, b.Sport)
      );
  }

  function showRowTooltip(event, d) {
    const usaValue = state.medal === "gold" ? d.USAGold : d.USATotal;
    const ussrValue = state.medal === "gold" ? d.USSRGold : d.USSRTotal;
    const lead =
      d.diff > 0
        ? { label: "USA lead", value: d.diff, color: "var(--cw-color-usa)" }
        : d.diff < 0
          ? {
              label: "USSR lead",
              value: Math.abs(d.diff),
              color: "var(--cw-color-ussr)"
            }
          : { label: "Tied", value: 0, color: "var(--cw-color-draw)" };

    showTooltip(
      tooltip,
      event,
      `<div class="cw-tooltip-title">${d.Sport}</div>
       <div class="cw-tooltip-divider"></div>
       <div class="cw-tooltip-row"><span style="color: var(--cw-color-usa)">USA</span><strong>${usaValue}</strong></div>
       <div class="cw-tooltip-row"><span style="color: var(--cw-color-ussr)">USSR</span><strong>${ussrValue}</strong></div>
       <div class="cw-tooltip-row"><span style="color: ${lead.color}">${lead.label}</span><strong style="color: var(--cw-color-axis-text)">${Math.abs(lead.value)}</strong></div>`
    );
  }

  function render() {
    const rows = visibleRows();
    const height = Math.max(
      440,
      margin.top + rows.length * rowHeight + margin.bottom
    );
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const maxAbs = d3.max(rows, d => Math.abs(d.diff)) || 1;
    const x = d3
      .scaleLinear()
      .domain([-maxAbs, maxAbs])
      .nice(6)
      .range([margin.left, width - margin.right]);

    const y = d3
      .scaleBand()
      .domain(rows.map(d => d.Sport))
      .range([margin.top, height - margin.bottom])
      .padding(0.18);

    const tickValues = x.ticks(7);
    const transition = svg
      .transition("sporting-fronts-layout")
      .duration(CW_DEFAULTS.transitionMs)
      .ease(d3.easeCubicOut);

    gridLayer
      .attr("transform", `translate(0,${margin.top})`)
      .transition(transition)
      .call(
        d3
          .axisTop(x)
          .tickValues(tickValues)
          // axisTop draws positive tick sizes upward. A negative size makes
          // the gridlines descend through the plotting area, as intended.
          .tickSize(-innerHeight)
          .tickFormat("")
      )
      .call(group => group.select(".domain").remove());

    xAxis
      .attr("transform", `translate(0,${margin.top})`)
      .transition(transition)
      .call(
        d3
          .axisTop(x)
          .tickValues(tickValues)
          .tickSize(0)
          .tickSizeOuter(0)
          .tickPadding(10)
          .tickFormat(value => d3.format("d")(Math.abs(value)))
      )
      .call(group => group.select(".domain").remove());

    yAxis
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSize(0).tickPadding(12));
    yAxis.select(".domain").remove();

    zeroLayer
      .selectAll("line.cw-sf-zero")
      .data([null])
      .join("line")
      .attr("class", "cw-sf-zero")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom);

    annotationLayer
      .selectAll("text.cw-sf-ussr-advantage")
      .data([null])
      .join("text")
      .attr("class", "cw-front-label cw-sf-ussr-advantage")
      .attr("x", margin.left)
      .attr("y", 28)
      .attr("text-anchor", "start")
      .text("← Soviet advantage");

    annotationLayer
      .selectAll("text.cw-sf-usa-advantage")
      .data([null])
      .join("text")
      .attr("class", "cw-front-label cw-sf-usa-advantage")
      .attr("x", width - margin.right)
      .attr("y", 28)
      .attr("text-anchor", "end")
      .text("American advantage →");

    const bars = barLayer
      .selectAll("rect.cw-sf-bar")
      .data(rows, d => d.Sport)
      .join(
        enter =>
          enter
            .append("rect")
            .attr("class", "cw-sf-bar")
            .attr("x", x(0))
            .attr("y", d => y(d.Sport))
            .attr("height", y.bandwidth())
            .attr("width", 0)
            .attr("rx", 2),
        update => update,
        exit =>
          exit
            .transition(transition)
            .attr("x", x(0))
            .attr("width", 0)
            .remove()
      )
      .attr("class", d => {
        const directionClass =
          d.diff < 0
            ? "is-ussr-advantage"
            : d.diff > 0
              ? "is-usa-advantage"
              : "is-draw";
        return `cw-sf-bar ${directionClass}`;
      })
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr("fill-opacity", 0.7);
        showRowTooltip(event, d);
      })
      .on("mousemove", event => moveTooltip(tooltip, event))
      .on("mouseout", event => {
        d3.select(event.currentTarget).attr("fill-opacity", 1);
        hideTooltip(tooltip);
      });

    bars
      .transition(transition)
      .attr("x", d => x(Math.min(0, d.diff)))
      .attr("width", d => Math.abs(x(d.diff) - x(0)))
      .attr("y", d => y(d.Sport))
      .attr("height", y.bandwidth());

    const valueLabels = valueLabelLayer
      .selectAll("text.cw-sf-value-label")
      .data(rows, d => d.Sport)
      .join(
        enter =>
          enter
            .append("text")
            .attr("class", "cw-sf-value-label")
            .attr("x", x(0))
            .attr("y", d => y(d.Sport) + y.bandwidth() / 2)
            .attr("dy", "0.35em")
            .attr("opacity", 0)
            .style("paint-order", "stroke")
            .style("stroke", "var(--paper)")
            .style("stroke-width", "3px")
            .style("stroke-linejoin", "round"),
        update => update,
        exit => exit.transition(transition).attr("opacity", 0).remove()
      );

    valueLabels
      .transition(transition)
      .text(d => Math.abs(d.diff))
      .attr("x", d => x(d.diff) + (d.diff < 0 ? -8 : 8))
      .attr("y", d => y(d.Sport) + y.bandwidth() / 2)
      .attr("text-anchor", d => (d.diff < 0 ? "end" : "start"))
      .attr("opacity", 1);

    const drawHitAreas = hitAreaLayer
      .selectAll("rect.cw-sf-draw-hit-area")
      .data(rows.filter(d => Number(d.diff) === 0), d => d.Sport)
      .join(
        enter =>
          enter
            .append("rect")
            .attr("class", "cw-sf-draw-hit-area")
            .attr("fill", "transparent")
            .style("pointer-events", "all"),
        update => update,
        exit => exit.remove()
      )
      .on("mouseover", (event, d) => showRowTooltip(event, d))
      .on("mousemove", event => moveTooltip(tooltip, event))
      .on("mouseout", () => hideTooltip(tooltip));

    drawHitAreas
      .transition(transition)
      .attr("x", x(0) - 18)
      .attr("y", d => y(d.Sport))
      .attr("width", 36)
      .attr("height", y.bandwidth());
  }

  if (medalSelect) {
    medalSelect.addEventListener("change", event => {
      state.medal = event.target.value;
      render();
    });
  }

  render();
}
