# Gold Rush — Olympic Cold War Data Visualization

**Author:** Roberto Lazzarini  
**Course deliverable:** Data Visualization final project  
**Frontend:** HTML, CSS, JavaScript ES modules, D3.js v7, TopoJSON Client, Bootstrap 5  
**Deployment target:** public GitHub repository + GitHub Pages

Gold Rush is a static, reproducible data-visualization project focused on the USA–USSR Olympic rivalry during the Cold War. The final page contains four analytical blocks followed by one definitive Local Ripple synthesis answering Who Won.

## Analytical scope

The story uses Summer Olympics from 1952 through 1988:

1. **The Arms Race** — overlapping USA/USSR nuclear-stockpile areas on a normal 1945–1991 timeline, with Olympic years as secondary vertical annotations and an IronNeverden-style crosshair tooltip that also reports the lead.
2. **The World Stage + The Medal Race** — one coordinated 64/36 historical choropleth + medal ranking view.
3. **The Sporting Fronts** — cumulative horizontal diverging USA-minus-USSR medal differences by sport across joint-participation Summer Games.
4. **The Rivalry Pulse** — one dot per verified direct USA–USSR encounter, bottom-anchored to a fixed global y-scale; validated numeric final scores are shown in tooltips when available.
5. **Who Won — Battle Strip: Local Ripple** — a deep navy/burgundy expanded surface with brighter standard-color donut slices.

The Local Ripple Battle Strip uses a square-root circle-area scale, in-chart three-circle legend, local-repulsion geometry and hover/click/keyboard interaction. Its expanded surface retains a dark tint of the edition winner's color, including the outer edge.

Moscow 1980 and Los Angeles 1984 are represented as boycotts/non-participation, never as zero-performance results. Sporting Fronts excludes those editions because its rivalry comparison requires joint participation. Local Ripple retains both editions as shared empty outlined boycott markers and excludes them from winner/margin calculations. World Stage and Medal Race also retain boycott context.

## Repository structure

```text
.
├── preprocessing/
│   ├── README.md
│   ├── requirements.txt
│   ├── source/
│   │   ├── olympics/
│   │   ├── nuclear/
│   │   ├── olympedia/
│   │   └── geography/
│   ├── intermediate/
│   │   ├── cold_war_olympic_common.csv
│   │   └── rivalry_pulse_matches.csv
│   ├── charts/
│   │   ├── common.py
│   │   ├── arms_race.ipynb
│   │   ├── world_stage.ipynb
│   │   ├── medal_race.ipynb
│   │   ├── sporting_fronts.ipynb
│   │   ├── rivalry_pulse.ipynb
│   │   ├── who_won.ipynb
│   │   └── who_won_cumulative.ipynb
│   ├── validation/
│   └── build_all.py
├── data/final/
│   ├── cold_war/
│   │   ├── arms_race.csv
│   │   ├── world_stage.csv
│   │   ├── medal_race.csv
│   │   ├── sporting_fronts.csv
│   │   ├── rivalry_pulse.csv
│   │   ├── who_won.csv
│   │   └── who_won_cumulative.csv
│   └── geography/
│       └── basemaps/cshapes-YYYY.topo.json
├── scripts/final/cold_war/
│   ├── app.js
│   ├── components/
│   │   ├── boycott-marker.js  # shared dotted/no-fill boycott annotation renderer
│   │   └── legend-focus.js    # shared legend-driven fade/focus controller
│   ├── core/              # config/data/geography + CSS→D3 theme bridge
│   ├── utils/
│   └── visualizations/
├── pages/final/olympic_gold_rush.html
├── cold_war.css
├── style.css
├── index.html
└── start_server.bat
```

The data architecture is organized by **data state**:

```text
canonical/source material
          ↓
preprocessing intermediate data
          ↓
chart-specific notebook transformations
          ↓
visualization-ready data/final contracts
          ↓
D3.js
```

See `preprocessing/README.md` for the detailed build contract.

## Visual theme architecture

The frontend follows the same architectural direction as the IronNeverden reference: **JavaScript owns data/state/interaction, while CSS owns presentation**. `style.css` contains project-wide page tokens; `cold_war.css` contains the semantic Cold War visualization theme.

Shared visual semantics live in `scripts/final/cold_war/components/`. In particular, `components/boycott-marker.js` is the single SVG implementation used by **Rivalry Pulse** and **Local Ripple** for boycott annotations. The component owns the D3 join and semantic markup; each chart supplies only its geometry. The common dotted/no-fill appearance is controlled by `.cw-boycott-marker-*` rules and `--cw-boycott-marker-*` tokens in `cold_war.css`. `components/legend-focus.js` supplies the shared legend-driven highlight/fade behavior, while the Local Ripple module owns its complete chart state and rendering lifecycle.

