import { createInteractiveLegend } from "../components/interactive-legend.js";
import {
  getColdWarTooltip,
  hideTooltip,
  showTooltip
} from "../components/tooltip.js";

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

/* Edit this set to show more or fewer of the configured callouts. */
const VISIBLE_CALLOUT_IDS = new Set([
  "soviet-atomic-test",
  "hydrogen-bombs",
  "cuban-missile-crisis",
  "salt-i",
  "moscow-boycott",
  "la-boycott",
  "gorbachev-takes-power",
  // "inf-treaty",
  // "soviet-union-collapses"
]);

/* Positions are intentionally hand-authored for editorial layout. */
const CALLOUTS = Object.freeze([
  {
    id: "soviet-atomic-test",
    year: 1949,
    lines: ["Soviet Union Tests", "Its First Atomic Bomb"],
    type: "historical",
    xOffset: 10,
    yPosition: 0.80,
    anchor: "start"
  },
  {
    id: "hydrogen-bombs",
    year: 1953,
    lines: ["United States and USSR", "Test Hydrogen Bombs"],
    type: "historical",
    xOffset: 10,
    yPosition: 0.48,
    anchor: "start"
  },
  {
    id: "cuban-missile-crisis",
    year: 1963,
    lines: ["Cuban Missile Crisis Leads", "to Test Ban Treaty"],
    type: "historical",
    xOffset: 10,
    yPosition: 0.18,
    anchor: "start"
  },
  {
    id: "salt-i",
    year: 1972,
    lines: ["SALT I Limits Strategic", "Nuclear Weapons"],
    type: "historical",
    xOffset: -10,
    yPosition: 0.58,
    anchor: "end"
  },
  {
    id: "moscow-boycott",
    year: 1980,
    lines: [
      "Soviet invasion of Afghanistan",
      "prompts U.S. Boycott",
      "of Moscow Olympics"
    ],
    type: "boycott",
    xOffset: -10,
    yPosition: 0.26,
    anchor: "end"
  },
  {
    id: "la-boycott",
    year: 1984,
    lines: [
      "Soviet Union boycotts",
      "Los Angeles Olympics",
      "four years later"
    ],
    type: "boycott",
    xOffset: 10,
    yPosition: 0.72,
    anchor: "end"
  },
  {
    id: "gorbachev-takes-power",
    year: 1985,
    lines: [
      "Gorbachev Takes Power,",
      "Opening a New Era",
      "of Arms Control"
    ],
    type: "historical",
    xOffset: 10,
    yPosition: 0.05,
    anchor: "start"
  },

  {
    id: "inf-treaty",
    year: 1987,
    lines: ["INF Treaty Bans an Entire", "Class of Missiles"],
    type: "historical",
    xOffset: -10,
    yPosition: 0.05,
    anchor: "end"
  },
  {
    id: "soviet-union-collapses",
    year: 1991,
    lines: [
      "The Soviet Union Collapses,",
      "Bringing the Cold War",
      "Arms Race to a Close"
    ],
    type: "historical",
    xOffset: -10,
    yPosition: 0.48,
    anchor: "end"
  },
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

  const maxWarheads =
    d3.max(data, d => Math.max(d.USA_Warheads ?? 0, d.USSR_Warheads ?? 0)) ||
    1;

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

  const plot = svg.append("g").attr("class", "cw-arms-plot");
  let pinned = null;
  let pinnedCalloutId = null;
  let previewedCalloutId = null;
  let legendApi = null;
  let calloutInteractionLayer = null;

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

  const visibleCallouts = CALLOUTS.filter(d => VISIBLE_CALLOUT_IDS.has(d.id));

  const calloutLayer = svg
    .append("g")
    .attr("class", "cw-arms-callout-layer")
    .attr("pointer-events", "none");

  const callouts = calloutLayer
    .selectAll("g.cw-arms-callout")
    .data(visibleCallouts, d => d.id)
    .join("g")
    .attr("class", d => `cw-arms-callout is-${d.type}`);

  callouts
    .append("line")
    .attr("class", "cw-arms-callout-rule")
    .attr("x1", d => x(d.year))
    .attr("x2", d => x(d.year))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom);

  callouts.each(function(d) {
    const labelX = x(d.year) + d.xOffset;
    const labelY = margin.top + d.yPosition * innerHeight;

    const label = d3
      .select(this)
      .append("text")
      .attr("class", "cw-arms-callout-label")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("text-anchor", d.anchor);

    label.append("tspan").attr("class", "cw-arms-callout-year").text(d.year);

    d.lines.forEach((line, index) => {
      label
        .append("tspan")
        .attr("class", "cw-arms-callout-title")
        .attr("x", labelX)
        .attr("dy", index === 0 ? 16 : 13)
        .text(line);
    });
  });

  function applyCalloutState() {
    callouts
      .classed("is-pinned", d => d.id === pinnedCalloutId)
      .classed("is-previewed", d => d.id === previewedCalloutId);
  }

  function applyFocus() {
    groups
      .classed("is-pinned", d => pinned === d.key)
      .classed("is-dimmed", d => Boolean(pinned && pinned !== d.key));

    if (pinned) {
      groups.filter(d => d.key === pinned).raise();
    }

    interactionRect?.raise();
    hoverLayer.raise();
    calloutInteractionLayer?.raise();
    legendApi?.setActive(pinned);
  }

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

  const getCalloutForYear = year =>
    visibleCallouts.find(callout => callout.year === year) ?? null;

  function syncCalloutButtonState() {
    calloutInteractionLayer
      ?.selectAll("rect")
      .attr(
        "aria-pressed",
        d => (d.datum.id === pinnedCalloutId ? "true" : "false")
      );
  }

  function previewCallout(callout) {
    previewedCalloutId = callout?.id ?? null;
    applyCalloutState();
  }

  function clearCalloutPreview() {
    previewedCalloutId = null;
    applyCalloutState();
  }

  function toggleCalloutPin(callout) {
    pinnedCalloutId =
      pinnedCalloutId === callout.id ? null : callout.id;

    previewedCalloutId = null;
    applyCalloutState();
    syncCalloutButtonState();
  }

  function hideInspection() {
    hideTooltip(tooltip);
    hoverLine.style("opacity", 0);
    hoverDots.style("opacity", 0);
  }

  /*
   * Both chart years and callout labels use inspectDatum().
   * A callout is therefore another way to inspect its exact chart year.
   */
  function inspectCallout(event, callout) {
    inspectDatum(event, nearestDatum(callout.year));
  }

  function tooltipHtml(d) {
    const usa = d.USA_Warheads ?? 0;
    const ussr = d.USSR_Warheads ?? 0;
    const difference = Math.abs(usa - ussr);
    const leader = usa === ussr ? null : usa > ussr ? "USA" : "USSR";
    const leaderLabel =
      leader === "USA"
        ? "USA lead"
        : leader === "USSR"
          ? "USSR lead"
          : "Difference";

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

  function inspectDatum(event, d) {
    if (!d) return;

    const callout = getCalloutForYear(d.Year);
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
    previewCallout(callout);
  }

  function updateHover(event) {
    const [px, py] = d3.pointer(event, svg.node());

    if (
      px < margin.left ||
      px > width - margin.right ||
      py < margin.top ||
      py > height - margin.bottom
    ) {
      hideInspection();
      clearCalloutPreview();
      return;
    }

    const d = nearestDatum(x.invert(px));
    if (!d) return;

    inspectDatum(event, d);
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
    .attr(
      "aria-label",
      "Move across the chart to inspect nuclear stockpiles by year"
    )
    .on("mousemove", updateHover)
    .on("mouseout", () => {
      hideInspection();
      clearCalloutPreview();
    })
    .on("click", event => {
      event.stopPropagation();

      const [px, py] = d3.pointer(event, svg.node());
      const d = nearestDatum(x.invert(px));

      if (!d) return;

      const candidates = SERIES.filter(
        seriesDef => py >= y(d[seriesDef.field] ?? 0)
      );

      if (!candidates.length) {
        pinned = null;
      } else {
        const closest = candidates.reduce((best, seriesDef) => {
          const distance = Math.abs(py - y(d[seriesDef.field] ?? 0));

          return !best || distance < best.distance
            ? { seriesDef, distance }
            : best;
        }, null)?.seriesDef;

        pinned = closest ? (pinned === closest.key ? null : closest.key) : null;
      }

      const callout = getCalloutForYear(d.Year);

      if (callout) {
        toggleCalloutPin(callout);
      }

      applyFocus();
      updateHover(event);
    });

  interactionRect.raise();
  hoverLayer.raise();

  /*
   * These compact rectangles sit over callout labels only.
   * They are independent from the full-height vertical rules.
   */
  calloutInteractionLayer = svg
    .append("g")
    .attr("class", "cw-arms-callout-interaction-layer");

  calloutInteractionLayer
    .selectAll("rect")
    .data(
      callouts.nodes().map((node, index) => ({
        node,
        datum: visibleCallouts[index]
      })),
      d => d.datum.id
    )
    .join("rect")
    .attr("class", "cw-arms-callout-hit-target")
    .attr("fill", "#000")
    .attr("fill-opacity", 0.001)
    .style("pointer-events", "all")
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr(
      "aria-pressed",
      d => (d.datum.id === pinnedCalloutId ? "true" : "false")
    )
    .attr("aria-label", d => `${d.datum.year}: ${d.datum.lines.join(" ")}`)
    .each(function(d) {
      const box = d3
        .select(d.node)
        .select(".cw-arms-callout-label")
        .node()
        .getBBox();

      d3.select(this)
        .attr("x", box.x - 8)
        .attr("y", box.y - 8)
        .attr("width", box.width + 16)
        .attr("height", box.height + 16);
    })
    .on("pointerenter", (event, d) => {
      inspectCallout(event, d.datum);
    })
    .on("pointermove", (event, d) => {
      inspectCallout(event, d.datum);
    })
    .on("pointerleave", (_, d) => {
      clearCalloutPreview();

      if (pinnedCalloutId !== d.datum.id) {
        hideInspection();
      }
    })
    .on("focus", (event, d) => {
      inspectCallout(event, d.datum);
    })
    .on("blur", (_, d) => {
      clearCalloutPreview();

      if (pinnedCalloutId !== d.datum.id) {
        hideInspection();
      }
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      toggleCalloutPin(d.datum);
      inspectCallout(event, d.datum);
    })
    .on("keydown", (event, d) => {
      if (event.key !== "Enter" && event.key !== " ") return;

      event.preventDefault();
      event.stopPropagation();

      toggleCalloutPin(d.datum);
      inspectCallout(event, d.datum);
    });

  svg.on("click", () => {
    pinned = null;
    pinnedCalloutId = null;
    previewedCalloutId = null;

    hideInspection();
    applyFocus();
    applyCalloutState();
  });

  legendApi = createInteractiveLegend(
    ids.legendId,
    SERIES.map(d => ({
      key: d.key,
      label: d.label,
      swatchClass: d.swatchClass
    })),
    {
      onToggle: key => {
        pinned = key;
        applyFocus();
      }
    }
  );

  applyFocus();
  applyCalloutState();
}