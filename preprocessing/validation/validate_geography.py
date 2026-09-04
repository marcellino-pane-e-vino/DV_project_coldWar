#!/usr/bin/env python3
"""Fail-hard audit for the Cold War Olympic -> CShapes geographic crosswalk."""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import importlib.util
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PRE = ROOT / "preprocessing"
CHARTS_COMMON = PRE / "charts" / "common.py"
MAPPING_PATH = PRE / "source" / "geography" / "olympic_geography_mapping.csv"
OLYMPIC_SOURCE = PRE / "source" / "olympics" / "120_years_olympic_history_OG.csv"
COMMON_PATH = PRE / "intermediate" / "cold_war_olympic_common.csv"

spec = importlib.util.spec_from_file_location("cold_war_common_validation", CHARTS_COMMON)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load {CHARTS_COMMON}")
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)


def main() -> None:
    errors: list[str] = []
    mapping = common.load_geography_mapping()
    raw = pd.read_csv(OLYMPIC_SOURCE, delimiter=";", low_memory=False)
    scope = raw[(raw["Season"] == "Summer") & raw["Year"].isin(common.RIVALRY_YEARS)].copy()
    universe = scope[["Year", "NOC"]].drop_duplicates().sort_values(["Year", "NOC"])

    # Crosswalk rows may not overlap for the same NOC.
    for noc, group in mapping.groupby("NOC"):
        rows = list(group.sort_values("StartYear").itertuples())
        for left, right in zip(rows, rows[1:]):
            if int(right.StartYear) <= int(left.EndYear):
                errors.append(
                    f"Overlapping crosswalk ranges for {noc}: "
                    f"{left.StartYear}-{left.EndYear} and {right.StartYear}-{right.EndYear}"
                )

    annual_rows = []
    for row in universe.itertuples(index=False):
        try:
            resolved = common.resolve_geography(str(row.NOC), int(row.Year), mapping)
        except Exception as exc:
            errors.append(str(exc))
            continue
        annual_rows.append({"Year": int(row.Year), "NOC": str(row.NOC), **resolved})

    # Explicit boycott states must resolve even though absent from the raw participants.
    for year, noc in common.BOYCOTTS.items():
        try:
            common.resolve_geography(noc, year, mapping)
        except Exception as exc:
            errors.append(f"Boycott mapping failed: {exc}")

    annual = pd.DataFrame(annual_rows)
    if len(annual) != len(universe):
        errors.append(f"Geographic coverage mismatch: resolved {len(annual)} of {len(universe)} NOC×edition rows")

    if not annual.empty:
        try:
            common.validate_resolved_geography(annual.assign(City="", ParticipationStatus="participated"))
        except Exception as exc:
            errors.append(str(exc))

    # Regression assertions for every mapping defect discovered during the audit.
    expected = {
        ("CHA", 1968): ("Chad", "483", "mapped"),
        ("CAM", 1964): ("Cambodia", "811", "mapped"),
        ("CMR", 1964): ("Cameroon", "471", "mapped"),
        ("MRI", 1984): ("Mauritius", "590", "mapped"),
        ("MAD", 1984): ("Madagascar", "580", "mapped"),
        ("MTN", 1984): ("Mauritania", "435", "mapped"),
        ("BAH", 1952): ("Bahamas", "31", "mapped"),
        ("BRN", 1984): ("Bahrain", "692", "mapped"),
        ("BIZ", 1968): ("Belize", "80", "mapped"),
        ("VNM", 1968): ("South Vietnam", "817", "mapped"),
        ("YAR", 1988): ("North Yemen", "678", "mapped"),
        ("YMD", 1988): ("South Yemen", "680", "mapped"),
        ("UAR", 1960): ("United Arab Republic", "651;652", "mapped"),
        ("GER", 1960): ("United Team of Germany", "260;265", "mapped"),
    }
    for (noc, year), (name, codes, status) in expected.items():
        try:
            row = common.resolve_geography(noc, year, mapping)
        except Exception as exc:
            errors.append(f"Regression mapping unresolved for {noc} {year}: {exc}")
            continue
        actual = (row["Country"], row["GwCodes"], row["MappingStatus"])
        if actual != (name, codes, status):
            errors.append(f"Regression mismatch {noc} {year}: expected {(name, codes, status)}, found {actual}")

    forbidden = {
        ("CHA", 1968): "710",
        ("CAM", 1964): "471",
        ("MRI", 1984): "580",
        ("MTN", 1984): "341",
        ("VNM", 1968): "816",
        ("YMD", 1988): "678",
    }
    for key, bad_code in forbidden.items():
        row = common.resolve_geography(*key, mapping=mapping)
        if bad_code in row["GwCodes"].split(";"):
            errors.append(f"Known-wrong GW mapping reintroduced: {key} -> {bad_code}")

    # Validate the materialized intermediate, if present.
    if COMMON_PATH.exists():
        materialized = pd.read_csv(COMMON_PATH, dtype={"GwCodes": str}).fillna({"GwCodes": "", "MappingReason": ""})
        if (materialized["Country"] == "Yeoman").any():
            errors.append("Country label 'Yeoman' leaked into the common intermediate")
        chad = materialized[(materialized.Year == 1968) & (materialized.NOC == "CHA")]
        if len(chad) != 1 or str(chad.iloc[0].GwCodes) != "483" or chad.iloc[0].Country != "Chad":
            errors.append("Materialized 1968 Chad row is not Chad -> GW 483")

    print("Cold War geography validation")
    print(f"  Olympic NOCs audited: {universe.NOC.nunique()}")
    print(f"  NOC×edition rows audited: {len(universe)}")
    if not annual.empty:
        print("  Mapping status counts:")
        for status, count in annual["MappingStatus"].value_counts().items():
            print(f"    {status}: {count}")

    if errors:
        print("\nVALIDATION FAILED")
        for error in errors:
            print(f"  - {error}")
        raise SystemExit(1)
    print("\nVALIDATION PASSED")


if __name__ == "__main__":
    main()
