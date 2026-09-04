import { COLD_WAR_EDITIONS, CW_DEFAULTS } from "../core/config.js";
import {
  getColdWarTooltip,
  hideTooltip,
  moveTooltip,
  showTooltip
} from "../components/tooltip.js";
import { createLegendFocus } from "../components/legend-focus.js";
import { renderBoycottMarkers } from "../components/boycott-marker.js";
import { applyCityYearTicks } from "../utils/olympic-axis.js";
import { createMultiToggle } from "../components/multi-toggle.js";

const d3 = globalThis.d3;
const WINNER_ORDER = Object.freeze({ USA: 0, USSR: 1, DRAW: 2 });

function encounterComparator(a, b) {
  return (
    d3.ascending(WINNER_ORDER[a.Winner] ?? 9, WINNER_ORDER[b.Winner] ?? 9) ||
    d3.ascending(a.Sport, b.Sport) ||
    d3.ascending(a.Event, b.Event) ||
    d3.ascending(a.EncounterId, b.EncounterId)
  );
}

function formatScore(value) {
  return Number.isInteger(value) ? String(value) : d3.format("~g")(value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function isGenericCountryMatchup(d) {
  const normalize = value => String(value ?? "").trim().toLowerCase();
  return (
    ["usa", "united states"].includes(normalize(d.USAParticipant)) &&
    ["ussr", "soviet union"].includes(normalize(d.USSRParticipant))
  );
}

function scoreMarkup(d) {
  if (!Number.isFinite(d.USAScore) || !Number.isFinite(d.USSRScore)) {
    return "";
  }

  return `
    <div class="cw-tooltip-row">
      <span>Final score</span>
      <strong>USA ${formatScore(d.USAScore)} – ${formatScore(d.USSRScore)} USSR</strong>
    </div>`;
}

function rivalryTooltipHtml(d) {
  const stage = d.StageNormalized || d.StageRaw || "";
  const usaParticipant = escapeHtml(d.USAParticipant);
  const ussrParticipant = escapeHtml(d.USSRParticipant);
  const winner =
    d.Winner === "USA"
      ? { label: usaParticipant, className: "is-usa" }
      : d.Winner === "USSR"
        ? { label: ussrParticipant, className: "is-ussr" }
        : { label: "Draw", className: "is-draw" };
  const participants = isGenericCountryMatchup(d)
    ? ""
    : `<div class="cw-rivalry-tooltip-participants">
        <span class="cw-rivalry-tooltip-participant is-usa">${usaParticipant}</span>
        <span class="cw-rivalry-tooltip-versus">vs</span>
        <span class="cw-rivalry-tooltip-participant is-ussr">${ussrParticipant}</span>
      </div>`;

  return `
    <div class="cw-tooltip-title">${escapeHtml(d.Sport)}</div>
    <div class="cw-tooltip-subtitle">${escapeHtml(d.Event)}</div>
    ${participants}
    <div class="cw-tooltip-divider"></div>
    ${scoreMarkup(d)}
    <div class="cw-tooltip-row"><span>Winner</span><strong class="cw-rivalry-tooltip-winner ${winner.className}">${winner.label}</strong></div>
    ${stage ? `<div class="cw-tooltip-row"><span>Stage</span><strong>${escapeHtml(stage)}</strong></div>` : ""}`;
}

export function createRivalryPulse(data, ids) {
  const state = { types: new Set(["individual", "team"]), sport: "all" };
  const container = d3.select(`#${ids.containerId}`);
  const tooltip = getColdWarTooltip();

  const width = 1080;
  const height = 560;
  const margin = { top: 58, right: 38, bottom: 86, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container
    .append("svg")
    .attr("class", "cw-chart-theme-universal cw-pulse-svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Verified direct USA-Soviet Olympic encounters by Summer edition");

  const sports = [...new Set(data.map(d => d.Sport))].sort(d3.ascending);
  document.getElementById(ids.sportSelectId).innerHTML =
    '<option value="all">All sports</option>' +
    sports.map(sport => `<option value="${sport}">${sport}</option>`).join("");

  const cityByYear = new Map(
    [...d3.group(data, d => d.Year)].map(([year, rows]) => [year, rows[0].City])
  );
  cityByYear.set(1980, "Moscow");
  cityByYear.set(1984, "Los Angeles");

  const globalCounts = d3.rollup(data, rows => rows.length, d => d.Year);
  const globalMaxStack =
    d3.max(COLD_WAR_EDITIONS, year => globalCounts.get(year) || 0) || 1;

  const x = d3
    .scalePoint()
    .domain(COLD_WAR_EDITIONS.map(String))
    .range([margin.left, width - margin.right])
    .padding(0.5);

  // Fixed for the lifetime of the visualization: filters never rescale Y.
  const y = d3
    .scaleLinear()
    .domain([0, globalMaxStack])
    .nice(6)
    .range([height - margin.bottom, margin.top]);

  const yTicks = y.ticks(6).filter(Number.isInteger);

  svg
    .append("g")
    .attr("class", "cw-grid cw-pulse-y-grid")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3
        .axisLeft(y)
        .tickValues(yTicks)
        .tickSize(-innerWidth)
        .tickFormat("")
    )
    .lower();

  const xAxis = svg
    .append("g")
    .attr("class", "cw-axis cw-axis-x cw-pulse-x-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickSize(0).tickPadding(12));

  applyCityYearTicks(xAxis, cityByYear, {
    line2Dy: 15,
    emphasizeYears: [1980, 1984]
  });

  xAxis
    .selectAll("line")
    .attr("class", "cw-pulse-grid-line")
    .attr("y2", -innerHeight);
  xAxis.select(".domain").remove();

  const boycottLayer = svg.append("g").attr("class", "cw-pulse-boycott-layer");
  renderBoycottMarkers(
    boycottLayer,
    [
      { Year: 1980, label: "USA boycott" },
      { Year: 1984, label: "USSR boycott" }
    ],
    {
      x: d => x(String(d.Year)) - 44,
      y: margin.top,
      width: 88,
      height: innerHeight,
      labelX: d => x(String(d.Year)),
      labelY: margin.top + 18
    }
  );

  const yAxis = svg
    .append("g")
    .attr("class", "cw-axis cw-axis-y cw-pulse-y-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3
        .axisLeft(y)
        .tickValues(yTicks)
        .tickSize(0)
        .tickPadding(10)
        .tickFormat(d3.format("d"))
    );
  yAxis.select(".domain").remove();

  svg
    .append("text")
    .attr("class", "cw-axis-label")
    .attr("x", margin.left)
    .attr("y", 28)
    .attr("text-anchor", "middle")
    .text("Direct encounters");

  const dotLayer = svg.append("g").attr("class", "cw-pulse-dot-layer");

  const focusController = createLegendFocus({
    legendId: ids.legendId,
    items: [
      { key: "USA", label: "USA win", swatchClass: "usa" },
      { key: "USSR", label: "USSR win", swatchClass: "ussr" },
      { key: "DRAW", label: "Draw", swatchClass: "draw" }
    ],
    targetGroups: [
      {
        selection: () => dotLayer.selectAll("path.cw-pulse-dot"),
        key: d => d.Winner
      }
    ]
  });

  function typeFilteredRows() {
    return data.filter(d => state.types.has(d.EncounterType));
  }

  function isSelectedSport(d) {
    return state.sport === "all" || d.Sport === state.sport;
  }

  function positionedRows() {
    // Keep every encounter matching the encounter-type filter in the layout.
    // The sport menu is a focus control: it fades unrelated dots instead of
    // removing them, preserving the full edition-by-edition context.
    const groups = d3.group(typeFilteredRows(), d => d.Year);
    const positioned = [];

    COLD_WAR_EDITIONS.forEach(year => {
      const rows = [...(groups.get(year) || [])].sort(encounterComparator);
      rows.forEach((row, index) => positioned.push({ ...row, stack: index + 1 }));
    });

    return positioned;
  }

  function render() {
    const positioned = positionedRows();
    const transition = svg
      .transition("pulse-layout")
      .duration(CW_DEFAULTS.transitionMs)
      .ease(d3.easeCubicOut);

    const dots = dotLayer
      .selectAll("path.cw-pulse-dot")
      .data(positioned, d => d.EncounterId)
      .join(
        enter =>
          enter
            .append("path")
            .attr("class", "cw-pulse-dot")
            .attr("d", d3.symbol().size(0))
            .attr("transform", d => `translate(${x(String(d.Year))},${y(0)})`)
            .attr("opacity", 0),
        update => update,
        exit =>
          exit
            .transition(transition)
            .attr("transform", d => `translate(${x(String(d.Year))},${y(0)})`)
            .attr("d", d3.symbol().size(0))
            .attr("opacity", 0)
            .remove()
      )
      .attr("class", d => {
        const outcomeClass =
          d.Winner === "USA"
            ? "is-usa-win"
            : d.Winner === "USSR"
              ? "is-ussr-win"
              : "is-draw";
        const sportClass = isSelectedSport(d) ? "" : " is-sport-dimmed";
        return `cw-pulse-dot ${outcomeClass}${sportClass}`;
      })
      .on("mouseover", (event, d) => {
        const opacity = isSelectedSport(d) ? 0.7 : 0.126;

        d3.select(event.currentTarget)
          .attr("fill-opacity", opacity)
          .attr("stroke-opacity", opacity);

        showTooltip(tooltip, event, rivalryTooltipHtml(d));
      })
      .on("mousemove", event => moveTooltip(tooltip, event))
      .on("mouseout", (event, d) => {
        const opacity = isSelectedSport(d) ? 1 : 0.18;

        d3.select(event.currentTarget)
          .attr("fill-opacity", opacity)
          .attr("stroke-opacity", opacity);

        hideTooltip(tooltip);
      });

    dots
      .transition(transition)
      .attr("d", d => d3.symbol().type(d.EncounterType === "team" ? d3.symbolSquare : d3.symbolCircle).size(Math.PI * 5.8 ** 2)())
      .attr("transform", d => `translate(${x(String(d.Year))},${y(d.stack)})`)
      .attr("opacity", 1)
      // These two opacity channels preserve the existing legend-focus opacity
      // on the whole mark while making unselected sports visibly recede.
      .attr("fill-opacity", d => (isSelectedSport(d) ? 1 : 0.18))
      .attr("stroke-opacity", d => (isSelectedSport(d) ? 1 : 0.18));

    // Refresh immediately too, so focus remains coherent during layout updates.
    focusController.refresh();
  }

  createMultiToggle({
    containerId: ids.typeToggleId,
    label: "Encounter type",
    options: [
      { value: "individual", label: "Individual", symbol: "circle" },
      { value: "team", label: "Team", symbol: "square" }
    ],
    initialValues: state.types,
    onChange: values => { state.types = values; render(); }
  });

  document.getElementById(ids.sportSelectId).addEventListener("change", event => {
    state.sport = event.target.value;
    render();
  });

  render();
}
