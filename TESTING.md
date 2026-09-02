# Gold Rush — Test Checklist

Use this checklist for the final refactored repository.

## 1. Start the site

### Windows

Double-click:

```text
start_server.bat
```

The batch file serves the repository on:

```text
http://localhost:8024/
```

### Any platform

From the repository root:

```bash
python -m http.server 8000
```

then open `http://localhost:8000/`.

Do not open the page through `file://`; ES modules and `fetch()` require HTTP.

Open DevTools → Console. The final build marker is:

```text
[Cold War build] v3.33.1-local-ripple-color-variants-syntax-fix
```

There should be no uncaught JavaScript errors or local 404s.

## 2. Final narrative structure

The page must contain exactly these analytical blocks before Methodology:

1. The Arms Race
2. The World Stage + The Medal Race
3. The Sporting Fronts
4. The Rivalry Pulse
5. Who Won — Battle Strip: Local Ripple

After Local Ripple, the next content must be Methodology / Team / Footer. The discarded dumbbell, Winner Margin, Cumulative Medal Race, Cumulative Difference and experimental Local Ripple variants must not appear.

## 3. World Stage + Medal Race

There is one final coordinated view, not three experimental variants.

### Desktop layout

At viewport width >= 1000 CSS px:

```text
World Stage ~64% | Medal Race ~36%

For boycott editions, the status strip must appear below the Medal Race, not above it. The strip is optional at runtime: setting `showBoycottStatus: false` in the Medal Race options must hide it and return its height to the scrollable ranking.
```

The map remains visually dominant. The Medal Race is visible at the same time.

### Responsive layout

Below 1000 CSS px the Medal Race moves below the map. Its viewport must be short enough to show roughly five ranking rows at once, while **all** ranking rows remain present and vertically scrollable with sticky header, hover, tooltip, click/select and linked-view behavior intact.

### Medal Race readability

The 36% panel must not look like a scaled-down screenshot of a wide chart:

- country/rank font size remains readable;
- row height remains approximately full-size;
- medal bar thickness remains full-size;
- only the horizontal quantitative plotting range becomes shorter;
- resizing the browser recomputes the plot with `ResizeObserver`.

### Moving quantitative axis

Switch between editions with very different leader totals. Verify that:

- the top x-axis domain/ticks change with the edition;
- bars transition to the new scale;
- dashed vertical quantitative guides move with the ticks;
- there is no special `100 medals` reference line; only ordinary dashed guides associated with current x-axis ticks are shown.

### Medal composition legend

Gold / Silver / Bronze is shown as a compact static legend below the Medal Race panel. It must not consume horizontal plotting space and it must not act as the old interactive series-focus control.

### Boycotts

Check 1980 and 1984 carefully:

- **1980 USA:** same neutral map fill as ordinary no-medal delegations, plus dashed boycott outline/status/tooltip;
- **1984 USSR:** same rule;
- a boycott must never receive a dark medal-share fill;
- boycotting superpowers are absent from the Medal Race ranking rather than rendered as zero/no-medal bars.

### Linked views

Hover/click a delegation on either view:

- map and ranking should highlight the same NOC;
- selecting a country on the map should scroll its Medal Race row into view when present;
- changing edition/metric clears stale selection/hover state.

### Playback

1. Play starts at the current edition.
2. Pause preserves the current edition.
3. At the final edition, Play restarts from 1952.
4. Manual year/metric changes stop playback.
5. Map and Medal Race always use the same year and metric state.

## 4. How to read the chart?

There must be exactly seven triggers: one for each core/beta visualization view, with World Stage + Medal Race still sharing a single coordinated help overlay.

Each trigger must be:

- directly below its visualization;
- aligned to the left;
- rendered as the small info icon + `How to read the chart?` text, closely following IronNeverden.

Hover the trigger:

- a local semi-transparent overlay appears over that visualization only;
- leaving the trigger hides it;
- there is no close `×`, outside-click modal behavior or Escape-based persistent dialog;

Inside the overlay, verify that the short divider below the title is **green**.

For World Stage + Medal Race there must be one help trigger/overlay covering the entire coordinated chart, not separate help controls for map and ranking.

At desktop width the lower row should visually align as:

```text
How to read... (under map side) | Gold / Silver / Bronze (under Medal Race side)
```

## 5. Other analytical blocks

### Arms Race

- 1945–1991 data renders;
- USA/USSR areas overlap from a common zero baseline;
- the main x-axis is a normal 1945–1991 timeline;
- Olympic years appear only as lighter secondary vertical guides/annotations;
- moving anywhere across the plot reveals a dashed vertical crosshair, USA and USSR values, and the current lead/difference;
- line/area styling uses the IronNeverden-like light grid and subtle shadow;
- click/legend focus and reset behavior still work.

