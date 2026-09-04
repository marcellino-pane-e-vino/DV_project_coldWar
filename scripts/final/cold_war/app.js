console.info("[Cold War build] v3.34.0-final-local-ripple");

import { createChartHelp } from "./components/chart-help.js";
import { createExclusiveModeToggle } from "./components/exclusive-mode-toggle.js";
import { COLD_WAR_EDITIONS, CW_DEFAULTS } from "./core/config.js";
import {
  loadArmsRaceData,
  loadMedalRaceData,
  loadRivalryPulseData,
  loadSportingFrontsData,
  loadWhoWonData,
  loadWorldStageData
} from "./core/data.js";
import { prefetchColdWarBasemaps } from "./core/geography.js";
import { CW_THEME } from "./core/theme.js";
import { createArmsRace } from "./visualizations/arms-race.js";
import { createMedalRace } from "./visualizations/medal-race.js";
import { createRivalryPulse } from "./visualizations/rivalry-pulse.js";
import { createSportingFronts } from "./visualizations/sporting-fronts.js";
import { createWhoWonBattleStrip } from "./visualizations/who-won-battle-strip.js";
import {
  createWorldStageMap,
  WORLD_STAGE_COLOR_TRANSITION
} from "./visualizations/world-stage.js";

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
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere, augue quis placerat auctor, massa sapien gravida velit, vitae tristique lectus nisl sed lacus.",
      "Donec posuere, magna eu interdum luctus, lectus orci sollicitudin nisl, vitae semper augue purus sed nibh."
    ]
  });

  createChartHelp({
    wrapperId: "cw-world-composite",
    hostId: "cw-world-help",
    title: "How to read the chart?",
    steps: [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec vitae turpis a sapien posuere porttitor.",
      "Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae."
    ]
  });

  createChartHelp({
    wrapperId: "cw-sporting-fronts-composite",
    hostId: "cw-sf-help",
    title: "How to read the chart?",
    steps: [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris ut neque ac enim porttitor aliquet.",
      "Suspendisse tincidunt arcu a nibh sodales, at facilisis nibh dapibus."
    ]
  });

  createChartHelp({
    wrapperId: "cw-pulse-composite",
    hostId: "cw-pulse-help",
    title: "How to read the chart?",
    steps: [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean egestas tortor vitae urna sagittis, vel tempus felis faucibus.",
      "Nam non nunc sit amet lacus posuere placerat. Integer sed varius lectus."
    ]
  });

  createChartHelp({
    wrapperId: "cw-who-battle-strip-composite",
    hostId: "cw-who-battle-strip-help",
    title: "How to read the chart?",
    steps: [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin vehicula neque nec nulla consequat, id scelerisque nulla cursus.",
      "Curabitur facilisis tortor eget ante dignissim, nec pulvinar elit tristique."
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
  const metricToggleHost = document.getElementById("cw-world-metric-toggle");
  const milestoneHost = document.getElementById("cw-world-year-milestones");
  const visualThumb = document.getElementById("cw-world-year-thumb");

  if (!slider || !label || !playButton || !playText || !metricToggleHost || !milestoneHost || !visualThumb) {
    throw new Error("World Stage controls are incomplete.");
  }

  slider.min = 0;
  slider.max = COLD_WAR_EDITIONS.length - 1;
  slider.step = 1;
  slider.value = 0;

  const boycottMilestones = COLD_WAR_EDITIONS
    .map((year, index) => {
      const boycottRow = worldData.find(
        row => row.Year === year && row.ParticipationStatus === "boycott"
      );

      if (!boycottRow) return null;

      return {
        index,
        year,
        city: boycottRow.City,
        boycottingNoc: boycottRow.NOC === "URS" ? "USSR" : boycottRow.NOC
      };
    })
    .filter(Boolean);

  const boycottIndexes = new Set(boycottMilestones.map(milestone => milestone.index));
  let pointerIsControllingSlider = false;

  function getVisualThumbColor() {
    if (boycottIndexes.has(state.currentIndex)) return CW_THEME.colors.boycott;
    return state.metric === "gold"
      ? CW_THEME.colors.goldDark
      : CW_THEME.colors.totalDark;
  }

  function positionVisualThumb({ animate = false } = {}) {
    const thumbSize = parseFloat(
      getComputedStyle(slider).getPropertyValue("--cw-timeline-native-thumb-size")
    ) || 18;
    const sliderWidth = slider.getBoundingClientRect().width;
    const maxIndex = COLD_WAR_EDITIONS.length - 1;
    const travelWidth = Math.max(0, sliderWidth - thumbSize);
    const left = thumbSize / 2 + (state.currentIndex / maxIndex) * travelWidth;

    visualThumb.classList.toggle("is-step-transition", animate);
    visualThumb.style.left = `${left}px`;
  }

  function colorVisualThumb({ animate = false } = {}) {
    const color = getVisualThumbColor();
    const thumb = globalThis.d3
      .select(visualThumb)
      .interrupt("cw-world-slider-color");

    if (!animate) {
      thumb.style("background-color", color).style("border-color", color);
      return;
    }

    thumb
      .transition("cw-world-slider-color")
      .duration(WORLD_STAGE_COLOR_TRANSITION.duration)
      .ease(WORLD_STAGE_COLOR_TRANSITION.ease)
      .style("background-color", color)
      .style("border-color", color);
  }

  function updateVisualThumb({ animatePosition = false, animateColor = true } = {}) {
    positionVisualThumb({ animate: animatePosition });
    colorVisualThumb({ animate: animateColor });
  }

  function updateBoycottMilestoneState() {
    milestoneHost
      .querySelectorAll(".cw-world-boycott-milestone")
      .forEach(marker => {
        marker.classList.toggle(
          "is-current",
          +marker.dataset.index === state.currentIndex
        );
      });
  }

  for (const milestone of boycottMilestones) {
    const marker = document.createElement("button");
    const tooltip = milestone.year === 1980
      ? "Moscow 1980: U.S boycott"
      : "Los Angeles 1984: USSR boycott";

    marker.type = "button";
    marker.className = "cw-world-boycott-milestone";
    marker.dataset.index = String(milestone.index);
    marker.style.setProperty(
      "--cw-milestone-position",
      `${(milestone.index / (COLD_WAR_EDITIONS.length - 1)) * 100}%`
    );
    marker.setAttribute("aria-label", tooltip);
    marker.dataset.tooltip = tooltip;

    marker.addEventListener("click", () => {
      stopPlayback();
      state.currentIndex = milestone.index;
      state.selectedNoc = null;
      state.hoveredNoc = null;
      updateStateAndRender({ animatePosition: false });
    });

    milestoneHost.append(marker);
  }

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

  function updateStateAndRender({ animatePosition = false, animateColor = true } = {}) {
    state.year = COLD_WAR_EDITIONS[state.currentIndex];
    slider.value = state.currentIndex;
    updateBoycottMilestoneState();
    updateVisualThumb({ animatePosition, animateColor });

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
      updateStateAndRender({ animatePosition: false });
    }

    isPlaying = true;
    playText.textContent = "Pause";

    timer = setInterval(() => {
      if (state.currentIndex < COLD_WAR_EDITIONS.length - 1) {
        state.currentIndex += 1;
        state.selectedNoc = null;
        state.hoveredNoc = null;
        updateStateAndRender({ animatePosition: true });
      } else {
        stopPlayback();
      }
    }, CW_DEFAULTS.autoplayMs);
  }

  playButton.addEventListener("click", startPlayback);

  slider.addEventListener("pointerdown", () => {
    pointerIsControllingSlider = true;
  });

  window.addEventListener("pointerup", () => {
    pointerIsControllingSlider = false;
  });

  slider.addEventListener("input", () => {
    stopPlayback();
    const nextIndex = +slider.value;
    const isSingleKeyboardStep = !pointerIsControllingSlider
      && Math.abs(nextIndex - state.currentIndex) === 1;

    state.currentIndex = nextIndex;
    state.selectedNoc = null;
    state.hoveredNoc = null;
    updateStateAndRender({ animatePosition: isSingleKeyboardStep });
  });

  createExclusiveModeToggle({
    containerId: "cw-world-metric-toggle",
    label: "Medal metric",
    initialValue: state.metric,
    options: [
      {
        value: "total",
        label: "Total medals",
        accent: "var(--cw-color-total-medals)"
      },
      {
        value: "gold",
        label: "Gold medals",
        accent: "var(--cw-color-gold)"
      }
    ],
    onChange: value => {
      stopPlayback();
      state.metric = value;
      state.selectedNoc = null;
      state.hoveredNoc = null;
      updateStateAndRender({ animatePosition: false, animateColor: true });
    }
  });

  updateStateAndRender({ animateColor: false });

  const sliderResizeObserver = new ResizeObserver(() => {
    updateVisualThumb({ animatePosition: false, animateColor: false });
  });
  sliderResizeObserver.observe(slider);

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
          medalSelectId: "cw-sf-medal"
        })
    ],
    [
      "The Rivalry Pulse",
      async () =>
        createRivalryPulse(await loadRivalryPulseData(), {
          containerId: "cw-rivalry-pulse",
          typeToggleId: "cw-pulse-type-toggle",
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
