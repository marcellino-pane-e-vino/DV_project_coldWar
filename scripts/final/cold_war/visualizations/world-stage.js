import {
  getColdWarTooltip,
  hideTooltip,
  moveTooltip,
  showTooltip
} from "../components/tooltip.js";
import { getGwCode, loadColdWarBasemap } from "../core/geography.js";
import { CW_THEME } from "../core/theme.js";

const d3 = globalThis.d3;


/* Animation tuning   */

export const WORLD_STAGE_COLOR_TRANSITION = Object.freeze({
  duration: 700,
  ease: d3.easeCubicInOut
});

const MAP_ANIMATION = Object.freeze({
  colorDuration: WORLD_STAGE_COLOR_TRANSITION.duration,
  enterDuration: 250,
  exitDuration: 250,

  colorEase: WORLD_STAGE_COLOR_TRANSITION.ease,
  enterEase: d3.easeCubicOut,
  exitEase: d3.easeCubicIn
});

const INITIAL_ZOOM_SCALE = 1.25;
const INITIAL_POSITION = Object.freeze({
  x: 0.53,
  y: 0.5
});

// Hard pan boundary around the map canvas.
const PAN_BOUNDARY_PADDING = -10;

export function createWorldStageMap(data, ids, callbacks = {}) {
  const containerNode = document.getElementById(ids.containerId);
  if (!containerNode) {
    throw new Error(`World Stage map host not found: ${ids.containerId}`);
  }
  const container = d3.select(containerNode);
  const tooltip = getColdWarTooltip();
  const gradientPrefix = String(ids.instanceKey || ids.containerId).replace(/[^a-zA-Z0-9_-]/g, "-");

  let width = 1000;
  let height = 700;

  function measure() {
    width = Math.max(320, Math.floor(containerNode.clientWidth || 1000));
    height = Math.round(width * 0.7);
    return { width, height };
  }

  measure();
  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      "World Stage Olympic medal-share map"
    );


  /* Persistent layers     */

  const mapRoot = svg
    .append("g")
    .attr("class", "cw-world-map-root");
  const countryLayer = mapRoot
    .append("g")
    .attr("class", "cw-world-country-layer");
  const legendRoot = svg
    .append("g")
    .attr("class", "cw-world-legend");


  /* Zoom   */

  function viewportExtent() {
    return [
      [0, 0],
      [width, height]
    ];
  }

  function panTranslateExtent() {
    return [
      [-PAN_BOUNDARY_PADDING, -PAN_BOUNDARY_PADDING],
      [
        width + PAN_BOUNDARY_PADDING,
        height + PAN_BOUNDARY_PADDING
      ]
    ];
  }

  function initialZoomTransform(
    scale = INITIAL_ZOOM_SCALE,
    position = INITIAL_POSITION
  ) {
    const viewportCenterX = width / 2;
    const viewportCenterY = height / 2;

    const focusX = width * position.x;
    const focusY = height * position.y;

    return d3.zoomIdentity
      .translate(viewportCenterX, viewportCenterY)
      .scale(scale)
      .translate(-focusX, -focusY);
  }

  const zoom = d3
    .zoom()
    .scaleExtent([1, 8])
    .extent(() => viewportExtent())
    .translateExtent(panTranslateExtent())
    .on("zoom", event => {
      mapRoot.attr(
        "transform",
        event.transform
      );
    });

  function constrainZoomTransform(transform) {
    return zoom.constrain()(
      transform,
      viewportExtent(),
      panTranslateExtent()
    );
  }

  function applyZoomTransform(transform, { animate = false } = {}) {
    const constrained = constrainZoomTransform(transform);

    if (animate) {
      svg
        .transition()
        .duration(250)
        .call(
          zoom.transform,
          constrained
        );
      return;
    }

    svg.call(
      zoom.transform,
      constrained
    );
  }

  function refreshZoomBoundary() {
    zoom
      .extent(() => viewportExtent())
      .translateExtent(panTranslateExtent());

    const current = d3.zoomTransform(svg.node());
    const constrained = constrainZoomTransform(current);

    const changed =
      Math.abs(constrained.x - current.x) > 0.01 ||
      Math.abs(constrained.y - current.y) > 0.01 ||
      Math.abs(constrained.k - current.k) > 0.0001;

    if (changed) {
      svg.call(
        zoom.transform,
        constrained
      );
    }
  }

  svg
    .call(zoom)
    .on("dblclick.zoom", null);

  // Starting camera configuration
  applyZoomTransform(
    initialZoomTransform()
  );

  document
    .getElementById(ids.zoomInId)
    ?.addEventListener("click", () => {
      svg
        .transition()
        .duration(250)
        .call(
          zoom.scaleBy,
          1.3
        );
    });

  document
    .getElementById(ids.zoomOutId)
    ?.addEventListener("click", () => {
      svg
        .transition()
        .duration(250)
        .call(
          zoom.scaleBy,
          0.75
        );
    });

  document
    .getElementById(ids.zoomResetId)
    ?.addEventListener("click", () => {
      applyZoomTransform(
        initialZoomTransform(),
        { animate: true }
      );
    });


  /* Fixed medal-share domains                                           */

  const maxByMetric = {
    total:
      d3.max(
        data,
        d => d.TotalMedalShare ?? 0
      ) || 1,

    gold:
      d3.max(
        data,
        d => d.GoldMedalShare ?? 0
      ) || 1
  };



  let renderVersion = 0;
  let projection = null;
  let projectionReference = null;
  let projectionSizeKey = "";
  let lastState = null;
  let resizeFrame = null;


  /* Data helpers */

  function rowIndex(year) {
    const rows =
      data.filter(
        d => d.Year === year
      );

    const byGw =
      new Map();

    for (const row of rows) {
      for (const code of row.GwCodes) {
        const previous = byGw.get(code);

        if (previous && previous.NOC !== row.NOC) {
          throw new Error(
            `World Stage geographic collision: GW ${code} is assigned to both ` +
            `${previous.NOC} and ${row.NOC} in ${year}.`
          );
        }

        byGw.set(code, row);
      }
    }

    return {
      rows,
      byGw
    };
  }


  function value(
    row,
    metric
  ) {
    return metric === "gold"
      ? row?.GoldMedalShare
      : row?.TotalMedalShare;
  }


  function medalValue(
    row,
    metric
  ) {
    return metric === "gold"
      ? row?.GoldMedals
      : row?.TotalMedals;
  }


  function colorScale(metric) {
    const [light, dark] =
      metric === "gold"
        ? [
            CW_THEME.colors.goldLight,
            CW_THEME.colors.goldDark
          ]
        : [
            CW_THEME.colors.totalLight,
            CW_THEME.colors.totalDark
          ];

    return d3
      .scaleSqrt()
      .domain([
        0,
        maxByMetric[metric]
      ])
      .range([
        light,
        dark
      ])
      .clamp(true);
  }


  /* Legend */

  function drawLegend(
    metric,
    scale
  ) {
    legendRoot
      .selectAll("*")
      .remove();

    const w = Math.max(135, Math.min(220, width * 0.24));

    const x0 =
      width - w - 28;

    const y0 =
      height - 34;

    const defs =
      svg.select("defs").empty()
        ? svg.append("defs")
        : svg.select("defs");

    const id =
      `${gradientPrefix}-share-gradient-${metric}`;

    defs
      .select(`#${id}`)
      .remove();

    const grad =
      defs
        .append("linearGradient")
        .attr("id", id);

    d3
      .range(
        0,
        1.001,
        0.1
      )
      .forEach(t => {
        grad
          .append("stop")
          .attr(
            "offset",
            `${t * 100}%`
          )
          .attr(
            "stop-color",
            scale(
              t *
              maxByMetric[metric]
            )
          );
      });

    legendRoot
      .append("text")
      .attr(
        "x",
        x0
      )
      .attr(
        "y",
        y0 - 14
      )
      .attr(
        "class",
        "cw-legend-title"
      )
      .text(
        metric === "gold"
          ? "Gold medal share"
          : "Total medal share"
      );

    legendRoot
      .append("rect")
      .attr(
        "x",
        x0
      )
      .attr(
        "y",
        y0
      )
      .attr(
        "width",
        w
      )
      .attr(
        "height",
        10
      )
      .attr(
        "fill",
        `url(#${id})`
      );

    const axis =
      d3
        .scaleLinear()
        .domain([
          0,
          maxByMetric[metric]
        ])
        .range([
          0,
          w
        ]);

    legendRoot
      .append("g")
      .attr(
        "class",
        "cw-axis cw-map-legend-axis"
      )
      .attr(
        "transform",
        `translate(${x0},${y0 + 10})`
      )
      .call(
        d3
          .axisBottom(axis)
          .ticks(width < 520 ? 3 : 4)
          .tickFormat(
            d3.format(".0%")
          )
      );

    // Boycotts use the exact same neutral fill as any other no-medal delegation.
    const statusLegend = legendRoot
      .append("g")
      .attr("class", "cw-map-status-legend")
      .attr("transform", `translate(18,${height - 28})`);

    statusLegend
      .append("rect")
      .attr("x", 0)
      .attr("y", -8)
      .attr("width", 15)
      .attr("height", 10)
      .attr("rx", 1.5)
      .attr("class", "cw-map-status-swatch is-non-participant");

    statusLegend
      .append("text")
      .attr("x", 21)
      .attr("y", 0)
      .attr("class", "cw-map-status-label")
      .text("Did not participate");

    const boycottX = width < 520 ? 140 : 165;

    statusLegend
      .append("rect")
      .attr("x", boycottX)
      .attr("y", -8)
      .attr("width", 15)
      .attr("height", 10)
      .attr("rx", 1.5)
      .attr("class", "cw-map-status-swatch is-boycott");

    statusLegend
      .append("text")
      .attr("x", boycottX + 21)
      .attr("y", 0)
      .attr("class", "cw-map-status-label")
      .text("Boycott");
  }


  /* Render */

  async function render(state) {
    lastState = { ...state };
    measure();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Keep D3's viewport and translation limits synchronized with the current SVG dimensions and resize the camera
    refreshZoomBoundary();

    const version =
      ++renderVersion;

    // clean tooltips related to previously rendered/hovered geography before moving to a new geography
    hideTooltip(tooltip);
    callbacks.onHover?.(null);

    const features =
      await loadColdWarBasemap(
        state.year
      );


    // Ignore stale requests.
    if (
      version !==
      renderVersion
    ) {
      return;
    }


    const {
      byGw
    } = rowIndex(
      state.year
    );

    const scale =
      colorScale(
        state.metric
      );


    
    /* Projection     */
    

    const fc = {
      type:
        "FeatureCollection",

      features
    };


    // Create the projection only on the first render, let editions displayed later use the samme projection. This helps with the mitigation of jittering of moving historical borders
    if (!projectionReference) {
      projectionReference = fc;
    }

    const projectionKey = `${width}x${height}`;

    if (!projection || projectionSizeKey !== projectionKey) {
      const bottomReserve = Math.max(50, Math.min(70, height * 0.13));

      projection =
        d3
          .geoNaturalEarth1()
          .fitExtent(
            [
              [18,18],
              [width - 18,height - bottomReserve]
            ],
            projectionReference
          );

      projectionSizeKey = projectionKey;
    }


    const path =
      d3.geoPath(
        projection
      );


    
    /* Target appearance   */
    

    function targetFill(feature) {
      const row =
        byGw.get(
          getGwCode(
            feature
          )
        );

      if (!row) {
        return (
          CW_THEME.colors.nonParticipant
        );
      }

      if (
        row.ParticipationStatus ===
        "boycott"
      ) {
        return (
          CW_THEME.colors.noMedal
        );
      }

      const v =
        value(
          row,
          state.metric
        );

      return !v
        ? CW_THEME.colors.noMedal
        : scale(v);
    }



    
    /* Persistent keyed data join                                        */
    

    const countries =
      countryLayer
        .selectAll(
          "path.cw-world-country"
        )
        .data(
          features,
          getGwCode
        );


    
    /* EXIT */
    const exiting =
      countries.exit();

    exiting
      .interrupt("color")
      .interrupt("enter")
      .interrupt("exit")
      .transition("exit")
      .duration(
        MAP_ANIMATION.exitDuration
      )
      .ease(
        MAP_ANIMATION.exitEase
      )
      .attr(
        "opacity",
        0
      )
      .remove();


    
    /* ENTER */
    

    const entered =
      countries
        .enter()
        .append(
          "path"
        )
        .attr(
          "class",
          "cw-world-country"
        )
        .attr(
          "data-gw",
          f =>
            getGwCode(f)
        )
        .attr(
          "data-noc",
          f =>
            byGw.get(
              getGwCode(f)
            )?.NOC || ""
        )
        .attr(
          "data-boycott",
          f =>
            byGw.get(getGwCode(f))?.ParticipationStatus === "boycott"
              ? "true"
              : "false"
        )

        .attr(
          "d",
          path
        )

        .attr(
          "fill",
          targetFill
        )
        .classed(
          "is-boycott",
          f => byGw.get(getGwCode(f))?.ParticipationStatus === "boycott"
        )
        .classed(
          "is-selected",
          f => byGw.get(getGwCode(f))?.NOC === state.selectedNoc
        )
        .classed(
          "is-hovered",
          f => byGw.get(getGwCode(f))?.NOC === state.hoveredNoc
        )
        .attr("opacity",0);


    
    /* UPDATE + ENTER */
    

    const merged =entered.merge(countries);


    //Cancel a previous color animation if the user / autoplay changes edition again before it finishes.
    merged.interrupt("color");


    //Existing countries should never remain partially transparent because of an interrupted previous enter animation.
    countries.interrupt("enter").attr("opacity",1);


    /*  Update current edition metadata.*/
    merged
      .attr(
        "data-noc",
        f =>
          byGw.get(
            getGwCode(f)
          )?.NOC || ""
      )
      .attr(
        "data-boycott",
        f =>
          byGw.get(getGwCode(f))?.ParticipationStatus === "boycott"
            ? "true"
            : "false"
      )
      .classed(
        "is-boycott",
        f => byGw.get(getGwCode(f))?.ParticipationStatus === "boycott"
      )
      .classed(
        "is-selected",
        f => byGw.get(getGwCode(f))?.NOC === state.selectedNoc
      )
      .classed(
        "is-hovered",
        f => byGw.get(getGwCode(f))?.NOC === state.hoveredNoc
      )
      .style(
        "cursor",
        f =>
          byGw.get(
            getGwCode(f)
          )
            ? "pointer"
            : "default"
      );


    
    /* HANDLING CHANGES IN HISTORICAL GEOGRAPHY */
    

    merged.attr("d",path);

    merged.on(
        "mouseover",
        (event, f) => {
          const row =
            byGw.get(
              getGwCode(f)
            );
          if (!row) {
            hideTooltip(tooltip);
            callbacks.onHover?.(null);
            return;
          }

          callbacks
            .onHover
            ?.(row.NOC);
          let detail;
          if (
            row.ParticipationStatus ===
            "boycott"
          ) {
            detail =
              "Did not participate — boycott";
          }

          else if (
            (row.TotalMedals ?? 0) ===
            0
          ) {
            detail =
              "No medals";
          }
          else {
            detail =
              `${medalValue(
                row,
                state.metric
              )} ${
                state.metric ===
                "gold"
                  ? "gold medals"
                  : "medals"
              } · ${
                d3.format(
                  ".1%"
                )(
                  value(
                    row,
                    state.metric
                  ) ?? 0
                )
              } share`;
          }


          showTooltip(
            tooltip,
            event,
            `
              <div class="cw-tooltip-title">
                ${row.Country}
              </div>

              <div class="cw-tooltip-subtitle">
                ${row.City}
                ${row.Year}
              </div>

              <div>
                ${detail}
              </div>
            `
          );
        }
      )

      .on(
        "mousemove",
        (event, f) => {
          // tooltip removal
          const row =
            byGw.get(
              getGwCode(f)
            );

          if (!row) {
            hideTooltip(tooltip);
            return;
          }

          moveTooltip(
            tooltip,
            event
          );
        }
      )

      .on(
        "mouseout",
        () => {
          hideTooltip(
            tooltip
          );

          callbacks
            .onHover
            ?.(null);
        }
      )

      .on(
        "click",
        (_event, f) => {
          const row =
            byGw.get(
              getGwCode(f)
            );

          if (row) {
            callbacks
              .onSelect
              ?.(row.NOC);
          }
        }
      );


    
    /* COLOR TRANSITION    */
    merged
      .transition(
        "color"
      )
      .duration(
        MAP_ANIMATION.colorDuration
      )
      .ease(
        MAP_ANIMATION.colorEase
      )
      .attr(
        "fill",
        targetFill
      );


    
    /* ENTER FADE */
    entered
      .interrupt("enter")
      .transition(
        "enter"
      )
      .duration(
        MAP_ANIMATION.enterDuration
      )
      .ease(
        MAP_ANIMATION.enterEase
      )
      .attr(
        "opacity",
        1
      );


    
    /* Legend */
    drawLegend(
      state.metric,scale);
  }


  /* Linked highlighting */
  function setHighlight(
    selectedNoc,
    hoveredNoc
  ) {
    countryLayer
      .selectAll(
        "path[data-noc]"
      )
      .classed(
        "is-selected",
        function() {
          return this.getAttribute("data-noc") === selectedNoc;
        }
      )
      .classed(
        "is-hovered",
        function() {
          return this.getAttribute("data-noc") === hoveredNoc;
        }
      );
  }


  const resizeObserver = new ResizeObserver(() => {
    if (!lastState) return;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);

    resizeFrame = requestAnimationFrame(() => {
      const previousKey = projectionSizeKey;
      measure();
      const nextKey = `${width}x${height}`;
      if (nextKey !== previousKey) {
        render(lastState).catch(error => callbacks.onError?.(error));
      }
    });
  });

  resizeObserver.observe(containerNode);

  return {
    render,
    setHighlight
  };
}
