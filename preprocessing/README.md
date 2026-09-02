# Preprocessing

This directory contains the complete, reproducible data pipeline used by the five Cold War analytical blocks. It also retains the cumulative Who Won data artifact for reproducibility even though that discarded frontend experiment is no longer mounted.

```text
source/ -> intermediate/ -> charts/ -> data/final/
                          \
                           -> validation/
```

## Directory responsibilities

### `source/`

Canonical inputs and source-specific acquisition/reconstruction material.

- `source/olympics/`
  - `120_years_olympic_history_OG.csv` — canonical athlete-level Olympic history used by the medal pipeline.
  - `Olympic_Athlete_Event_Results.csv` — Olympedia-linked athlete/event source used to identify candidate direct encounters.
- `source/nuclear/`
  - `nuclear-warhead-stockpiles-lines.csv` — committed nuclear stockpile source snapshot.
- `source/olympedia/`
  - cache-first acquisition/parser software, cached HTML pages, audit outputs, tests and documentation for Rivalry Pulse.
- `source/geography/`
  - CShapes provenance, CShapes-to-TopoJSON generation script and the project-authored Olympic/CShapes crosswalk.

No generated chart dataset belongs in `source/`.

### `intermediate/`

Reusable derived datasets that are not loaded directly by the browser.

- `cold_war_olympic_common.csv` — shared `Olympic edition × NOC` model with historical names, CShapes GW codes, participation/boycott status and deduplicated medal counts/shares.
- `rivalry_pulse_matches.csv` — validated offline Olympedia match corpus consumed by the Rivalry Pulse notebook.

### `charts/`

Official chart-data build pipelines.

- `common.py` contains logic shared by more than one chart notebook.
- each `.ipynb` performs chart-specific transformations and writes one visualization-ready CSV to `data/final/cold_war/`.
- `who_won_cumulative.ipynb` derives cumulative Total/Gold medal series from the existing canonical Olympic preprocessing; it introduces no new external source.

The preprocessing pipeline still builds and validates all seven committed runtime CSV contracts. The current frontend reads six of them: the definitive Local Ripple view reuses `who_won.csv`, while `who_won_cumulative.csv` remains a reproducible retained data artifact but is no longer mounted by a visualization. World Stage + Medal Race remains one coordinated analytical block with two distinct data contracts.

### `validation/`

Fail-hard quality gates for historical geography, Cold War data contracts and final repository integrity.

## Normal rebuild

Install dependencies:

```bash
python -m pip install -r preprocessing/requirements.txt
```

Then, from the repository root:

```bash
python preprocessing/build_all.py
```

`build_all.py`:

1. refreshes the local Rivalry Pulse intermediate from committed validated Olympedia material;
2. rebuilds `intermediate/cold_war_olympic_common.csv` directly from the canonical Olympic source;
3. executes the seven chart notebooks, including `who_won_cumulative.ipynb`;
4. runs final repository validation.

The normal build performs **no network requests** and does **not** require R. The committed Olympedia cache/crosswalk and CShapes-derived TopoJSON files make the data rebuild reproducible offline once Python dependencies are installed.

## Historical geography

The canonical geographic source is **CShapes 2.0** using the Gleditsch-Ward state coding system. See `source/geography/SOURCE.md`.

```text
Olympic source                    CShapes 2.0
NOC + historical delegation      historical state + GW code
        \                              /
         -> olympic_geography_mapping.csv
```

`source/geography/olympic_geography_mapping.csv` is a project-authored crosswalk, not an additional external canonical dataset. It links every Summer Olympic delegation in scope (1952–1988) to its historical CShapes state(s), or records an explicit exclusion when the sovereign-state choropleth has no admissible geometry.

To intentionally rebuild/audit geographic derivatives:

1. install R, the official `cshapes` package and `mapshaper`;
2. run `source/geography/generate_cshapes_snapshots.R`;
3. execute/review `source/geography/build_olympic_geography_mapping.ipynb`;
4. run `validation/validate_geography.py`.

This optional source-reconstruction path is separate from the normal chart-data rebuild.

## Olympedia acquisition

Live acquisition is intentionally separate from the normal build. See `source/olympedia/README.md` for the cache-first, rate-limited procedure. The committed cache and validated intermediate are sufficient for an offline Rivalry Pulse rebuild.

## Fail-hard geography policy

For every Summer Olympic `NOC × edition` in 1952–1988, the audit requires exactly one explicit result:

- mapped to one or more valid CShapes/Gleditsch-Ward codes; or
- explicitly excluded with a documented reason.

The build fails on missing/overlapping mapping rules, unknown GW codes, missing exclusion reasons or collisions where unrelated Olympic delegations claim the same `Year × GW` geometry.
