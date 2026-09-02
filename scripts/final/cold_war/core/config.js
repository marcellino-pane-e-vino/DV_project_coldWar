export const COLD_WAR_EDITIONS = Object.freeze([1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988]);
export const JOINT_PARTICIPATION_EDITIONS = Object.freeze([1952, 1956, 1960, 1964, 1968, 1972, 1976, 1988]);

export const DATA_URLS = Object.freeze({
  armsRace: new URL("../../../../data/final/cold_war/arms_race.csv", import.meta.url).href,
  worldStage: new URL("../../../../data/final/cold_war/world_stage.csv", import.meta.url).href,
  medalRace: new URL("../../../../data/final/cold_war/medal_race.csv", import.meta.url).href,
  sportingFronts: new URL("../../../../data/final/cold_war/sporting_fronts.csv", import.meta.url).href,
  rivalryPulse: new URL("../../../../data/final/cold_war/rivalry_pulse.csv", import.meta.url).href,
  whoWon: new URL("../../../../data/final/cold_war/who_won.csv", import.meta.url).href,
  whoWonCumulative: new URL("../../../../data/final/cold_war/who_won_cumulative.csv", import.meta.url).href,
  basemap: year => new URL(`../../../../data/final/geography/basemaps/cshapes-${year}.topo.json`, import.meta.url).href
});


export const CW_DEFAULTS = Object.freeze({
  transitionMs: 600,
  autoplayMs: 1900
});