```text
style.css
  ↓ generic page tokens (--ink, --muted, --line, --paper, ...)

cold_war.css
  ↓ Cold War semantic tokens (--cw-color-usa, --cw-color-boycott, ...)
  ↓ class-driven chart states (.is-boycott, .is-selected, .is-dimmed, ...)

core/theme.js
  ↓ reads CSS tokens only when D3 genuinely needs a numeric/color value

visualizations/*.js
  ↓ data joins, scales, state and interaction
```

For example, changing the global boycott outline color now requires exactly one edit:

```css
--cw-color-boycott: #742e8b;
```

That token drives the World Stage boycott outline, map status legend, boycott labels/lines and status-strip accent. The former duplicated JS palette (`CW_COLORS`) and stale CSS boycott color have been removed. World Stage country borders are class-driven (`is-boycott`, `is-selected`, `is-hovered`), so their widths are controlled only by the CSS theme tokens:

```css
--cw-country-stroke-normal: 0.55;
--cw-country-stroke-boycott: 1.8;
--cw-country-stroke-highlight: 1.5;
```

`core/config.js` is intentionally restricted to data URLs, edition sets and behavioral timings; it no longer owns visual colors or opacity/style values.

### Typography and quantitative chart grammar

The visual typography follows the IronNeverden reference closely: Roboto Slab for chart titles, Fira Sans for chart subtitles/body/axes, a `1.4rem` chart-title scale, `1rem` italic subtitles, and `16px` primary quantitative-axis text. Narrative copy remains constrained to a `75ch` reading measure. Quantitative charts share light `4 4` dashed grid lines and restrained line shadows rather than chart-specific ad-hoc scale styling.

## Data sources

### Olympic data

Canonical Olympic files used by the Cold War pipeline live in:

```text
preprocessing/source/olympics/
```

`120_years_olympic_history_OG.csv` is the athlete-level Olympic history snapshot used for participation and medal aggregation. Team awards are deduplicated at `Year × City × Sport × Event × NOC × Medal`, so one team medal counts once rather than once per athlete.

`Olympic_Athlete_Event_Results.csv` supplies Olympedia result IDs and athlete/event metadata for the Rivalry Pulse acquisition process.

### Olympedia direct encounters

Source: https://www.olympedia.org/

`preprocessing/source/olympedia/` contains the cache-first acquisition/parser software, local HTML cache, audit outputs, tests and documentation for Rivalry Pulse. The final Rivalry Pulse contract includes only validated literal binary USA–USSR encounters. The normal build uses committed local material and performs no web requests.

### Historical geography

Canonical geographic source: **CShapes 2.0**, maintained by ETH Zürich’s International Conflict Research group and used with Gleditsch-Ward state identifiers.

Official source: https://icr.ethz.ch/data/cshapes/

Reference publication: Schvitz et al. (2022), *Mapping the International System, 1886–2019: The CShapes 2.0 Dataset*, Journal of Conflict Resolution 66(1), 144–161, DOI 10.1177/00220027211013563.

The source-side files are under:

```text
preprocessing/source/geography/
```

`generate_cshapes_snapshots.R` queries CShapes at January 1 of each Olympic year and generates the committed TopoJSON basemaps in `data/final/geography/basemaps/`.

Olympic NOC codes and Gleditsch-Ward codes are not treated as interchangeable. `olympic_geography_mapping.csv` is a **project-authored crosswalk** produced by combining the Olympic participation source with the corresponding CShapes state snapshots. It stores historical display names and valid GW code(s), and explicitly records exclusions where the adopted sovereign-state choropleth has no admissible geometry.

### Nuclear stockpiles

The committed source snapshot is:

```text
preprocessing/source/nuclear/nuclear-warhead-stockpiles-lines.csv
```

It comes from the Our World in Data nuclear-warhead stockpile series, based on Federation of American Scientists data. For the Cold War Arms Race context, the source's historical `Russia` series is treated as the Soviet/USSR series for 1945–1991. That convention is applied in preprocessing and documented rather than hidden in D3.

## Geographic processing

```text
Olympic source                     CShapes 2.0
NOC + historical delegation       state geometry + GW code
            \                         /
             \                       /
              olympic_geography_mapping.csv
                         ↓
                  charts/common.py
                         ↓
       intermediate/cold_war_olympic_common.csv
                         ↓
              charts/world_stage.ipynb
                         ↓
            data/final/cold_war/world_stage.csv
                         ↓
                       D3.js
```

The geographic audit:

