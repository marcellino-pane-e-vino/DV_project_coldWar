console.info("[Cold War build] v3.34.0-final-local-ripple");

import { COLD_WAR_EDITIONS, CW_DEFAULTS } from "./core/config.js";
import { prefetchColdWarBasemaps } from "./core/geography.js";
import {
  loadArmsRaceData,
  loadWorldStageData,
  loadMedalRaceData,
  loadSportingFrontsData,
  loadRivalryPulseData,
  loadWhoWonData
} from "./core/data.js";
import { createChartHelp } from "./components/chart-help.js";
import { createArmsRace } from "./visualizations/arms-race.js";
import { createWorldStageMap } from "./visualizations/world-stage.js";
import { createMedalRace } from "./visualizations/medal-race.js";
import { createSportingFronts } from "./visualizations/sporting-fronts.js";
import { createRivalryPulse } from "./visualizations/rivalry-pulse.js";
import { createWhoWonBattleStrip } from "./visualizations/who-won-battle-strip.js";

function reportError(label, error) {
  console.error(`${label} failed:`, error);
  const host = document.getElementById("cold-war-application-error");
  if (!host) return;
  host.hidden = false;
  const line = document.createElement("div");
  line.textContent = `${label}: ${error.message}`;
  host.appendChild(line);
}

function initializeHelp() {
  createChartHelp({
    wrapperId: "cw-arms-composite",
    hostId: "cw-arms-help",
    title: "How to read the chart?",
    steps: [
      "The overlapping areas show estimated nuclear warhead stockpiles for the United States and Soviet Union from the same zero baseline.",
      "The main x-axis is a normal 1945–1991 timeline; Olympic years appear as lighter secondary vertical annotations.",
      "Move across the plot to reveal a dashed vertical guide, both stockpile values, and the size of the USA or USSR lead for the nearest year.",
      "Click the chart or legend to pin one superpower; the other series and its tooltip row are visually de-emphasized."
    ]
  });

  createChartHelp({
    wrapperId: "cw-world-composite",
    hostId: "cw-world-help",
    title: "How to read the chart?",
    steps: [
      "Darker tonalities represent countries with higher medal shares",
      "Click on a country to see its placement on the medal table",
      "Click/Hover on a medal table row to highlight the corresponding country",
      "Change the view between counting all medals or only gold medals"
    ]
  });

  createChartHelp({
    wrapperId: "cw-sporting-fronts-composite",
    hostId: "cw-sf-help",
    title: "How to read the chart?",
    steps: [
      "Observe the cumulative lead collected",
      "Use the controls to switch medal metric or direct-encounter scope; the chart always shows the cumulative joint-participation period."
    ]
  });

  createChartHelp({
    wrapperId: "cw-pulse-composite",
    hostId: "cw-pulse-help",
    title: "How to read the chart?",
    steps: [
      "Every filled circle is one verified binary Olympic encounter between the USA and USSR.",
      "Dots stack upward from a fixed baseline: filters never stretch a small number of encounters across the full chart height.",
      "The y-axis keeps one global scale across every filter state, while color encodes the winner or a draw.",
      "Every tooltip uses the same gray divider between encounter identity and result details; a validated numeric final score appears below it when available.",
      "Click USA win, USSR win or Draw in the legend to fade the other outcomes with the shared 200 ms focus interaction.",
      "Use the filters to restrict the view to team encounters, individual encounters, or a single sport."
    ]
  });

  createChartHelp({
    wrapperId: "cw-who-battle-strip-composite",
    hostId: "cw-who-battle-strip-help",
    title: "How to read the chart?",
    steps: [
      "Each filled circle is a comparable Summer Olympic edition. Color identifies the winner and circle area encodes the winning margin; the three-circle legend provides quantitative size references.",
      "Hover or keyboard-focus an edition for a temporary expansion. Click, Enter or Space pins it; click it again, click the chart background or press Escape to close it.",
      "The thick outer donut shows the USA/USSR medal proportion and prints each country's exact medal count directly inside its slice.",
      "The expanded surface uses a deep winner-colored tint, including its outer edge, while the donut keeps the standard brighter USA and USSR colors.",
      "Local Ripple moves only the marks that need clearance around the expanded circle, so distant dates remain close to their normal positions.",
      "Moscow 1980 and Los Angeles 1984 remain empty boycott markers and never enter the edition-win count or the margin scale."
    ]
  });

}

