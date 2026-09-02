import { CW_DEFAULTS } from "../core/config.js";
import {
  getColdWarTooltip,
  hideTooltip,
  moveTooltip,
  showTooltip
} from "../components/tooltip.js";

const d3 = globalThis.d3;

function comparator(metric) {
  return metric === "gold"
    ? (a, b) =>
        d3.descending(a.GoldMedals, b.GoldMedals) ||
        d3.descending(a.SilverMedals, b.SilverMedals) ||
        d3.descending(a.BronzeMedals, b.BronzeMedals) ||
        d3.ascending(a.Country, b.Country)
    : (a, b) =>
        d3.descending(a.TotalMedals, b.TotalMedals) ||
        d3.descending(a.GoldMedals, b.GoldMedals) ||
        d3.descending(a.SilverMedals, b.SilverMedals) ||
        d3.descending(a.BronzeMedals, b.BronzeMedals) ||
        d3.ascending(a.Country, b.Country);
}

/**
 * Medal Race
 *
 * The component renders directly in CSS-pixel coordinates rather than scaling
 * a large SVG into the narrow 36% panel.
 *
 * This preserves:
 * - readable typography;
 * - normal row height;
 * - normal bar thickness;
 * - readable rank/delegation columns.
 *
 * Only the quantitative bar range contracts when the available panel width
 * becomes smaller.
 *
 * The quantitative header is intentionally compact:
 * - no special "100 medals" reference;
 * - no dedicated reference line;
 * - no unused header row;
 * - only the moving x-axis and its ordinary dashed guides.
 */