1. extracts every Summer Olympic `NOC × edition` from 1952–1988;
2. resolves it against the relevant CShapes state snapshot;
3. uses conservative matching only as a candidate mechanism;
4. explicitly reviews historical, composite and non-sovereign cases;
5. preserves historical delegation names;
6. fails if coverage is incomplete, a GW code is invalid, or unrelated delegations collide on the same `Year × GW`.

Regression checks include Chad/China, Cambodia/Cameroon, Mauritius/Madagascar, North/South Yemen, South Vietnam, United Arab Republic and the United Team of Germany.

## Shared Olympic intermediate

`preprocessing/charts/common.py` builds:

```text
preprocessing/intermediate/cold_war_olympic_common.csv
```

The primary grain is `Olympic edition × NOC`, enriched with historical names, GW codes, mapping status/reason, medal counts, actual award denominators, medal shares and participation/boycott status.

World Stage, Medal Race, Sporting Fronts and Local Ripple consume this shared model. Rivalry Pulse follows its separate Olympedia-backed provenance chain.

## Visualization 2 — World Stage + Medal Race

The final implementation keeps a single **map-led 64/36 split** on desktop. Below Bootstrap's `lg` breakpoint the two views stack rather than being compressed into unreadable columns.

### World Stage

```text
TotalMedalShare = country total medals / all medal awards in the edition
GoldMedalShare  = country gold medals  / all gold awards in the edition
```

The map uses a fixed global 1952–1988 domain for each metric. Participating zero-medal delegations use the neutral no-medal fill. USA in 1980 and USSR in 1984 use that exact same neutral fill; boycott status is encoded separately through a dashed outline, tooltip text and a status strip below the Medal Race.

Historical geography changes discretely between CShapes snapshots. The frontend switches to the correct edition geometry without interpolating incompatible SVG paths; the medal-share color encoding transitions smoothly.

### Medal Race

The ranking contains only **medal-winning participating delegations**. There is no `no medals` fill or synthetic zero bar in the Medal Race.

Total mode ranking:

```text
Total ↓ → Gold ↓ → Silver ↓ → Bronze ↓ → Country ↑
```

Gold mode ranking:

```text
Gold ↓ → Silver ↓ → Bronze ↓ → Country ↑
```

At desktop widths (>=1000px), the narrow 36% panel does not scale down a large SVG. `ResizeObserver` measures the real panel width; rank labels, country labels, row height, bar thickness and typography remain full-size, while only the quantitative x-range becomes shorter. The top x-axis is recomputed and animated for every Olympic edition, with ordinary dashed vertical guides derived from the current tick values. There is no special 100-medal reference line.

Gold/Silver/Bronze composition is explained by a compact static legend **below the Medal Race panel**, so it consumes no horizontal plotting space. Below 1000px, the Medal Race stacks under the map and its scrollable viewport is deliberately shortened to show roughly five rows at a time without removing any ranking rows or interactions.

## Chart help interaction

All seven visualization views use one shared `createChartHelp()` component modeled closely on the IronNeverden reference:

```text
chart
↓
ⓘ How to read the chart?
```

The trigger is aligned to the left below the visualization. Hovering it displays a local translucent overlay over that chart only; leaving the trigger hides it. The overlay's short divider follows the reference design but uses a **green** accent instead of red.

World Stage + Medal Race is treated as one coordinated visualization, so one help overlay covers both views. Its lower row is aligned to the 64/36 split: chart help on the left, Gold/Silver/Bronze legend on the right. The boycott status strip, when present, sits at the bottom of the Medal Race column. It can be disabled through `showBoycottStatus: false`; because the strip then remains `hidden`, the ranking automatically reclaims the full available panel height.

## Other chart methodology

### Sporting Fronts

```text
difference = USA medals − USSR medals
```

Negative values represent Soviet advantage and positive values American advantage. The final chart is horizontal: sports stay on the y-axis, bars extend left for a Soviet advantage and right for an American advantage. The visualization is cumulative only; there is no per-edition control. Runtime rendering uses the precomputed `ALL` rows, which aggregate only joint-participation editions:

```text
1952, 1956, 1960, 1964, 1968, 1972, 1976, 1988
```

### Rivalry Pulse

One filled dot equals one verified binary encounter. The committed contract contains 184 encounters. Dots always stack upward from the baseline against one global y-domain, so filters never expand a few encounters across the full chart height. Color encodes outcome. Clicking a winner category in the legend fades non-matching dots to low opacity and restores them with a shared 200 ms CSS fade when focus changes or is cleared. The same controller is reused independently by each Local Ripple candidate. Every Rivalry Pulse tooltip contains one gray divider between encounter identity and result details; the final-score row remains conditional.

### Who Won the Olympic Cold War? — Battle Strip: Local Ripple