async function initializeWorldStage() {
  const [worldData, raceData] = await Promise.all([
    loadWorldStageData(),
    loadMedalRaceData()
  ]);

  prefetchColdWarBasemaps(COLD_WAR_EDITIONS).catch(error =>
    console.warn("Cold War basemap prefetch incomplete", error)
  );

  const state = {
    currentIndex: 0,
    year: COLD_WAR_EDITIONS[0],
    metric: "total",
    selectedNoc: null,
    hoveredNoc: null
  };

  let timer = null;
  let isPlaying = false;

  const slider = document.getElementById("cw-world-year-slider");
  const label = document.getElementById("cw-world-year-label");
  const playButton = document.getElementById("cw-world-play");
  const playText = document.getElementById("cw-world-play-text");
  const metric = document.getElementById("cw-world-metric");

  if (!slider || !label || !playButton || !playText || !metric) {
    throw new Error("World Stage controls are incomplete.");
  }

  slider.min = 0;
  slider.max = COLD_WAR_EDITIONS.length - 1;
  slider.step = 1;
  slider.value = 0;

  let map;
  let race;

  function setLinkedHighlight() {
    map?.setHighlight(state.selectedNoc, state.hoveredNoc);
    race?.setHighlight(state.selectedNoc, state.hoveredNoc);
  }

  function onHover(noc) {
    state.hoveredNoc = noc;
    setLinkedHighlight();
  }

  function onSelect(noc) {
    state.selectedNoc = state.selectedNoc === noc ? null : noc;
    setLinkedHighlight();
    if (state.selectedNoc) race?.scrollToNoc(state.selectedNoc);
  }

  map = createWorldStageMap(
    worldData,
    {
      instanceKey: "cw-world",
      containerId: "cw-world-map",
      zoomInId: "cw-world-zoom-in",
      zoomOutId: "cw-world-zoom-out",
      zoomResetId: "cw-world-zoom-reset"
    },
    {
      onHover,
      onSelect,
      onError: error => reportError("World Stage map", error)
    }
  );

  race = createMedalRace(
    raceData,
    {
      containerId: "cw-world-race",
      statusId: "cw-world-status"
    },
    { onHover, onSelect },
    {
      layoutMode: "narrow-fixed",
      showBoycottStatus: true
    }
  );

  function stopPlayback() {
    if (timer) clearInterval(timer);
    timer = null;
    isPlaying = false;
    playText.textContent = "Play";
  }

  function updateStateAndRender() {
    state.year = COLD_WAR_EDITIONS[state.currentIndex];
    slider.value = state.currentIndex;

    const city = worldData.find(d => d.Year === state.year)?.City || "";
    label.textContent = city ? `${city} ${state.year}` : String(state.year);

    map
      .render(state)
      .then(setLinkedHighlight)
      .catch(error => reportError("World Stage map", error));

    race.render(state);
    setLinkedHighlight();
  }

  function startPlayback() {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (state.currentIndex >= COLD_WAR_EDITIONS.length - 1) {
      state.currentIndex = 0;
      updateStateAndRender();
    }

    isPlaying = true;
    playText.textContent = "Pause";

    timer = setInterval(() => {
      if (state.currentIndex < COLD_WAR_EDITIONS.length - 1) {
        state.currentIndex += 1;
        state.selectedNoc = null;
        state.hoveredNoc = null;
        updateStateAndRender();
      } else {
        stopPlayback();
      }
    }, CW_DEFAULTS.autoplayMs);
  }

  playButton.addEventListener("click", startPlayback);

  slider.addEventListener("input", () => {
    stopPlayback();
    state.currentIndex = +slider.value;
    state.selectedNoc = null;
    state.hoveredNoc = null;
    updateStateAndRender();
  });

  metric.addEventListener("change", () => {
    stopPlayback();
    state.metric = metric.value;
    state.selectedNoc = null;
    state.hoveredNoc = null;
    updateStateAndRender();
  });

  updateStateAndRender();

  // Keep the World Stage map frame and Medal Race frame exactly the same
  // height on desktop. The map remains the sizing authority (1000:700); the
  // Medal Race fills that measured height instead of using an unrelated clamp.
  const mapHost = document.getElementById("cw-world-map");
  const medalPanelWrap = document.querySelector("#cw-world-composite .cw-medal-panel-wrap");
  const desktopLayout = window.matchMedia("(min-width: 1000px)");

  if (mapHost && medalPanelWrap) {
    const syncWorldPanelHeights = () => {
      if (!desktopLayout.matches) {
        medalPanelWrap.style.height = "";
        return;
      }

      const mapHeight = mapHost.getBoundingClientRect().height;
      if (mapHeight > 0) {
        medalPanelWrap.style.height = `${Math.round(mapHeight)}px`;
      }
    };

    const worldLayoutObserver = new ResizeObserver(syncWorldPanelHeights);
    worldLayoutObserver.observe(mapHost);
    desktopLayout.addEventListener?.("change", syncWorldPanelHeights);
    requestAnimationFrame(syncWorldPanelHeights);
  }
}

async function initialize() {
  if (!globalThis.d3 || !globalThis.topojson) {
    throw new Error("D3.js and TopoJSON must be loaded before Cold War modules.");
  }

  const tasks = [
    [
      "The Arms Race",
      async () =>
        createArmsRace(await loadArmsRaceData(), {
          containerId: "cw-arms-race",
          legendId: "cw-arms-legend"
        })
    ],
    ["The World Stage + The Medal Race", initializeWorldStage],
    [
      "The Sporting Fronts",
      async () =>
        createSportingFronts(await loadSportingFrontsData(), {
          containerId: "cw-sporting-fronts",
          medalSelectId: "cw-sf-medal",
          scopeSelectId: "cw-sf-scope"
        })
    ],
    [
      "The Rivalry Pulse",
      async () =>
        createRivalryPulse(await loadRivalryPulseData(), {
          containerId: "cw-rivalry-pulse",
          typeSelectId: "cw-pulse-type",
          sportSelectId: "cw-pulse-sport",
          legendId: "cw-pulse-legend"
        })
    ],
    [
      "Who Won — Battle Strip: Local Ripple",
      async () =>
        createWhoWonBattleStrip(await loadWhoWonData(), {
          containerId: "cw-who-battle-strip",
          metricSelectId: "cw-who-battle-strip-metric",
          legendId: "cw-who-battle-strip-legend"
        })
    ]
  ];

  await Promise.all(
    tasks.map(async ([label, task]) => {
      try {
        await task();
      } catch (error) {
        reportError(label, error);
      }
    })
  );

  initializeHelp();
}

initialize().catch(error => reportError("Cold War application", error));
