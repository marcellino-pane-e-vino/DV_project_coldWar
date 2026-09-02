import { COLD_WAR_EDITIONS, CW_DEFAULTS } from "../core/config.js";
import { createLegendFocus } from "../components/legend-focus.js";
import { renderBoycottMarkers } from "../components/boycott-marker.js";
import { applyCityYearTicks } from "../utils/olympic-axis.js";

const d3 = globalThis.d3;

/**
 * Battle Strip — Local Ripple.
 * The module owns the complete chart implementation and uses only the shared
 * project components for legends, boycott markers and Olympic axis labels.
 */
export function createWhoWonBattleStrip(data, ids) {
  const state = {
    metric: "total",
    hasAnimated: false,
    hoveredYear: null,
    pinnedYear: null
  };

  const width = 1080;
  const height = 560;
  const markerY = 220;
  const axisY = 344;
  const bounds = { left: 70, right: width - 70 };
  const focusRadius = 94;
  const boycottLabelClearance = 96;
  const boycottLabelY = markerY - focusRadius - 20; 
  const axisLabelHalfWidths = new Map([[1956, 72]]);
  function axisLabelHalfWidth(year) {
    return axisLabelHalfWidths.get(year) || 30;
  }
  function requiredFocusSeparation(year) {
    return Math.max(
      focusRadius + 43,
      focusRadius + axisLabelHalfWidth(year) + 12
    );
  }
  const container = d3.select(`#${ids.containerId}`);

  if (container.empty()) throw new Error(`Missing Battle Strip container #${ids.containerId}`);

  const svg = container
    .append("svg")
    .attr("class", "cw-chart-theme-universal cw-battle-local-ripple cw-battle-ripple-svg cw-battle-variant")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Who Won the Olympic Cold War: Local Ripple. Hover or click an edition to expand it in place while nearby Olympic editions are smoothly repelled.");

  const baseX = d3.scalePoint()
    .domain(COLD_WAR_EDITIONS.map(String))
    .range([bounds.left, bounds.right])
    .padding(0.28);

  const byYear = new Map();
  data.forEach(row => {
    const record = byYear.get(row.Year) || { Year: row.Year, City: row.City };
    record[row.NOC === "USA" ? "usa" : "ussr"] = row;
    byYear.set(row.Year, record);
  });

  const rows = COLD_WAR_EDITIONS.map(year => byYear.get(year)).filter(Boolean);
  const cityByYear = new Map(rows.map(row => [row.Year, row.City]));
  cityByYear.set(1956, "Melbourne");
  cityByYear.set(1980, "Moscow");
  cityByYear.set(1984, "Los Angeles");

  // One quantitative scale is shared by both menu modes so equal medal
  // margins always produce equal circle areas.
  const sharedMaxMargin = d3.max(
    rows.flatMap(row => {
      if (isBoycottRow(row)) return [];
      return ["TotalMedals", "GoldMedals"]
        .map(field => Math.abs(row.usa?.[field] - row.ussr?.[field]))
        .filter(Number.isFinite);
    })
  ) || 1;
  const radius = d3.scaleSqrt().domain([0, sharedMaxMargin]).range([9, 26]);

  svg.append("line")
    .attr("class", "cw-battle-baseline")
    .attr("x1", baseX(String(COLD_WAR_EDITIONS[0])))
    .attr("x2", baseX(String(COLD_WAR_EDITIONS[COLD_WAR_EDITIONS.length - 1])))
    .attr("y1", markerY)
    .attr("y2", markerY);

  const summaryLayer = svg.append("g").attr("class", "cw-battle-summary");
  const pointLayer = svg.append("g").attr("class", "cw-battle-point-layer");
  const boycottLayer = svg.append("g").attr("class", "cw-battle-boycott-layer");
  const focusLayer = svg.append("g").attr("class", "cw-battle-focus-layer").attr("pointer-events", "none");
  const sizeLegendLayer = svg.append("g").attr("class", "cw-battle-size-legend");

  const xAxis = svg.append("g")
    .attr("class", "cw-axis cw-axis-x cw-battle-x-axis")
    .attr("transform", `translate(0,${axisY})`)
    .call(d3.axisBottom(baseX).tickSize(0).tickPadding(12));

  applyCityYearTicks(xAxis, cityByYear, { line2Dy: 15, emphasizeYears: [1980, 1984] });
  xAxis.selectAll(".tick").each(function(year) {
    const cityLabel = this.querySelector("tspan:first-child");
    const width = cityLabel?.getComputedTextLength?.();
    if (Number.isFinite(width) && width > 0) {
      axisLabelHalfWidths.set(+year, width / 2);
    }
  });
  xAxis.select(".domain").remove();

  let currentRows = [];

  let previousLegendKey = null;
  let legendAnimationId = 0;
  const focusController = createLegendFocus({
    legendId: ids.legendId,
    items: [
      { key: "USA", label: "United States", swatchClass: "usa" },
      { key: "URS", label: "Soviet Union", swatchClass: "ussr" }
    ],
    targetGroups: [
      {
        selection: () => pointLayer.selectAll(".cw-battle-point"),
        key: d => d.winnerNoc
      },
      {
        selection: () => focusLayer.selectAll(".cw-battle-focus"),
        key: d => d.winnerNoc
      }
    ],
    onChange: activeKey => animateLegendFocus(activeKey)
  });

  function isBoycottRow(row) {
    return [row.usa, row.ussr].some(mark => mark?.ParticipationStatus === "boycott");
  }

  function boycottLabel(row) {
    if (row.usa?.ParticipationStatus === "boycott") return "USA boycott";
    if (row.ussr?.ParticipationStatus === "boycott") return "USSR boycott";
    return "Boycott";
  }

  function derivedRows() {
    const field = state.metric === "gold" ? "GoldMedals" : "TotalMedals";
    return rows.map(row => {
      if (isBoycottRow(row)) return { ...row, isBoycott: true, label: boycottLabel(row) };

      const usaValue = row.usa?.[field];
      const ussrValue = row.ussr?.[field];
      if (!Number.isFinite(usaValue) || !Number.isFinite(ussrValue)) {
        return { ...row, isBoycott: false, isComparable: false };
      }

      const diff = usaValue - ussrValue;
      return {
        ...row,
        isBoycott: false,
        isComparable: true,
        usaValue,
        ussrValue,
        diff,
        margin: Math.abs(diff),
        winnerNoc: diff > 0 ? "USA" : diff < 0 ? "URS" : "DRAW"
      };
    });
  }

  function activeYear() {
    return state.pinnedYear ?? state.hoveredYear;
  }

  function distribute(years, start, end) {
    const positions = new Map();
    if (!years.length) return positions;
    if (years.length === 1) {
      positions.set(years[0], (start + end) / 2);
      return positions;
    }
    const scale = d3.scalePoint().domain(years.map(String)).range([start, end]).padding(0.12);
    years.forEach(year => positions.set(year, scale(String(year))));
    return positions;
  }

  function rippleLayout(year) {
    const selectedYear = activeYear();
    if (selectedYear == null) return baseX(String(year));

    const selectedBaseX = baseX(String(selectedYear));
    const selectedIndex = COLD_WAR_EDITIONS.indexOf(selectedYear);
    const leftYears = COLD_WAR_EDITIONS.slice(0, selectedIndex);
    const rightYears = COLD_WAR_EDITIONS.slice(selectedIndex + 1);

    function requiredContextGap(leftYear, rightYear) {
      const leftIsBoycott = isBoycottRow(byYear.get(leftYear));
      const rightIsBoycott = isBoycottRow(byYear.get(rightYear));

      const labelClearance =
        axisLabelHalfWidth(leftYear) +
        axisLabelHalfWidth(rightYear) +
        12;

      const boycottClearance = leftIsBoycott || rightIsBoycott
        ? boycottLabelClearance
        : 0;

      return Math.max(
        58,
        labelClearance,
        boycottClearance
      );
    }

    function requiredSideWidth(years, side) {
      if (!years.length) return 0;

      const orderedYears = side === "left"
        ? [...years].reverse()
        : years;

      let widthNeeded = requiredFocusSeparation(orderedYears[0]);

      for (let index = 1; index < orderedYears.length; index += 1) {
        widthNeeded += requiredContextGap(
          orderedYears[index - 1],
          orderedYears[index]
        );
      }

      return widthNeeded;
    }

    const leftRequiredWidth = requiredSideWidth(leftYears, "left");
    const rightRequiredWidth = requiredSideWidth(rightYears, "right");
    const selectedX = Math.max(
      bounds.left + focusRadius + 10,
      bounds.left + leftRequiredWidth,
      Math.min(
        bounds.right - focusRadius - 10,
        bounds.right - rightRequiredWidth,
        selectedBaseX
      )
    );
    const positions = new Map([[selectedYear, selectedX]]);

    let previous = selectedX;
    rightYears.forEach((candidateYear, index) => {
      const originalX = baseX(String(candidateYear));
      const distance = Math.abs(originalX - selectedBaseX);
      const influencedX = originalX + (selectedX - selectedBaseX) * Math.exp(-distance / 155);
      const lowerBound = index === 0
        ? selectedX + requiredFocusSeparation(candidateYear)
        : previous + requiredContextGap(
          rightYears[index - 1],
          candidateYear
        );
      const position = Math.max(influencedX, lowerBound);
      positions.set(candidateYear, position);
      previous = position;
    });

    let next = selectedX;
    [...leftYears].reverse().forEach((candidateYear, index) => {
      const originalX = baseX(String(candidateYear));
      const distance = Math.abs(originalX - selectedBaseX);
      const influencedX = originalX + (selectedX - selectedBaseX) * Math.exp(-distance / 155);
      const upperBound = index === 0
        ? selectedX - requiredFocusSeparation(candidateYear)
        : next - requiredContextGap(
          candidateYear,
          leftYears[leftYears.length - index]
        );
      const position = Math.min(influencedX, upperBound);
      positions.set(candidateYear, position);
      next = position;
    });

    return positions.get(year);
  }


  function drawSizeLegend({ duration = 0 } = {}) {
    const values = state.metric === "gold" ? [5, 10, 15] : [10, 20, 30];
    const unit = state.metric === "gold" ? "Gold medal difference" : "Medal difference";
    const items = sizeLegendLayer.selectAll("g.cw-battle-size-item")
      // Keep the three visual positions stable across metrics so their circles
      // can interpolate from one reference value to the next.
      .data(values)
      .join(enter => {
        const group = enter.append("g").attr("class", "cw-battle-size-item");
        group.append("circle");
        group.append("text");
        return group;
      })
      .attr("transform", (d, i) => `translate(${48 + i * 76},485)`);

    const itemTransition = duration > 0
      ? items.transition("battle-size-legend").duration(duration).ease(d3.easeCubicOut)
      : items;

    itemTransition.select("circle")
      .attr("cy", d => -radius(d))
      .attr("r", d => radius(d));
    items.select("text")
      .attr("x", 0)
      .attr("y", 18)
      .attr("text-anchor", "middle")
      .text(d => d);

    sizeLegendLayer.selectAll("text.cw-battle-size-title")
      .data([null])
      .join("text")
      .attr("class", "cw-battle-size-title")
      .attr("x", 48)
      .attr("y", 430)
    sizeLegendLayer.selectAll("text.cw-battle-size-unit")
      .data([null])
      .join("text")
      .attr("class", "cw-battle-size-unit")
      .attr("x", 48)
      .attr("y", 530)
      .text(unit);
  }

  function pointLabel(d) {
    const winner = d.winnerNoc === "USA" ? "United States" : d.winnerNoc === "URS" ? "Soviet Union" : "Draw";
    const unit = state.metric === "gold" ? "gold medals" : "medals";
    return `${d.City} ${d.Year}. ${winner} won by ${d.margin} ${unit}. USA ${d.usaValue}, USSR ${d.ussrValue}.`;
  }

  function setHovered(year) {
    if (state.pinnedYear != null || state.hoveredYear === year) return;
    state.hoveredYear = year;
    updateFocusLayout();
  }

  function clearHovered(year) {
    if (state.pinnedYear != null || state.hoveredYear !== year) return;
    state.hoveredYear = null;
    updateFocusLayout();
  }

  function togglePinned(year) {
    state.pinnedYear = state.pinnedYear === year ? null : year;
    state.hoveredYear = null;
    updateFocusLayout();
  }

  function bindPointEvents(points) {
    points
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", pointLabel)
      .attr("aria-pressed", d => String(state.pinnedYear === d.Year))
      .on("pointerenter", (event, d) => setHovered(d.Year))
      .on("pointerleave", (event, d) => clearHovered(d.Year))
      .on("focus", (event, d) => setHovered(d.Year))
      .on("blur", (event, d) => clearHovered(d.Year))
      .on("click", (event, d) => {
        event.stopPropagation();
        togglePinned(d.Year);
      })
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          togglePinned(d.Year);
        } else if (event.key === "Escape") {
          state.pinnedYear = null;
          state.hoveredYear = null;
          updateFocusLayout();
        }
      });
  }

  function drawFocus(active, duration) {
    const focus = focusLayer.selectAll("g.cw-battle-focus")
      .data(active ? [active] : [], d => d.Year)
      .join(
        enter => {
          const group = enter.append("g").attr("class", "cw-battle-focus").attr("opacity", 0);
          group.append("circle").attr("class", "cw-battle-focus-inner").attr("r", focusRadius - 40);
          group.append("g").attr("class", "cw-battle-focus-donut");
          group.append("g").attr("class", "cw-battle-focus-donut-labels");
          group.append("text")
            .attr("class", "cw-battle-focus-margin")
            .attr("text-anchor", "middle")
            .attr("x", 0)
            .attr("y", 0)
            .attr("dominant-baseline", "middle");
          return group;
        },
        update => update,
        exit => exit.transition().duration(140).attr("opacity", 0).remove()
      )
      .classed("is-usa", d => d.winnerNoc === "USA")
      .classed("is-ussr", d => d.winnerNoc === "URS")
      .classed("is-draw", d => d.winnerNoc === "DRAW");

    // Set the final position before the fade begins. Previously the group was
    // created at SVG origin and transitioned to the selected point, producing
    // the misleading impression that its contents arrived from above.
    focus
      .attr("transform", d => `translate(${rippleLayout(d.Year)},${markerY})`)
      .transition()
      .duration(Math.min(duration, 180))
      .attr("opacity", 1);

    focus.each(function(d) {
      const group = d3.select(this);
      const pie = d3.pie().sort(null).value(item => item.value)([
        { noc: "USA", value: d.usaValue },
        { noc: "URS", value: d.ussrValue }
      ]);
      const arc = d3.arc().innerRadius(focusRadius - 39).outerRadius(focusRadius - 5);
      group.select(".cw-battle-focus-donut").selectAll("path")
        .data(pie, item => item.data.noc)
        .join("path")
        .attr("class", item => `cw-battle-donut-segment is-${item.data.noc === "USA" ? "usa" : "ussr"}`)
        .attr("d", arc);

      const labels = group.select(".cw-battle-focus-donut-labels")
        .selectAll("text.cw-battle-donut-label")
        .data(pie, item => item.data.noc)
        .join(enter => {
      const text = enter.append("text")
        .attr("class", "cw-battle-donut-label")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle");

      text.append("tspan")
        .attr("class", "cw-battle-donut-label-value");
          return text;
        })
      .attr("transform", item => {
        const [labelX, labelY] = arc.centroid(item);
        return `translate(${labelX},${labelY})`;
      });


      labels.select(".cw-battle-donut-label-value")
        .attr("x", 0)
        .attr("dy", 0)
        .text(item => item.data.value);

      group.select(".cw-battle-focus-margin").attr("x", 0).attr("y", 0).text(`+${d.margin}`);
    });

    focusController.refresh();
  }

  function updateFocusLayout({ duration = 360 } = {}) {
    const selectedYear = activeYear();
    const active = currentRows.find(d => d.Year === selectedYear) || null;
    const transition = svg.transition("ripple-focus").duration(duration).ease(d3.easeCubicOut);

    svg.classed("has-battle-focus", Boolean(active));

    const points = pointLayer.selectAll("circle.cw-battle-point")
      .classed("is-expanded", d => active?.Year === d.Year)
      .classed("is-context", d => Boolean(active) && active.Year !== d.Year)
      .attr("aria-pressed", d => String(state.pinnedYear === d.Year));

    points.filter(d => active?.Year === d.Year).raise();
    points.transition(transition)
      .attr("cx", d => rippleLayout(d.Year))
      .attr("cy", markerY)
      .attr("r", d => active?.Year === d.Year ? focusRadius : radius(d.margin));

    xAxis.selectAll(".tick").transition(transition)
      .attr("transform", d => `translate(${rippleLayout(+d)},0)`);

    renderBoycottMarkers(
      boycottLayer,
      derivedRows().filter(d => d.isBoycott),
      {
        x: d => rippleLayout(d.Year) - 28,
        y: markerY - 36,
        width: 56,
        height: 72,
        label: d => d.label,
        labelX: d => rippleLayout(d.Year),
        labelY: boycottLabelY,
        transition
      }
    );

    drawFocus(active, duration);
  }

  function render({ initial = false } = {}) {
    const derived = derivedRows();
    currentRows = derived.filter(d => d.isComparable);

    drawSizeLegend({ duration: initial ? 0 : CW_DEFAULTS.transitionMs });

    const points = pointLayer.selectAll("circle.cw-battle-point")
      .data(currentRows, d => d.Year)
      .join(
        enter => enter.append("circle")
          .attr("class", "cw-battle-point")
          .attr("cx", d => baseX(String(d.Year)))
          .attr("cy", markerY)
          .attr("r", 0),
        update => update,
        exit => exit.remove()
      )
      .classed("is-usa", d => d.winnerNoc === "USA")
      .classed("is-ussr", d => d.winnerNoc === "URS")
      .classed("is-draw", d => d.winnerNoc === "DRAW");

    bindPointEvents(points);
    focusController.refresh();
    updateFocusLayout({ duration: initial ? 0 : CW_DEFAULTS.transitionMs });

    if (!state.hasAnimated) points.attr("r", 0);
  }

  function playInitialAnimation() {
    if (state.hasAnimated) return;
    state.hasAnimated = true;
    pointLayer.selectAll("circle.cw-battle-point")
      .transition("ripple-entry")
      .delay((d, i) => i * 70)
      .duration(520)
      .ease(d3.easeBackOut.overshoot(0.8))
      .attr("r", d => radius(d.margin));
  }

  function watchEntrance() {
    const host = container.node();
    if (!host) return;
    let observer = null;
    const cleanup = () => {
      observer?.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
    const reveal = () => {
      if (state.hasAnimated) return;
      cleanup();
      playInitialAnimation();
    };
    const check = () => {
      if (state.hasAnimated) return;
      const rect = host.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top <= viewportHeight * 0.92 && rect.bottom >= viewportHeight * 0.08) reveal();
    };
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) reveal();
      }, { threshold: [0, 0.05], rootMargin: "0px 0px -8% 0px" });
      observer.observe(host);
    }
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    requestAnimationFrame(check);
  }

  document.getElementById(ids.metricSelectId)?.addEventListener("change", event => {
    state.metric = event.target.value;
    state.hoveredYear = null;
    render();
  });

  svg.on("click", event => {
    if (!event.target.closest?.(".cw-battle-point") && state.pinnedYear != null) {
      state.pinnedYear = null;
      updateFocusLayout();
    }
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.pinnedYear != null) {
      state.pinnedYear = null;
      state.hoveredYear = null;
      updateFocusLayout();
    }
  });

  render({ initial: true });
  watchEntrance();
}
