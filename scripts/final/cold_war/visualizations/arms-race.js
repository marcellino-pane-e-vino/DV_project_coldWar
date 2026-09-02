import {
  getColdWarTooltip,
  hideTooltip,
  moveTooltip,
  showTooltip
} from "../components/tooltip.js";
import { createInteractiveLegend } from "../components/interactive-legend.js";

const d3 = globalThis.d3;

const SERIES = Object.freeze([
  {
    key: "USA",
    label: "United States",
    field: "USA_Warheads",
    className: "cw-series-usa",
    swatchClass: "usa"
  },
  {
    key: "USSR",
    label: "Soviet Union",
    field: "USSR_Warheads",
    className: "cw-series-ussr",
    swatchClass: "ussr"
  }
]);

function formatWarheads(value) {
  return d3.format(",d")(Math.round(value ?? 0));
}

export function createArmsRace(data, ids) {
  const container = d3.select(`#${ids.containerId}`);
  container.selectAll("*").remove();

  const width = 1080;
  const height = 520;
  const margin = { top: 42, right: 42, bottom: 64, left: 88 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container
    .append("svg")
    .attr("class", "cw-chart-theme-universal cw-arms-svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      "Estimated United States and Soviet nuclear warhead stockpiles from 1945 to 1991"
    );

  const tooltip = getColdWarTooltip();

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, d => d.Year))
    .range([margin.left, width - margin.right]);

  const maxWarheads = d3.max(
    data,
    d => Math.max(d.USA_Warheads ?? 0, d.USSR_Warheads ?? 0)
  ) || 1;

  const y = d3
    .scaleLinear()
    .domain([0, maxWarheads])
    .nice(6)
    .range([height - margin.bottom, margin.top]);

  const areaFor = field =>
    d3
      .area()
      .x(d => x(d.Year))
      .y0(y(0))
      .y1(d => y(d[field] ?? 0))
      .curve(d3.curveMonotoneX);

  const lineFor = field =>
    d3
      .line()
      .x(d => x(d.Year))
      .y(d => y(d[field] ?? 0))
      .curve(d3.curveMonotoneX);

  /* ---------------------------------------------------------------------- */
  /* Grid + axes: same visual grammar used by IronNeverden.                 */
  /* ---------------------------------------------------------------------- */

  const yTicks = y.ticks(6);
  const xTicks = d3.range(1945, 1991, 5);

  svg
    .append("g")
    .attr("class", "cw-grid cw-grid-y")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3
        .axisLeft(y)
        .tickValues(yTicks)
        .tickSize(-innerWidth)
        .tickFormat("")
    );


  svg
    .append("g")
    .attr("class", "cw-axis cw-axis-x")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(xTicks)
        .tickFormat(d3.format("d"))
        .tickSizeOuter(0)
        .tickPadding(10)
    );

  svg
    .append("g")
    .attr("class", "cw-axis cw-axis-y")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3
        .axisLeft(y)
        .tickValues(yTicks)
        .tickSize(0)
        .tickPadding(12)
        .tickFormat(d3.format("~s"))
    );

  svg
    .append("text")
    .attr("class", "cw-axis-label")
    .attr("x", margin.left)
    .attr("y", 24)
    .attr("text-anchor", "middle")
    .text("Nuclear warheads");

  /* ---------------------------------------------------------------------- */
  /* Secondary Olympic-year annotations.                                    */
  /* ---------------------------------------------------------------------- */


  /* ---------------------------------------------------------------------- */
  /* Areas + lines.                                                          */
  /* ---------------------------------------------------------------------- */

  const plot = svg.append("g").attr("class", "cw-arms-plot");
  let pinned = null;
  let legendApi = null;

  const series = SERIES.map(seriesDef => ({
    ...seriesDef,
    area: areaFor(seriesDef.field),
    line: lineFor(seriesDef.field)
  }));

  const groups = plot
    .selectAll("g.cw-arms-series")
    .data(series, d => d.key)
    .join("g")
    .attr("class", d => `cw-arms-series ${d.className}`);

  groups
    .append("path")
    .attr("class", "cw-arms-area")
    .attr("d", d => d.area(data));

  groups
    .append("path")
    .attr("class", "cw-arms-line cw-line-path")
    .attr("d", d => d.line(data));

  function applyFocus() {
    groups
      .classed("is-pinned", d => pinned === d.key)
      .classed("is-dimmed", d => Boolean(pinned && pinned !== d.key));

    if (pinned) {
      groups.filter(d => d.key === pinned).raise();
    }

    interactionRect?.raise();
    hoverLayer.raise();
    legendApi?.setActive(pinned);
  }

  /* ---------------------------------------------------------------------- */
  /* IronNeverden-style hover crosshair + differential tooltip (variant 2). */
  /* ---------------------------------------------------------------------- */

  const hoverLayer = svg
    .append("g")
    .attr("class", "cw-arms-hover-layer")
    .attr("pointer-events", "none");

  const hoverLine = hoverLayer
    .append("line")
    .attr("class", "cw-hover-guide")
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom)
    .style("opacity", 0);

  const hoverDots = hoverLayer
    .selectAll("circle.cw-arms-hover-dot")
    .data(SERIES, d => d.key)
    .join("circle")
    .attr("class", d => `cw-arms-hover-dot is-${d.key.toLowerCase()}`)
    .attr("r", 5)
    .style("opacity", 0);

  const bisectYear = d3.bisector(d => d.Year).left;

  function nearestDatum(year) {
    const i = bisectYear(data, year, 1);
    const d0 = data[Math.max(0, i - 1)];
    const d1 = data[Math.min(data.length - 1, i)];
    if (!d0) return d1;
    if (!d1) return d0;
    return year - d0.Year > d1.Year - year ? d1 : d0;
  }

  function tooltipHtml(d) {
    const usa = d.USA_Warheads ?? 0;
    const ussr = d.USSR_Warheads ?? 0;
    const difference = Math.abs(usa - ussr);
    const leader = usa === ussr ? null : usa > ussr ? "USA" : "USSR";
    const leaderLabel = leader === "USA" ? "USA lead" : leader === "USSR" ? "USSR lead" : "Difference";

    return `
      <div class="cw-tooltip-title">${d.Year}</div>
      <div class="cw-tooltip-row${pinned && pinned !== "USA" ? " dimmed" : ""}">
        <span class="cw-tooltip-label"><span class="cw-tooltip-dot usa"></span>United States</span>
        <strong>${formatWarheads(usa)}</strong>
      </div>
      <div class="cw-tooltip-row${pinned && pinned !== "USSR" ? " dimmed" : ""}">
        <span class="cw-tooltip-label"><span class="cw-tooltip-dot ussr"></span>Soviet Union</span>
        <strong>${formatWarheads(ussr)}</strong>
      </div>
      <div class="cw-tooltip-divider"></div>
      <div class="cw-tooltip-row cw-tooltip-difference ${leader ? `is-${leader.toLowerCase()}` : ""}">
        <span>${leaderLabel}</span>
        <strong>${formatWarheads(difference)} warheads</strong>
      </div>`;
  }

  function updateHover(event) {
    const [px, py] = d3.pointer(event, svg.node());

    if (
      px < margin.left ||
      px > width - margin.right ||
      py < margin.top ||
      py > height - margin.bottom
    ) {
      hideTooltip(tooltip);
      hoverLine.style("opacity", 0);
      hoverDots.style("opacity", 0);
      return;
    }

    const d = nearestDatum(x.invert(px));
    if (!d) return;

    const hoverX = x(d.Year);
    hoverLine
      .attr("x1", hoverX)
      .attr("x2", hoverX)
      .style("opacity", 1);

    hoverDots
      .attr("cx", hoverX)
      .attr("cy", seriesDef => y(d[seriesDef.field] ?? 0))
      .style("opacity", 1);

    showTooltip(tooltip, event, tooltipHtml(d));
  }

  const interactionRect = svg
    .append("rect")
    .attr("class", "cw-arms-interaction-overlay")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "transparent")
    .attr("tabindex", 0)
    .attr("aria-label", "Move across the chart to inspect nuclear stockpiles by year")
    .on("mousemove", updateHover)
    .on("mouseout", () => {
      hideTooltip(tooltip);
      hoverLine.style("opacity", 0);
      hoverDots.style("opacity", 0);
    })
    .on("click", event => {
      event.stopPropagation();
      const [px, py] = d3.pointer(event, svg.node());
      const d = nearestDatum(x.invert(px));
      if (!d) return;

      const candidates = SERIES.filter(seriesDef => py >= y(d[seriesDef.field] ?? 0));
      if (!candidates.length) {
        pinned = null;
      } else {
        const closest = candidates.reduce((best, seriesDef) => {
          const distance = Math.abs(py - y(d[seriesDef.field] ?? 0));
          return !best || distance < best.distance ? { seriesDef, distance } : best;
        }, null)?.seriesDef;
        pinned = closest ? (pinned === closest.key ? null : closest.key) : null;
      }
      applyFocus();
      updateHover(event);
    });

  interactionRect.raise();
  hoverLayer.raise();

  svg.on("click", () => {
    pinned = null;
    applyFocus();
  });

  legendApi = createInteractiveLegend(
    ids.legendId,
    SERIES.map(d => ({ key: d.key, label: d.label, swatchClass: d.swatchClass })),
    {
      onToggle: key => {
        pinned = key;
        applyFocus();
      }
    }
  );

  applyFocus();
}
