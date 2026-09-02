# Historical geography source and crosswalk

This directory contains everything needed to understand or reconstruct the geographic inputs used by **World Stage**.

## Files

- `SOURCE.md` — provenance and citation for CShapes 2.0.
- `generate_cshapes_snapshots.R` — regenerates the edition-specific TopoJSON basemaps and an audit-only `preprocessing/intermediate/cshapes_state_reference.csv`.
- `build_olympic_geography_mapping.ipynb` — documents and reproduces the Olympic delegation → CShapes matching process when the CShapes reference has been regenerated.
- `olympic_geography_mapping.csv` — committed project crosswalk used by normal preprocessing builds.

## Matching methodology

1. Extract every Summer Olympic `NOC × edition` in 1952–1988 from `../olympics/120_years_olympic_history_OG.csv`.
2. Compare the delegation label with the states in the corresponding CShapes snapshot.
3. Accept only unambiguous matches; historical/composite cases are reviewed explicitly.
4. Preserve historical delegation names.
5. Delegations without an admissible sovereign-state geometry are explicitly excluded rather than forced onto another state.
6. Validate every configured GW code against the actual TopoJSON for that edition and fail on collisions.

Normal `preprocessing/build_all.py` does **not** require R. The committed crosswalk and TopoJSON basemaps make the website and chart-data build self-contained. Run the R script only when intentionally regenerating the geographic source derivatives.