Each candidate reuses `who_won.csv`; no new preprocessing contract is introduced. Every jointly attended edition becomes one timeline circle whose color identifies the edition winner and whose area encodes the absolute selected-medal margin. Hover or click expands the selected mark in place and locally repels nearby dates. The thick outer donut prints the exact USA and USSR medal counts inside the corresponding slices; the center retains only the exact winning margin.

The definitive implementation is `who-won-battle-strip.js`. Its expanded surface uses a deep tint of the winner hue, including the outer edge, while its donut retains the standard brighter USA and USSR colors.

## Build preprocessing

Python 3.10+ is recommended.

Install dependencies:

```bash
python -m pip install -r preprocessing/requirements.txt
```

Then run from the repository root:

```bash
python preprocessing/build_all.py
```

The orchestrator rebuilds the shared intermediate, executes all seven chart notebooks and runs repository validation. It does not perform live Olympedia scraping and does not regenerate CShapes during a normal build.

### Optional CShapes regeneration

The committed TopoJSON files and crosswalk make normal builds independent of R. To intentionally regenerate/audit historical geography, see `preprocessing/source/geography/README.md`. That optional workflow requires R, the official `cshapes` package and `mapshaper`.

### Optional Olympedia reacquisition

Live Olympedia acquisition is intentionally separate from the normal build. See `preprocessing/source/olympedia/README.md`. The downloader is sequential, cache-first and rate-limited.

## Validation

Run the full validator:

```bash
python preprocessing/validation/validate_repository.py
```

Or run the two domain checks directly:

```bash
python preprocessing/validation/validate_geography.py
python preprocessing/validation/validate_cold_war.py
```

The geography validator audits all 176 NOCs and all 1,022 actual `NOC × edition` participation records in the Summer 1952–1988 scope. The shared model contains 1,024 rows after adding the explicit 1980 USA and 1984 USSR boycott records.

The repository validator also checks that removed legacy frontend/data contracts have not been reintroduced and that the final page contains one and only one 64/36 World Stage coordinated view.

The Olympedia parser regression suite can be run with:

```bash
cd preprocessing/source/olympedia
python -m unittest discover -s tests -v
```

## Run the website locally

The repository is self-standing for normal use: all visualization-ready CSVs, the Olympedia cache/intermediate material and the required historical TopoJSON basemaps are committed.

From the repository root:

```bash
python -m http.server 8000
```

or on Windows double-click `start_server.bat`, which uses port `8024` and opens the browser automatically.

For the manual `python -m http.server 8000` command, open:

```text
http://localhost:8000/
```

Do not open the final HTML through `file://`; ES modules and data fetches require HTTP. The frontend currently loads D3, TopoJSON Client, Bootstrap and Google Fonts from CDNs, so normal viewing requires network access to those CDN assets.

## GitHub Pages

There is no frontend build step. Runtime assets and visualization-ready data are committed static files, making the project compatible with repository-subpath deployment on GitHub Pages.

Typical deployment:

1. push the repository to a public GitHub repository;
2. open **Settings → Pages**;
3. choose **Deploy from branch**;
4. select `main` and `/(root)`;
5. open the generated Pages URL.

## Methodology and limitations

The final page visibly includes Header, Hero, Methodology, Team and Footer. Methodology describes source provenance, cleaning, transformation, derived metrics, data-to-visualization flow and limitations.

Important limitations include:

- CShapes/Gleditsch-Ward represents the adopted historical sovereign-state geography; delegations without an admissible geometry are explicitly excluded rather than attached to a misleading state;
- historical/composite Olympic identities require a curated crosswalk between Olympic and CShapes coding systems;
- Rivalry Pulse prioritizes precision over recall and includes only source-backed literal binary encounters;
- the nuclear source's historical `Russia` label is interpreted as the Soviet series within the specified Cold War context;
- Winter Olympics are outside the analytical scope.

## Reference project

`ironneverden-main.zip`, a previous high-scoring Data Visualization final project, was used as the primary architectural reference for static-data preprocessing, D3 organization, responsive chart sizing and the lightweight local `How to read the chart?` interaction. Domain-specific narrative and visualization logic were not copied.

## Team

**Roberto Lazzarini** — individual project; data sourcing, preprocessing, analysis, D3.js visualization development, frontend, methodology and documentation.


### UI refinement v3.25

The five chart-help interactions now mirror IronNeverden's lightweight hover pattern: the trigger sits below and left of each visualization, the overlay is local to the chart wrapper, and the only deliberate visual divergence is a green divider below the help title. In the coordinated World Stage + Medal Race view, the two upper visualization frames are synchronized to equal height on desktop; the help trigger and Gold/Silver/Bronze legend occupy the same footer row under the left and right columns respectively.