### Sporting Fronts

- 1980 and 1984 are excluded;
- Total/Gold and All games/H2H controls work; there is no Edition control;
- every state is cumulative across the joint-participation editions only;
- bars are horizontal: left of zero means USSR advantage, right of zero means USA advantage;
- sport labels remain horizontal and readable on the y-axis;
- "Soviet advantage" is Soviet red and "American advantage" is USA blue;
- vertical quantitative grid lines are light and dashed.

### Rivalry Pulse

- final dataset contains 184 encounters;
- team/individual and sport filters work;
- clicking USA win / USSR win / Draw in the legend fades non-matching dots out and matching dots back in over about 200 ms without changing the fixed y-domain;
- dots always stack from the baseline and do not expand vertically after filtering;
- the y-axis remains visible and fixed across filters;
- every tooltip contains exactly one gray divider between encounter identity and result details;
- numeric final scores appear below that divider only when the runtime CSV contains both `USAScore` and `USSRScore`;
- transitions animate dot enter/update/exit without rescaling the y-axis.

### Who Won — Battle Strip: Local Ripple

- Total/Gold switch works without loading a new CSV;
- Total medals yield USA 2 / USSR 6 comparable edition wins; Gold medals yield USA 3 / USSR 5;
- circle area increases with the absolute per-edition winning margin and the three-circle in-chart legend updates with the metric;
- 1980/1984 remain shared empty boycott markers and never enter the edition-win count;
- the legend contains only United States / Soviet Union and isolates editions won by the selected side;
- hover and keyboard focus preview the local expansion; click, Enter or Space pin it and Escape closes it;
- the thick donut prints the USA and USSR medal totals inside their slices, while the center prints only the exact winning margin;
- neighboring marks and timeline ticks move locally to clear the expanded circle, while distant editions remain near their baseline positions;
- Local Ripple uses deep navy/burgundy for the expanded fill and outer edge, while retaining standard brighter colors for donut slices;
- the definitive view has one module, import, initialization task, HTML section, control and legend ID.

## 6. Automated validation

Install dependencies once:

```bash
python -m pip install -r preprocessing/requirements.txt
```

Run the complete rebuild and validation:

```bash
python preprocessing/build_all.py
```

Expected final line:

```text
BUILD SUCCESSFUL
```

Run validators directly if needed:

```bash
python preprocessing/validation/validate_geography.py
python preprocessing/validation/validate_cold_war.py
python preprocessing/validation/validate_repository.py
```

Each must finish with `VALIDATION PASSED`.

The repository validator also verifies that removed legacy frontend/data artifacts are absent.


## 7. Theme centralization

Open `cold_war.css` and verify that the semantic theme is defined once at the top. In particular:

```text
--cw-color-boycott
--cw-color-usa
--cw-color-ussr
--cw-color-gold / silver / bronze
--cw-country-stroke-normal / boycott / highlight
```

Change `--cw-color-boycott` temporarily and reload: the World Stage boycott outline, its map-legend swatch, the Medal Race status strip accent, Arms Race boycott markers and boycott labels must all change together. Restore the committed value afterwards.

For the two chart-level boycott rectangles, verify that **Rivalry Pulse** and **Who Won the Olympic Cold War?** both render an empty dotted rectangle with the same stroke/label treatment. Both visualizations must import `components/boycott-marker.js`; there must be no visualization-specific `.cw-pulse-boycott-band` or `.cw-who-boycott-band` implementation. Adjusting `--cw-boycott-marker-stroke-width`, `--cw-boycott-marker-dash`, or `--cw-boycott-marker-label-size` must affect both charts. Regression check: neither boycott rectangle may ever render with SVG's default black fill; the rectangle must remain `fill: none` and the label/stroke must resolve from `--cw-color-boycott`.

`scripts/final/cold_war/core/config.js` must not contain `CW_COLORS`. `core/theme.js` is the only CSS→D3 bridge and should contain no hardcoded palette fallbacks.

## 8. JavaScript syntax

With Node.js installed, from the repository root:

```bash
for f in $(find scripts -name '*.js'); do node --check "$f" || exit 1; done
```

On Windows PowerShell:

```powershell
Get-ChildItem scripts -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

## 9. Olympedia parser regression suite

```bash
cd preprocessing/source/olympedia
python -m unittest discover -s tests -v
```

Return to the repository root before running the normal preprocessing build.