export function createMedalRace(data, ids, callbacks = {}, options = {}) {
  const wrap = document.getElementById(ids.containerId);
  const strip = document.getElementById(ids.statusId);
  const tooltip = getColdWarTooltip();

  if (!wrap || !strip) {
    throw new Error(`Medal Race host not found for ${ids.containerId}.`);
  }

  const layoutMode = options.layoutMode || "wide";
  const showBoycottStatus = options.showBoycottStatus !== false;

  const rowH = options.rowHeight || 35;

  /*
   * Compact header.
   *
   * 31px is enough for:
   * - Rank / Delegation / Total medals labels;
   * - numerical x-axis ticks;
   * - small tick marks.
   *
   * The previous 44–66px header is no longer necessary.
   */
  const headerHeight = 31;

  const headerLabelY = 10;
  const axisY = headerHeight - 1;

  wrap.replaceChildren();

  const headerSvg = d3
    .select(wrap)
    .append("svg")
    .attr("class", "cw-medal-race-axis-svg")
    .attr("aria-hidden", "true");

  const bodySvg = d3
    .select(wrap)
    .append("svg")
    .attr("class", "cw-medal-race-body-svg")
    .attr("role", "img")
    .attr(
      "aria-label",
      "Olympic medal ranking with responsive quantitative bars"
    );

  const headerLabels = headerSvg
    .append("g")
    .attr("class", "cw-medal-header");

  const axisRoot = headerSvg
    .append("g")
    .attr("class", "cw-axis cw-medal-x-axis");

  const axisTitle = headerSvg
    .append("text")
    .attr("class", "cw-medal-axis-title");

  const gridLayer = bodySvg
    .append("g")
    .attr("class", "cw-medal-grid-layer");

  const rowLayer = bodySvg
    .append("g")
    .attr("class", "cw-medal-row-layer");

  let currentRows = [];
  let currentYear = null;

  let lastState = null;
  let lastLayout = null;

  let resizeFrame = null;
  let renderSequence = 0;

  /**
   * Measure the real Medal Race panel.
   *
   * No viewBox scaling is used. SVG coordinates correspond directly to CSS
   * pixels, so typography does not become microscopic in the narrow panel.
   */
  function measure() {
    const measuredWidth = Math.floor(wrap.clientWidth);
    const width = measuredWidth > 0 ? measuredWidth : 380;

    const rankX = 18;
    const countryX = 52;

    /*
     * Preserve a proper delegation-label area.
     *
     * In the final 64/36 layout, only the quantitative plotting range becomes
     * shorter.
     */
    const preferredLeft =
      layoutMode === "narrow-fixed"
        ? 220
        : 250;

    const right = 34;
    const minimumBarRegion = 44;

    const left = Math.min(
      preferredLeft,
      Math.max(
        170,
        width - right - minimumBarRegion
      )
    );

    const plotRight = Math.max(
      left + minimumBarRegion,
      width - right
    );

    return {
      width,
      rankX,
      countryX,
      left,
      right,
      plotRight,
      plotWidth: plotRight - left
    };
  }

  /**
   * Boycott information is kept outside the Medal Race encoding.
   *
   * A country that boycotted an edition does not receive an artificial
   * zero-medal row.
   */
  function updateStatus(year, selectedNoc) {
    // Set showBoycottStatus: false when constructing Medal Race to remove the
    // status strip completely. Because the strip remains `hidden`, it takes no
    // flex-space and the Medal Race automatically reclaims the full panel height.
    if (!showBoycottStatus) {
      strip.hidden = true;
      strip.textContent = "";
      strip.classList.remove("active");
      return;
    }

    const boycott = data.find(
      d =>
        d.Year === year &&
        d.ParticipationStatus === "boycott"
    );

    if (!boycott) {
      strip.hidden = true;
      strip.textContent = "";
      strip.classList.remove("active");
      return;
    }

    strip.hidden = false;

    strip.innerHTML =
      `<span class="cw-boycott-symbol" aria-hidden="true"></span>` +
      `<strong>${boycott.Country}</strong> did not participate — boycott`;

    strip.classList.toggle(
      "active",
      selectedNoc === boycott.NOC
    );
  }

  /**
   * Keep the font size fixed.
   *
   * Long delegation names are truncated only when the available label column
   * genuinely cannot contain them.
   */
  function truncateCountry(label, layout) {
    const available = Math.max(
      100,
      layout.left - layout.countryX - 12
    );

    const maxChars = Math.max(
      14,
      Math.floor(available / 6.1)
    );

    return label.length > maxChars
      ? `${label.slice(
          0,
          Math.max(12, maxChars - 1)
        )}…`
      : label;
  }

  /**
   * Compact Medal Race header.
   *
   * Layout:
   *
   * Rank  Delegation                  Total medals
   *                              0     50    100    150
   *                              ┆      ┆      ┆      ┆
   *
   * There is no special 100-medal annotation.
   */
  function configureHeader(
    layout,
    x,
    tickValues,
    duration
  ) {
    headerSvg
      .attr("width", layout.width)
      .attr("height", headerHeight);

    headerLabels
      .selectAll("text.cw-header-rank")
      .data([null])
      .join("text")
      .attr("class", "cw-header-rank")
      .attr("x", layout.rankX)
      .attr("y", headerLabelY)
      .attr("text-anchor", "start")
      .text("Rank");

    headerLabels
      .selectAll("text.cw-header-country")
      .data([null])
      .join("text")
      .attr("class", "cw-header-country")
      .attr("x", layout.countryX)
      .attr("y", headerLabelY)
      .attr("text-anchor", "start")
      .text("Delegation");

    axisTitle
      .attr("x", layout.left)
      .attr("y", headerLabelY)
      .attr("text-anchor", "start")
      .text("Total medals");

    /*
     * axisTop() draws the numerical labels above this baseline.
     *
     * Putting the baseline at y=30 allows us to use almost the entire compact
     * 31px header without leaving dead vertical space below it.
     */
    axisRoot.attr(
      "transform",
      `translate(0,${axisY})`
    );

    const axisTransition = headerSvg
      .transition(`medal-axis-${renderSequence}`)
      .duration(duration)
      .ease(d3.easeCubicOut);

    axisRoot
      .transition(axisTransition)
      .call(
        d3
          .axisTop(x)
          .tickValues(tickValues)
          .tickSize(3)
          .tickPadding(2)
          .tickFormat(d3.format("d"))
      );

    /*
     * No heavy horizontal baseline.
     *
     * The quantitative structure is communicated by the numerical ticks and
     * corresponding dashed vertical guides in the chart body.
     */
    axisRoot
      .select(".domain")
      .remove();

  }

  /**
   * Extend the ordinary x-axis ticks into the Medal Race body.
   *
   * These are normal quantitative guides, not special reference lines.
   */
  function configureGuides(
    x,
    tickValues,
    bodyHeight,
    duration
  ) {
    const transition = bodySvg
      .transition(`medal-guides-${renderSequence}`)
      .duration(duration)
      .ease(d3.easeCubicOut);

    /*
     * Zero does not need a separate vertical guide because the left edge of
     * every bar already establishes the zero baseline.
     */
    const gridValues = tickValues.filter(
      value => value > 0
    );

    gridLayer
      .selectAll("line.cw-medal-grid-line")
      .data(gridValues, d => d)
      .join(
        enter =>
          enter
            .append("line")
            .attr("class", "cw-medal-grid-line")
            .attr("x1", d => x(d))
            .attr("x2", d => x(d))
            .attr("y1", 0)
            .attr("y2", bodyHeight)
            .attr("opacity", 0)
            .call(selection =>
              selection
                .transition(transition)
                .attr("opacity", 1)
            ),

        update =>
          update.call(selection =>
            selection
              .transition(transition)
              .attr("x1", d => x(d))
              .attr("x2", d => x(d))
              .attr("y1", 0)
              .attr("y2", bodyHeight)
              .attr("opacity", 1)
          ),

        exit =>
          exit.call(selection =>
            selection
              .transition(transition)
              .attr("opacity", 0)
              .remove()
          )
      );
  }

  function render(
    state,
    { animate = true } = {}
  ) {
    renderSequence += 1;

    lastState = { ...state };
    currentYear = state.year;

    /*
     * Medal Race contains only delegations that actually won medals.
     *
     * No "no medals" encoding is used here.
     */
    currentRows = data
      .filter(
        d =>
          d.Year === state.year &&
          d.ParticipationStatus === "participated" &&
          (d.TotalMedals ?? 0) > 0
      )
      .sort(comparator(state.metric))
      .map((d, index) => ({
        ...d,
        rank: index + 1
      }));

    const layout = measure();

    lastLayout = layout;

    const bodyHeight = Math.max(
      currentRows.length * rowH + 8,
      rowH + 8
    );

    bodySvg
      .attr("width", layout.width)
      .attr("height", bodyHeight);

    const observedMax =
      d3.max(
        currentRows,
        d => d.TotalMedals
      ) || 1;

    /*
     * Dynamic scale:
     *
     * every Olympic edition gets an x-domain derived from its actual medal
     * maximum. This makes the quantitative context visibly change over time.
     */
    const x = d3
      .scaleLinear()
      .domain([0, observedMax])
      .nice(4)
      .range([
        layout.left,
        layout.plotRight
      ]);

    /*
     * Keep tick density appropriate for the available physical bar range.
     */
    const tickValues = x.ticks(
      layout.plotWidth < 180
        ? 3
        : 4
    );

    const duration = animate
      ? CW_DEFAULTS.transitionMs
      : 0;

    configureHeader(
      layout,
      x,
      tickValues,
      duration
    );

    configureGuides(
      x,
      tickValues,
      bodyHeight,
      duration
    );

    const transition = bodySvg
      .transition(`medal-rows-${renderSequence}`)
      .duration(duration)
      .ease(d3.easeCubicOut);

    const rows = rowLayer
      .selectAll("g.cw-medal-row")
      .data(
        currentRows,
        d => d.NOC
      )
      .join(
        enter => {
          const g = enter
            .append("g")
            .attr(
              "class",
              "cw-medal-row"
            )
            .attr(
              "data-noc",
              d => d.NOC
            )
            .attr(
              "transform",
              `translate(0,${bodyHeight + rowH})`
            )
            .style("opacity", 0);

          g.append("rect")
            .attr(
              "class",
              "cw-medal-row-bg"
            )
            .attr("x", 0)
            .attr(
              "height",
              rowH - 3
            )
            .attr("rx", 4);

          g.append("text")
            .attr(
              "class",
              "cw-medal-rank"
            );

          g.append("text")
            .attr(
              "class",
              "cw-medal-country"
            );

          g.append("rect")
            .attr(
              "class",
              "cw-segment cw-gold"
            );

          g.append("rect")
            .attr(
              "class",
              "cw-segment cw-silver"
            );

          g.append("rect")
            .attr(
              "class",
              "cw-segment cw-bronze"
            );

          g.append("text")
            .attr(
              "class",
              "cw-medal-total"
            );

          return g;
        },

        update => update,

        exit =>
          exit.call(selection =>
            selection
              .transition(transition)
              .style("opacity", 0)
              .remove()
          )
      );

    rows
      .attr(
        "data-noc",
        d => d.NOC
      )
      .classed(
        "superpower",
        d =>
          d.NOC === "USA" ||
          d.NOC === "URS"
      )
      .classed(
        "selected",
        d =>
          d.NOC === state.selectedNoc
      )
      .classed(
        "hovered",
        d =>
          d.NOC === state.hoveredNoc
      )
      .on(
        "mouseover",
        (event, d) => {
          callbacks.onHover?.(d.NOC);

          showTooltip(
            tooltip,
            event,
            `<div class="cw-tooltip-title">${d.Country}</div>
             <div class="cw-tooltip-row">
               <span>Gold</span>
               <strong>${d.GoldMedals}</strong>
             </div>
             <div class="cw-tooltip-row">
               <span>Silver</span>
               <strong>${d.SilverMedals}</strong>
             </div>
             <div class="cw-tooltip-row">
               <span>Bronze</span>
               <strong>${d.BronzeMedals}</strong>
             </div>
             <div class="cw-tooltip-row">
               <span>Total</span>
               <strong>${d.TotalMedals}</strong>
             </div>`
          );
        }
      )
      .on(
        "mousemove",
        event => {
          moveTooltip(
            tooltip,
            event
          );
        }
      )
      .on(
        "mouseout",
        () => {
          hideTooltip(tooltip);
          callbacks.onHover?.(null);
        }
      )
      .on(
        "click",
        (_event, d) => {
          callbacks.onSelect?.(d.NOC);
        }
      );

    rows
      .select(".cw-medal-row-bg")
      .attr(
        "width",
        layout.width
      );

    rows
      .select(".cw-medal-rank")
      .attr(
        "x",
        layout.rankX
      )
      .attr("y", 22)
      .text(d => d.rank);

    rows
      .select(".cw-medal-country")
      .attr(
        "x",
        layout.countryX
      )
      .attr("y", 22)
      .text(d =>
        truncateCountry(
          d.Country,
          layout
        )
      );

    rows
      .transition(transition)
      .attr(
        "transform",
        d =>
          `translate(0,${
            (d.rank - 1) * rowH
          })`
      )
      .style("opacity", 1);

    rows.each(function (d) {
      const g = d3.select(this);

      const goldEnd =
        x(d.GoldMedals);

      const silverEnd =
        x(
          d.GoldMedals +
          d.SilverMedals
        );

      const bronzeEnd =
        x(d.TotalMedals);

      g.select(".cw-gold")
        .attr("y", 7)
        .attr("height", 18)
        .transition(transition)
        .attr(
          "x",
          layout.left
        )
        .attr(
          "width",
          Math.max(
            0,
            goldEnd - layout.left
          )
        );

      g.select(".cw-silver")
        .attr("y", 7)
        .attr("height", 18)
        .transition(transition)
        .attr(
          "x",
          goldEnd
        )
        .attr(
          "width",
          Math.max(
            0,
            silverEnd - goldEnd
          )
        );

      g.select(".cw-bronze")
        .attr("y", 7)
        .attr("height", 18)
        .transition(transition)
        .attr(
          "x",
          silverEnd
        )
        .attr(
          "width",
          Math.max(
            0,
            bronzeEnd - silverEnd
          )
        );

      const totalWouldOverflow =
        bronzeEnd + 34 >
        layout.width;

      g.select(".cw-medal-total")
        .attr("y", 22)
        .transition(transition)
        .attr(
          "x",
          totalWouldOverflow
            ? layout.width - 8
            : bronzeEnd + 7
        )
        .attr(
          "text-anchor",
          totalWouldOverflow
            ? "end"
            : "start"
        )
        .text(
          d.TotalMedals
        );
    });

    updateStatus(
      state.year,
      state.selectedNoc
    );
  }

  function setHighlight(
    selectedNoc,
    hoveredNoc
  ) {
    rowLayer
      .selectAll("g.cw-medal-row")
      .classed(
        "selected",
        d =>
          d.NOC === selectedNoc
      )
      .classed(
        "hovered",
        d =>
          d.NOC === hoveredNoc
      );

    const boycott = data.find(
      d =>
        d.Year === currentYear &&
        d.ParticipationStatus === "boycott"
    );

    strip.classList.toggle(
      "active",
      Boolean(
        boycott &&
        selectedNoc === boycott.NOC
      )
    );
  }

  function scrollToNoc(noc) {
    const node = wrap.querySelector(
      `[data-noc="${CSS.escape(noc)}"]`
    );

    if (!node) {
      return false;
    }

    const wrapRect =
      wrap.getBoundingClientRect();

    const nodeRect =
      node.getBoundingClientRect();

    const target =
      wrap.scrollTop +
      (nodeRect.top - wrapRect.top) -
      wrap.clientHeight / 2 +
      nodeRect.height / 2;

    wrap.scrollTo({
      top: Math.max(0, target),
      behavior: "smooth"
    });

    return true;
  }

  /**
   * Re-layout the chart whenever its real container width changes.
   *
   * This does not geometrically scale the previous SVG. It recomputes the
   * quantitative range while preserving readable typography and row geometry.
   */
  const resizeObserver =
    new ResizeObserver(() => {
      if (!lastState) {
        return;
      }

      if (resizeFrame) {
        cancelAnimationFrame(
          resizeFrame
        );
      }

      resizeFrame =
        requestAnimationFrame(() => {
          const nextWidth =
            measure().width;

          if (
            !lastLayout ||
            Math.abs(
              nextWidth -
              lastLayout.width
            ) >= 2
          ) {
            render(
              lastState,
              {
                animate: false
              }
            );
          }
        });
    });

  resizeObserver.observe(wrap);

  return {
    render,
    setHighlight,
    scrollToNoc
  };
}