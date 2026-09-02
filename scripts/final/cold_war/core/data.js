import { DATA_URLS } from "./config.js";
const d3 = globalThis.d3;

const numberOrNull = value => value === "" || value == null || Number.isNaN(Number(value)) ? null : Number(value);
const boolValue = value => String(value).toLowerCase() === "true";

// Empty GwCodes means "no sovereign CShapes geometry" and must stay empty.
// Number("") is 0 in JavaScript, so filtering only after Number() would
// incorrectly turn excluded delegations into the fake GW code 0.
const parseGwCodes = value => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  return raw
    .split(";")
    .map(token => token.trim())
    .filter(Boolean)
    .map(Number)
    .filter(code => Number.isInteger(code) && code > 0);
};

export function loadArmsRaceData() {
  return d3.csv(DATA_URLS.armsRace, d => ({
    Year: +d.Year, USA_Warheads: +d.USA_Warheads, USSR_Warheads: +d.USSR_Warheads,
    IsOlympicYear: boolValue(d.IsOlympicYear), City: d.City || "",
    USA_TotalMedals: numberOrNull(d.USA_TotalMedals), USSR_TotalMedals: numberOrNull(d.USSR_TotalMedals),
    USA_GoldMedals: numberOrNull(d.USA_GoldMedals), USSR_GoldMedals: numberOrNull(d.USSR_GoldMedals),
    BoycottBy: d.BoycottBy || ""
  }));
}

export function loadWorldStageData() {
  return d3.csv(DATA_URLS.worldStage, d => ({
    Year: +d.Year, City: d.City || "", NOC: d.NOC, Country: d.Country,
    GwCodes: parseGwCodes(d.GwCodes),
    GoldMedals: numberOrNull(d.GoldMedals), SilverMedals: numberOrNull(d.SilverMedals),
    BronzeMedals: numberOrNull(d.BronzeMedals), TotalMedals: numberOrNull(d.TotalMedals),
    TotalMedalShare: numberOrNull(d.TotalMedalShare), GoldMedalShare: numberOrNull(d.GoldMedalShare),
    ParticipationStatus: d.ParticipationStatus || "participated", BoycottBy: d.BoycottBy || ""
  }));
}

export function loadMedalRaceData() {
  return d3.csv(DATA_URLS.medalRace, d => ({
    Year: +d.Year, City: d.City || "", NOC: d.NOC, Country: d.Country,
    GoldMedals: numberOrNull(d.GoldMedals), SilverMedals: numberOrNull(d.SilverMedals),
    BronzeMedals: numberOrNull(d.BronzeMedals), TotalMedals: numberOrNull(d.TotalMedals),
    ParticipationStatus: d.ParticipationStatus || "participated", BoycottBy: d.BoycottBy || ""
  }));
}

export function loadSportingFrontsData() {
  return d3.csv(DATA_URLS.sportingFronts, d => ({
    Year: d.Year, Sport: d.Sport, Scope: d.Scope,
    USATotal: +d.USATotal, USSRTotal: +d.USSRTotal, USAGold: +d.USAGold, USSRGold: +d.USSRGold,
    TotalDifference: +d.TotalDifference, GoldDifference: +d.GoldDifference
  }));
}

export function loadRivalryPulseData() {
  return d3.csv(DATA_URLS.rivalryPulse, d => ({
    ...d,
    Year: +d.Year,
    USAScore: numberOrNull(d.USAScore),
    USSRScore: numberOrNull(d.USSRScore),
    ScoreRaw: d.ScoreRaw || ""
  }));
}

export function loadWhoWonData() {
  return d3.csv(DATA_URLS.whoWon, d => ({
    Year: +d.Year, City: d.City || "", NOC: d.NOC, Country: d.Country,
    TotalMedals: numberOrNull(d.TotalMedals), GoldMedals: numberOrNull(d.GoldMedals),
    ParticipationStatus: d.ParticipationStatus || "participated", BoycottBy: d.BoycottBy || ""
  }));
}


export function loadWhoWonCumulativeData() {
  return d3.csv(DATA_URLS.whoWonCumulative, d => ({
    Year: +d.Year,
    City: d.City || "",
    NOC: d.NOC,
    Country: d.Country,
    EditionTotalMedals: numberOrNull(d.EditionTotalMedals),
    EditionGoldMedals: numberOrNull(d.EditionGoldMedals),
    CumulativeTotalMedals: +d.CumulativeTotalMedals,
    CumulativeGoldMedals: +d.CumulativeGoldMedals,
    ParticipationStatus: d.ParticipationStatus || "participated",
    BoycottBy: d.BoycottBy || ""
  }));
}
