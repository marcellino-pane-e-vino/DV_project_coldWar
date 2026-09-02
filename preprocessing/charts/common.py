"""Shared preprocessing primitives for the Cold War analytical views.

This module deliberately contains only logic reused by multiple chart notebooks.
The notebooks in this directory are the official chart-specific build pipelines.

Geographic identity is never inferred from IOC/NOC codes or ISO codes here.
Every Olympic delegation is resolved through the explicit, audited crosswalk at
``preprocessing/source/geography/olympic_geography_mapping.csv``.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import json
import shutil

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
PREPROCESSING_DIR = REPO_ROOT / "preprocessing"
SOURCE_DIR = PREPROCESSING_DIR / "source"
INTERMEDIATE_DIR = PREPROCESSING_DIR / "intermediate"
FINAL_DIR = REPO_ROOT / "data" / "final" / "cold_war"
BASEMAP_DIR = REPO_ROOT / "data" / "final" / "geography" / "basemaps"

OLYMPIC_SOURCE = SOURCE_DIR / "olympics" / "120_years_olympic_history_OG.csv"
ATHLETE_EVENT_SOURCE = SOURCE_DIR / "olympics" / "Olympic_Athlete_Event_Results.csv"
NUCLEAR_SOURCE = SOURCE_DIR / "nuclear" / "nuclear-warhead-stockpiles-lines.csv"
GEOGRAPHY_MAPPING = SOURCE_DIR / "geography" / "olympic_geography_mapping.csv"
OLYMPEDIA_MATCH_SOURCE = SOURCE_DIR / "olympedia" / "output" / "rivalry_pulse_matches.csv"

COMMON_INTERMEDIATE = INTERMEDIATE_DIR / "cold_war_olympic_common.csv"
RIVALRY_INTERMEDIATE = INTERMEDIATE_DIR / "rivalry_pulse_matches.csv"

RIVALRY_YEARS = [1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988]
JOINT_YEARS = [1952, 1956, 1960, 1964, 1968, 1972, 1976, 1988]
BOYCOTTS = {1980: "USA", 1984: "URS"}
SUPERPOWER_NAMES = {"USA": "United States", "URS": "Soviet Union"}


def ensure_output_dirs() -> None:
    INTERMEDIATE_DIR.mkdir(parents=True, exist_ok=True)
    FINAL_DIR.mkdir(parents=True, exist_ok=True)


def join_unique(values) -> str:
    output: list[str] = []
    for value in values:
        text = str(value).strip()
        if text and text.lower() != "nan" and text not in output:
            output.append(text)
    return " / ".join(output)


def load_olympic_source() -> pd.DataFrame:
    """Load the canonical Olympic source and restrict it to the Cold War scope."""
    if not OLYMPIC_SOURCE.exists():
        raise FileNotFoundError(f"Missing canonical Olympic source: {OLYMPIC_SOURCE}")
    raw = pd.read_csv(OLYMPIC_SOURCE, delimiter=";", low_memory=False)
    required = {"NOC", "Year", "City", "Season", "Sport", "Event", "Team", "Medal"}
    missing = required - set(raw.columns)
    if missing:
        raise ValueError(f"Olympic source missing columns: {sorted(missing)}")
    return raw[(raw["Season"] == "Summer") & (raw["Year"].isin(RIVALRY_YEARS))].copy()


def medal_event_rows(raw: pd.DataFrame | None = None) -> pd.DataFrame:
    """Return one row per medal-winning NOC × event.

    Athlete-level Olympic data repeat a team medal for every team member.  The
    deduplication grain below counts each awarded NOC/event/medal once while
    preserving distinct events within the same sport.
    """
    if raw is None:
        raw = load_olympic_source()
    medal_rows = raw.dropna(subset=["Medal"])[
        ["Year", "City", "Sport", "Event", "NOC", "Medal"]
    ].copy()
    return medal_rows.drop_duplicates(
        subset=["Year", "City", "Sport", "Event", "NOC", "Medal"]
    )


def medal_summary_by_noc(raw: pd.DataFrame | None = None) -> pd.DataFrame:
    events = medal_event_rows(raw)
    counts = (
        events.groupby(["Year", "NOC", "Medal"], as_index=False)
        .size()
        .rename(columns={"size": "Count"})
        .pivot(index=["Year", "NOC"], columns="Medal", values="Count")
        .fillna(0)
        .reset_index()
    )
    counts.columns.name = None
    for medal, target in [("Gold", "GoldMedals"), ("Silver", "SilverMedals"), ("Bronze", "BronzeMedals")]:
        if medal not in counts.columns:
            counts[medal] = 0
        counts = counts.rename(columns={medal: target})
    for column in ["GoldMedals", "SilverMedals", "BronzeMedals"]:
        counts[column] = counts[column].astype(int)
    counts["TotalMedals"] = counts[["GoldMedals", "SilverMedals", "BronzeMedals"]].sum(axis=1)
    return counts[["Year", "NOC", "GoldMedals", "SilverMedals", "BronzeMedals", "TotalMedals"]]


def medal_summary_by_sport(raw: pd.DataFrame | None = None) -> pd.DataFrame:
    events = medal_event_rows(raw)
    counts = (
        events.groupby(["Year", "Sport", "NOC", "Medal"], as_index=False)
        .size()
        .rename(columns={"size": "Count"})
        .pivot(index=["Year", "Sport", "NOC"], columns="Medal", values="Count")
        .fillna(0)
        .reset_index()
    )
    counts.columns.name = None
    for medal, target in [("Gold", "GoldMedals"), ("Silver", "SilverMedals"), ("Bronze", "BronzeMedals")]:
        if medal not in counts.columns:
            counts[medal] = 0
        counts = counts.rename(columns={medal: target})
    for column in ["GoldMedals", "SilverMedals", "BronzeMedals"]:
        counts[column] = counts[column].astype(int)
    counts["TotalMedals"] = counts[["GoldMedals", "SilverMedals", "BronzeMedals"]].sum(axis=1)
    return counts[["Year", "Sport", "NOC", "GoldMedals", "SilverMedals", "BronzeMedals", "TotalMedals"]]


def participant_rows(raw: pd.DataFrame | None = None) -> pd.DataFrame:
    if raw is None:
        raw = load_olympic_source()
    return (
        raw.groupby(["Year", "NOC"], as_index=False)
        .agg(City=("City", join_unique))
        .sort_values(["Year", "NOC"])
        .reset_index(drop=True)
    )


def load_geography_mapping() -> pd.DataFrame:
    if not GEOGRAPHY_MAPPING.exists():
        raise FileNotFoundError(f"Missing explicit Olympic/CShapes crosswalk: {GEOGRAPHY_MAPPING}")
    mapping = pd.read_csv(GEOGRAPHY_MAPPING, dtype={"NOC": str, "GwCodes": str})
    required = {"NOC", "StartYear", "EndYear", "Country", "GwCodes", "Status", "Reason"}
    missing = required - set(mapping.columns)
    if missing:
        raise ValueError(f"Geography crosswalk missing columns: {sorted(missing)}")
    mapping["StartYear"] = mapping["StartYear"].astype(int)
    mapping["EndYear"] = mapping["EndYear"].astype(int)
    mapping["GwCodes"] = mapping["GwCodes"].fillna("")
    mapping["Reason"] = mapping["Reason"].fillna("")
    return mapping


def resolve_geography(noc: str, year: int, mapping: pd.DataFrame | None = None) -> dict[str, str]:
    """Resolve one NOC/year through the explicit crosswalk; never guess."""
    if mapping is None:
        mapping = load_geography_mapping()
    match = mapping[
        mapping["NOC"].eq(str(noc))
        & mapping["StartYear"].le(int(year))
        & mapping["EndYear"].ge(int(year))
    ]
    if len(match) != 1:
        raise ValueError(
            f"Expected exactly one explicit geography rule for NOC={noc}, Year={year}; found {len(match)}"
        )
    row = match.iloc[0]
    return {
        "Country": str(row["Country"]),
        "GwCodes": str(row["GwCodes"]),
        "MappingStatus": str(row["Status"]),
        "MappingReason": str(row["Reason"]),
    }


def topology_gw_codes(year: int) -> set[int]:
    path = BASEMAP_DIR / f"cshapes-{int(year)}.topo.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing CShapes basemap: {path}")
    with path.open(encoding="utf-8") as handle:
        topology = json.load(handle)
    objects = topology.get("objects", {})
    if not objects:
        raise ValueError(f"No TopoJSON objects in {path}")
    geometries = next(iter(objects.values())).get("geometries", [])
    codes: set[int] = set()
    for geometry in geometries:
        raw = (geometry.get("properties") or {}).get("id", geometry.get("id"))
        if raw is None:
            continue
        try:
            codes.add(int(str(raw).removeprefix("gw")))
        except ValueError:
            continue
    return codes


def validate_resolved_geography(frame: pd.DataFrame) -> None:
    """Fail hard on incomplete mappings, invalid GW codes, or collisions."""
    errors: list[str] = []
    if frame.duplicated(["Year", "NOC"]).any():
        duplicates = frame.loc[frame.duplicated(["Year", "NOC"], keep=False), ["Year", "NOC"]]
        errors.append(f"Duplicate Year×NOC rows: {duplicates.head(10).to_dict('records')}")

    basemap_codes = {year: topology_gw_codes(year) for year in RIVALRY_YEARS}
    owners: defaultdict[tuple[int, int], list[tuple[str, str]]] = defaultdict(list)

    for row in frame.itertuples(index=False):
        status = str(row.MappingStatus)
        codes = [int(value) for value in str(row.GwCodes).split(";") if value]
        if status == "mapped" and not codes:
            errors.append(f"Mapped row has no GW code: {row.Year} {row.NOC} {row.Country}")
        if status != "mapped" and not str(row.MappingReason).strip():
            errors.append(f"Excluded row has no reason: {row.Year} {row.NOC} {row.Country}")
        for code in codes:
            if code not in basemap_codes[int(row.Year)]:
                errors.append(f"GW {code} missing from CShapes {row.Year}: {row.NOC} {row.Country}")
            owners[(int(row.Year), code)].append((str(row.NOC), str(row.Country)))

    for (year, code), values in owners.items():
        distinct = sorted(set(values))
        if len(distinct) > 1:
            errors.append(f"Geographic collision in {year}: GW {code} assigned to {distinct}")

    if errors:
        raise ValueError("Geography validation failed:\n  - " + "\n  - ".join(errors))


def build_common() -> pd.DataFrame:
    """Build the single shared Year×NOC Cold War Olympic intermediate."""
    ensure_output_dirs()
    raw = load_olympic_source()
    participants = participant_rows(raw)
    medals = medal_summary_by_noc(raw)
    common = participants.merge(medals, on=["Year", "NOC"], how="left", validate="one_to_one")
    for column in ["GoldMedals", "SilverMedals", "BronzeMedals", "TotalMedals"]:
        common[column] = common[column].fillna(0).astype(int)

    mapping = load_geography_mapping()
    resolved = [resolve_geography(row.NOC, int(row.Year), mapping) for row in common.itertuples()]
    common = pd.concat([common.reset_index(drop=True), pd.DataFrame(resolved)], axis=1)

    denominators = common.groupby("Year", as_index=False).agg(
        TotalMedalsAwarded=("TotalMedals", "sum"),
        GoldMedalsAwarded=("GoldMedals", "sum"),
    )
    common = common.merge(denominators, on="Year", how="left", validate="many_to_one")
    common["TotalMedalShare"] = common["TotalMedals"] / common["TotalMedalsAwarded"]
    common["GoldMedalShare"] = common["GoldMedals"] / common["GoldMedalsAwarded"]
    common["ParticipationStatus"] = "participated"
    common["BoycottBy"] = ""

    # Add the two historically documented boycott rows as deliberate DNP states.
    city_by_year = {year: join_unique(raw.loc[raw["Year"].eq(year), "City"]) for year in RIVALRY_YEARS}
    extras: list[dict] = []
    for year, noc in BOYCOTTS.items():
        geo = resolve_geography(noc, year, mapping)
        denom = denominators.loc[denominators["Year"].eq(year)].iloc[0]
        extras.append(
            {
                "Year": year,
                "NOC": noc,
                "City": city_by_year[year],
                **geo,
                "GoldMedals": np.nan,
                "SilverMedals": np.nan,
                "BronzeMedals": np.nan,
                "TotalMedals": np.nan,
                "TotalMedalsAwarded": int(denom.TotalMedalsAwarded),
                "GoldMedalsAwarded": int(denom.GoldMedalsAwarded),
                "TotalMedalShare": np.nan,
                "GoldMedalShare": np.nan,
                "ParticipationStatus": "boycott",
                "BoycottBy": noc,
            }
        )

    common = pd.concat([common, pd.DataFrame(extras)], ignore_index=True)
    common = common[
        [
            "Year", "City", "NOC", "Country", "GwCodes", "MappingStatus", "MappingReason",
            "GoldMedals", "SilverMedals", "BronzeMedals", "TotalMedals",
            "TotalMedalsAwarded", "GoldMedalsAwarded", "TotalMedalShare", "GoldMedalShare",
            "ParticipationStatus", "BoycottBy",
        ]
    ].sort_values(["Year", "NOC"]).reset_index(drop=True)

    validate_resolved_geography(common)
    common.to_csv(COMMON_INTERMEDIATE, index=False)
    return common


def load_common(rebuild: bool = False) -> pd.DataFrame:
    if rebuild or not COMMON_INTERMEDIATE.exists():
        return build_common()
    return pd.read_csv(COMMON_INTERMEDIATE, dtype={"NOC": str, "GwCodes": str}).fillna({"GwCodes": "", "MappingReason": "", "BoycottBy": ""})


def refresh_rivalry_intermediate() -> Path:
    """Refresh the offline Rivalry Pulse intermediate from the validated scraper output.

    No network request occurs here.  Live Olympedia acquisition remains an explicit
    source-side operation under preprocessing/source/olympedia/.
    """
    ensure_output_dirs()
    if not OLYMPEDIA_MATCH_SOURCE.exists():
        if not RIVALRY_INTERMEDIATE.exists():
            raise FileNotFoundError(
                "Missing both the validated Olympedia scraper output and the rivalry intermediate."
            )
        return RIVALRY_INTERMEDIATE
    shutil.copy2(OLYMPEDIA_MATCH_SOURCE, RIVALRY_INTERMEDIATE)
    return RIVALRY_INTERMEDIATE


def load_rivalry_matches(refresh: bool = False) -> pd.DataFrame:
    if refresh or not RIVALRY_INTERMEDIATE.exists():
        refresh_rivalry_intermediate()
    return pd.read_csv(RIVALRY_INTERMEDIATE)
