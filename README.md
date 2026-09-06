# The Olympic Cold War

## Data Visualization final project

## Author: Roberto Lazzarini (4937188)

This project examines the the Olympic dimension of the Cold War through Summer Olympic results from 1952 to 1988. After a brief contextual analysis of nuclear stockpile estimates, it analyzes and highlightes patterns among Olympic medal records and verified direct USA-USSR encounters and tries to answer to the burning question of "Who won the olympic Cold War?".

## Repository structure

```text
.
├── data/
│   └── final/
│       ├── cold_war/                 # CSV files loaded by D3
│       └── geography/basemaps/       # Historical CShapes TopoJSON maps
├── pages/final/
│   └── olympic_gold_rush.html        # Main website page
├── preprocessing/
│   ├── source/                       # Source datasets and ad-hoc dataset builders
│   ├── intermediate/                 # Derived datasets (reused later by multiple scripts)
│   ├── charts/                       # Chart-specific preprocessing notebooks
│   ├── build_all.py                  # Main preprocessing entry point
│   └── repruduction_documentation.md # Reproduction instructions
├── scripts/
│   └── final/
│       └── cold_war/
│           ├── app.js                # Application entry point: loads data and mounts
│           ├── core/
│           │   ├── config.js         # Shared constants and browser data paths
│           │   ├── data.js           # D3 CSV/JSON loaders and type conversion
│           │   ├── geography.js      # Historical TopoJSON loading and geographic helpers
│           │   └── theme.js          # Shared visual theme values
│           ├── visualizations/       # One D3 module for each visualization
│           ├── components/           # Reusable UI and interaction components
│           └── utils/                # Shared axis and analytical components
├── fonts/ and imgs/                  # Local graphical assets
├── index.html                        # Redirect to the final project page
├── style.css
└── cold_war.css

