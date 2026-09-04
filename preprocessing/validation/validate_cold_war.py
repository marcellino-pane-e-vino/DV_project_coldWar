#!/usr/bin/env python3
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FINAL = ROOT / "data" / "final" / "cold_war"
PAGE = ROOT / "pages" / "final" / "olympic_gold_rush.html"
BASE = ROOT / "scripts" / "final" / "cold_war"
RIVALRY_YEARS = {1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988}
JOINT_YEARS = {1952, 1956, 1960, 1964, 1968, 1972, 1976, 1988}


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def main() -> None:
    errors: list[str] = []

    files = [
        "arms_race.csv",
        "world_stage.csv",
        "medal_race.csv",
        "sporting_fronts.csv",
        "rivalry_pulse.csv",
        "who_won.csv",
        "who_won_cumulative.csv",
    ]
    for filename in files:
        if not (FINAL / filename).exists():
            errors.append(f"Missing data/final/cold_war/{filename}")

    required_modules = [
        "app.js",
        "components/chart-help.js",
        "components/boycott-marker.js",
        "components/legend-focus.js",
        "core/config.js",
        "core/theme.js",
        "core/data.js",
        "core/geography.js",
        "visualizations/arms-race.js",
        "visualizations/world-stage.js",
        "visualizations/medal-race.js",
        "visualizations/sporting-fronts.js",
        "visualizations/rivalry-pulse.js",
        "visualizations/who-won-battle-strip.js",
    ]
    for module in required_modules:
        if not (BASE / module).exists():
            errors.append(f"Missing scripts/final/cold_war/{module}")

    discarded_who_won_modules = [
        "visualizations/who-won.js",
        "visualizations/who-won-margin.js",
        "visualizations/who-won-cumulative.js",
        "visualizations/who-won-difference.js",
        "visualizations/who-won-battle-strip-ripple.js",
        "visualizations/who-won-battle-strip-neutral-surface.js",
        "visualizations/who-won-battle-strip-dark-tint.js",
        "visualizations/who-won-battle-strip-separator-ring.js",
    ]
    for module in discarded_who_won_modules:
        if (BASE / module).exists():
            errors.append(f"Discarded Who Won module still present: {module}")

    if errors:
        print("\n".join(errors))
        raise SystemExit(1)

    arms = rows(FINAL / "arms_race.csv")
    years = {int(r["Year"]) for r in arms}
    if years != set(range(1945, 1992)):
        errors.append("Arms Race must contain every year 1945-1991")
    for row in arms:
        if (num(row["USA_Warheads"]) or 0) < 0 or (num(row["USSR_Warheads"]) or 0) < 0:
            errors.append("Negative nuclear stockpile value")

    world = rows(FINAL / "world_stage.csv")
    if {int(r["Year"]) for r in world} != RIVALRY_YEARS:
        errors.append("World Stage edition set mismatch")
    for row in world:
        for column in ["TotalMedalShare", "GoldMedalShare"]:
            value = num(row[column])
            if value is not None and not 0 <= value <= 1:
                errors.append(f"{column} outside [0,1]")

    if not any(r["Year"] == "1980" and r["NOC"] == "USA" and r["ParticipationStatus"] == "boycott" for r in world):
        errors.append("Missing 1980 USA boycott row")
    if not any(r["Year"] == "1984" and r["NOC"] == "URS" and r["ParticipationStatus"] == "boycott" for r in world):
        errors.append("Missing 1984 USSR boycott row")
    if not any(r["ParticipationStatus"] == "participated" and num(r["TotalMedals"]) == 0 for r in world):
        errors.append("World Stage lacks zero-medal participants")

    required_geo_columns = {"MappingStatus", "MappingReason", "GwCodes"}
    if world and not required_geo_columns.issubset(world[0].keys()):
        errors.append("World Stage missing audited geography columns")

    regression_geo = {
        ("1968", "CHA"): ("Chad", "483"),
        ("1964", "CAM"): ("Cambodia", "811"),
        ("1984", "MRI"): ("Mauritius", "590"),
        ("1984", "MTN"): ("Mauritania", "435"),
        ("1968", "VNM"): ("South Vietnam", "817"),
        ("1988", "YMD"): ("South Yemen", "680"),
    }
    world_index = {(r["Year"], r["NOC"]): r for r in world}
    for key, (country, gw) in regression_geo.items():
        row = world_index.get(key)
        if not row or row.get("Country") != country or row.get("GwCodes") != gw:
            errors.append(f"World Stage geography regression for {key}: expected {country} / GW {gw}")
    if any(r.get("Country") == "Yeoman" for r in world):
        errors.append("World Stage contains sailing-boat label Yeoman as a country")

    race = rows(FINAL / "medal_race.csv")
    if not any(r["Year"] == "1980" and r["NOC"] == "USA" and r["ParticipationStatus"] == "boycott" for r in race):
        errors.append("Medal Race missing 1980 status row")
    if not any(r["Year"] == "1984" and r["NOC"] == "URS" and r["ParticipationStatus"] == "boycott" for r in race):
        errors.append("Medal Race missing 1984 status row")

    race_index = {(r["Year"], r["NOC"]): r for r in race}
    expected_medals = {
        ("1960", "TPE"): (0, 1, 0, 1),
        ("1960", "WIF"): (0, 0, 2, 2),
        ("1968", "TPE"): (0, 0, 1, 1),
        ("1984", "TPE"): (0, 0, 1, 1),
    }
    for key, expected_counts in expected_medals.items():
        row = race_index.get(key)
        actual = tuple(
            int(float(row[column])) if row and row.get(column) else 0
            for column in ["GoldMedals", "SilverMedals", "BronzeMedals", "TotalMedals"]
        )
        if row is None or actual != expected_counts:
            errors.append(
                f"Medal Race canonical-source regression for {key}: expected {expected_counts}, "
                f"found {actual if row else None}"
            )

    fronts = rows(FINAL / "sporting_fronts.csv")
    numeric_years = {int(r["Year"]) for r in fronts if r["Year"] != "ALL"}
    if numeric_years != JOINT_YEARS:
        errors.append(f"Sporting Fronts must use joint-participation years only: {sorted(numeric_years)}")
    if any(r["Year"] in {"1980", "1984"} for r in fronts):
        errors.append("Sporting Fronts includes boycott edition")
    if {r["Scope"] for r in fronts} != {"all_games", "head_to_head"}:
        errors.append("Sporting Fronts scope mismatch")

    pulse = rows(FINAL / "rivalry_pulse.csv")
    ids = [r["EncounterId"] for r in pulse]
    if len(ids) != len(set(ids)):
        errors.append("Rivalry Pulse EncounterId not unique")
    if not pulse:
        errors.append("Rivalry Pulse empty")
    if any(r["Winner"] not in {"USA", "USSR", "DRAW"} for r in pulse):
        errors.append("Invalid Rivalry Pulse winner")
    if any(r["EncounterType"] not in {"team", "individual"} for r in pulse):
        errors.append("Invalid EncounterType")
    if any(not r["SourceUrl"] for r in pulse):
        errors.append("Rivalry Pulse row without source URL")
    required_score_columns = {"ScoreRaw", "USAScore", "USSRScore"}
    if pulse and not required_score_columns.issubset(pulse[0].keys()):
        errors.append("Rivalry Pulse runtime data missing reproducible score fields")
    paired_numeric_scores = 0
    for row in pulse:
        usa_score = num(row.get("USAScore"))
        ussr_score = num(row.get("USSRScore"))
        if (usa_score is None) != (ussr_score is None):
            errors.append(f"Rivalry Pulse has unpaired numeric score: {row.get('EncounterId')}")
        if usa_score is not None and ussr_score is not None:
            paired_numeric_scores += 1
    if paired_numeric_scores < 1:
        errors.append("Rivalry Pulse contains no numeric final scores")
    sports = {r["Sport"] for r in pulse}
    for expected in {"Basketball", "Volleyball", "Tennis", "Boxing", "Wrestling", "Fencing", "Judo"}:
        if expected not in sports:
            errors.append(f"Expected validated H2H sport missing: {expected}")

    who = rows(FINAL / "who_won.csv")
    if len(who) != 20:
        errors.append("Who Won must have 20 rows (2 superpowers × 10 Cold War editions)")
    if {int(r["Year"]) for r in who} != RIVALRY_YEARS:
        errors.append("Who Won must contain all ten Cold War editions")
    if not any(r["Year"] == "1980" and r["NOC"] == "USA" and r["ParticipationStatus"] == "boycott" for r in who):
        errors.append("Who Won missing 1980 USA boycott row")
    if not any(r["Year"] == "1984" and r["NOC"] == "URS" and r["ParticipationStatus"] == "boycott" for r in who):
        errors.append("Who Won missing 1984 USSR boycott row")

    cumulative = rows(FINAL / "who_won_cumulative.csv")
    if len(cumulative) != 20:
        errors.append("Who Won cumulative must have 20 rows (2 superpowers × 10 Cold War editions)")
    if {int(r["Year"]) for r in cumulative} != RIVALRY_YEARS:
        errors.append("Who Won cumulative must contain all ten Cold War editions")
    required_cumulative_columns = {
        "EditionTotalMedals", "EditionGoldMedals",
        "CumulativeTotalMedals", "CumulativeGoldMedals",
        "ParticipationStatus", "BoycottBy"
    }
    if cumulative and not required_cumulative_columns.issubset(cumulative[0].keys()):
        errors.append("Who Won cumulative runtime data missing required metric/status fields")
    cumulative_by_noc = {noc: sorted([r for r in cumulative if r["NOC"] == noc], key=lambda r: int(r["Year"])) for noc in ("USA", "URS")}
    for noc, noc_rows in cumulative_by_noc.items():
        for field in ("CumulativeTotalMedals", "CumulativeGoldMedals"):
            values = [num(r[field]) for r in noc_rows]
            if any(v is None for v in values) or any(b < a for a, b in zip(values, values[1:])):
                errors.append(f"Who Won cumulative {field} must be monotonic for {noc}")
    cumulative_index = {(r["Year"], r["NOC"]): r for r in cumulative}
    for year, noc in (("1980", "USA"), ("1984", "URS")):
        row = cumulative_index.get((year, noc))
        if not row or row.get("ParticipationStatus") != "boycott":
            errors.append(f"Who Won cumulative missing {year} {noc} boycott row")
        elif row.get("EditionTotalMedals") or row.get("EditionGoldMedals"):
            errors.append(f"Who Won cumulative boycott row {year} {noc} must not encode edition medals")
    expected_final = {
        ("1988", "USA"): (873, 372),
        ("1988", "URS"): (1005, 394),
    }
    for key, expected in expected_final.items():
        row = cumulative_index.get(key)
        actual = (int(num(row["CumulativeTotalMedals"]) or -1), int(num(row["CumulativeGoldMedals"]) or -1)) if row else None
        if actual != expected:
            errors.append(f"Who Won cumulative final regression for {key}: expected {expected}, found {actual}")

    for path in BASE.rglob("*.js"):
        text = path.read_text(encoding="utf-8")
        if re.search(r'from\s+["\'][^"\']*olympics/', text):
            errors.append(f"Cold War runtime imports removed Olympics implementation: {path.relative_to(ROOT)}")
        if path.name != "theme.js" and re.search(r'#[0-9a-fA-F]{3,8}|rgba?\(', text):
            errors.append(
                f"Presentation color literal leaked into JavaScript: {path.relative_to(ROOT)}"
            )

    html = PAGE.read_text(encoding="utf-8")

    # The final narrative contains four preceding chart blocks plus one
    # definitive Local Ripple synthesis.
    help_hosts = [
        "cw-arms-help", "cw-world-help", "cw-sf-help", "cw-pulse-help",
        "cw-who-battle-strip-help",
    ]
    for host in help_hosts:
        if html.count(f'id="{host}"') != 1:
            errors.append(f"Expected exactly one chart-help host {host}")
    if re.search(r'id="cw-world-help-[abc]"', html):
        errors.append("Experimental World Stage help hosts still present")

    required_html_ids = [
        "cw-arms-race",
        "cw-world-map",
        "cw-world-race",
        "cw-world-medal-legend",
        "cw-sporting-fronts",
        "cw-rivalry-pulse",
        "cw-who-battle-strip",
    ]
    for element_id in required_html_ids:
        if f'id="{element_id}"' not in html:
            errors.append(f"Missing HTML id {element_id}")

    discarded_who_won_ids = (
        "cw-who-section",
        "cw-who-margin-section",
        "cw-who-cumulative-section",
        "cw-who-difference-section",
        "cw-who-battle-strip-ripple-section",
    )
    for element_id in discarded_who_won_ids:
        if f'id="{element_id}"' in html:
            errors.append(f"Discarded Who Won view still present: {element_id}")

    if any(token in html for token in ("Variant A", "Variant B", "Variant C", "Experimental build")):
        errors.append("Experimental World Stage variant UI still present")
    if "section-kicker" in html:
        errors.append("Uppercase section kickers must be removed from the final narrative")
    if html.count('class="cw-world-layout cw-world-layout--map-led"') != 1:
        errors.append("Final World Stage must contain exactly one 64/36 map-led layout")
    race_pos = html.find('id="cw-world-race"')
    status_pos = html.find('id="cw-world-status"')
    if race_pos < 0 or status_pos < 0 or status_pos < race_pos:
        errors.append("World Stage boycott status strip must be placed below the Medal Race")

    medal_js = (BASE / "visualizations" / "medal-race.js").read_text(encoding="utf-8")
    if "ResizeObserver" not in medal_js:
        errors.append("Medal Race must recompute its plotting width with ResizeObserver")
    if "cw-medal-reference-line" in medal_js or "cw-medal-reference-label" in medal_js:
        errors.append("Medal Race still contains the removed special 100-medal reference guide")
    if "createInteractiveLegend" in medal_js or "focusedSeries" in medal_js:
        errors.append("Medal Race must not use the old interactive legend/focus behavior")
    if "showBoycottStatus" not in medal_js:
        errors.append("Medal Race must expose the optional boycott-status visibility switch")
    normalized_medal_js = re.sub(r"\s+", " ", medal_js)
    if 'd.ParticipationStatus === "participated" && (d.TotalMedals ?? 0) > 0' not in normalized_medal_js:
        errors.append("Medal Race must contain only medal-winning participating delegations")

    arms_js = (BASE / "visualizations" / "arms-race.js").read_text(encoding="utf-8")
    if "cw-hover-guide" not in arms_js or "nearestDatum" not in arms_js or "warheads" not in arms_js:
        errors.append("Arms Race crosshair/differential hover interaction is missing")
    if "applyCityYearTicks" in arms_js:
        errors.append("Arms Race must use a normal temporal axis, not city/year axis ticks")
    if "cw-arms-olympic-line" not in arms_js:
        errors.append("Arms Race secondary Olympic-year annotations are missing")

    sporting_js = (BASE / "visualizations" / "sporting-fronts.js").read_text(encoding="utf-8")
    if "scaleBand" not in sporting_js or "Math.min(0, d.diff)" not in sporting_js:
        errors.append("Sporting Fronts is not the agreed horizontal diverging-bar implementation")
    if "is-usa-advantage" not in sporting_js or "is-ussr-advantage" not in sporting_js:
        errors.append("Sporting Fronts categorical advantage encoding missing")
    if 'd.Year === "ALL"' not in sporting_js or "yearSelect" in sporting_js or "yearSelectId" in sporting_js:
        errors.append("Sporting Fronts frontend must be cumulative-only with no Edition selector")

    page_html = (ROOT / "pages" / "final" / "olympic_gold_rush.html").read_text(encoding="utf-8")
    app_js = (BASE / "app.js").read_text(encoding="utf-8")
    if "cw-sf-year" in page_html or "yearSelectId" in app_js:
        errors.append("Sporting Fronts Edition control still exists in the page/app contract")
    sporting_section = page_html[page_html.find('id="cw-sporting-fronts-section"'):page_html.find('id="cw-pulse-section"')]
    if "Edition" in sporting_section or sporting_section.count("<select") != 2:
        errors.append("Sporting Fronts must expose only Medals and Competition scope controls; Edition must be absent")

    pulse_js = (BASE / "visualizations" / "rivalry-pulse.js").read_text(encoding="utf-8")
    if "globalMaxStack" not in pulse_js or "pulse-layout" not in pulse_js:
        errors.append("Rivalry Pulse fixed global Y scale / transitions are missing")
    if "USAScore" not in pulse_js or "USSRScore" not in pulse_js:
        errors.append("Rivalry Pulse score tooltip support is missing")
    if '../components/boycott-marker.js' not in pulse_js or "renderBoycottMarkers" not in pulse_js:
        errors.append("Rivalry Pulse must use the shared boycott-marker component")
    for token in ('cityByYear.set(1980, "Moscow")', 'cityByYear.set(1984, "Los Angeles")'):
        if token not in pulse_js:
            errors.append(f"Rivalry Pulse missing boycott-edition host-city fallback: {token}")
    if '../components/legend-focus.js' not in pulse_js or "createLegendFocus" not in pulse_js or "function applyFocus" in pulse_js:
        errors.append("Rivalry Pulse must use the shared legend-focus controller without a local applyFocus implementation")
    if "function rivalryTooltipHtml" not in pulse_js or pulse_js.count('class="cw-tooltip-divider"') != 1:
        errors.append("Rivalry Pulse tooltip must contain one shared always-present divider")

    battle_js = (BASE / "visualizations" / "who-won-battle-strip.js").read_text(encoding="utf-8")
    for token in (
        "createWhoWonBattleStrip",
        "cw-battle-variant",
        "rippleLayout",
        "scaleSqrt",
        "cw-battle-size-legend",
        "cw-battle-focus-donut",
        "cw-battle-donut-label-value",
    ):
        if token not in battle_js:
            errors.append(f"Local Ripple missing {token}")
    if '../components/legend-focus.js' not in battle_js or '../components/boycott-marker.js' not in battle_js:
        errors.append("Local Ripple must reuse shared legend-focus and boycott-marker components")
    if 'label: "United States"' not in battle_js or 'label: "Soviet Union"' not in battle_js:
        errors.append("Local Ripple must contain the two-country legend")
    if "TotalMedals" not in battle_js or "GoldMedals" not in battle_js:
        errors.append("Local Ripple must support total and gold medal metrics")

    focus_component = (BASE / "components" / "legend-focus.js").read_text(encoding="utf-8")
    for token in ("createInteractiveLegend", "is-focus-dimmed", "is-focus-active", "targetGroups"):
        if token not in focus_component:
            errors.append(f"Shared legend-focus component missing {token}")

    boycott_component = (BASE / "components" / "boycott-marker.js").read_text(encoding="utf-8")
    for token in ("cw-boycott-marker", "cw-boycott-marker-rect", "cw-boycott-marker-label"):
        if token not in boycott_component:
            errors.append(f"Shared boycott-marker component missing semantic class {token}")
    for token in (
        '.style("fill", "none")',
        'var(--cw-color-boycott)',
        'var(--cw-boycott-marker-stroke-width, 1.4)',
        'var(--cw-boycott-marker-dash, 5 4)',
        'var(--cw-boycott-marker-label-size, 12px)',
    ):
        if token not in boycott_component:
            errors.append(
                f"Shared boycott-marker defensive presentation missing {token}"
            )

    world_js = (BASE / "visualizations" / "world-stage.js").read_text(encoding="utf-8")
    if "INITIAL_ZOOM_SCALE = 1.25" not in world_js or "initialZoomTransform" not in world_js:
        errors.append("World Stage initial camera configuration regression")
    if "translateExtent" not in world_js or "PAN_BOUNDARY_PADDING" not in world_js:
        errors.append("World Stage finite pan boundary is missing")
    if '"is-boycott"' not in world_js or '"is-selected"' not in world_js or '"is-hovered"' not in world_js:
        errors.append("World Stage must expose class-driven boycott/selection/hover states")
    if 'row.ParticipationStatus ===\n        "boycott"' not in world_js or "CW_THEME.colors.noMedal" not in world_js:
        errors.append("World Stage boycott fill is not explicitly neutralized")
    if "targetStrokeWidth" in world_js or "COUNTRY_STROKE_WIDTH" in world_js:
        errors.append("World Stage stroke presentation leaked back into JavaScript")

    config_js = (BASE / "core" / "config.js").read_text(encoding="utf-8")
    theme_js = (BASE / "core" / "theme.js").read_text(encoding="utf-8")
    if "CW_COLORS" in config_js:
        errors.append("core/config.js must not own visual colors after CSS-first refactor")
    if "getComputedStyle" not in theme_js or "--cw-color-boycott" not in theme_js:
        errors.append("core/theme.js is not a CSS-to-D3 theme bridge")
    if re.search(r'#[0-9a-fA-F]{3,8}', theme_js):
        errors.append("core/theme.js contains hardcoded palette fallbacks instead of CSS tokens")

    help_js = (BASE / "components" / "chart-help.js").read_text(encoding="utf-8")
    if 'mouseenter' not in help_js or 'mouseleave' not in help_js:
        errors.append("Chart help must use IronNeverden-style hover visibility")
    if "cw-help-close" in help_js or 'addEventListener("click"' in help_js:
        errors.append("Old modal-style chart-help behavior still present")

    css = (ROOT / "cold_war.css").read_text(encoding="utf-8")
    if "--cw-help-accent: #2e7d32" not in css or "background: var(--cw-help-accent)" not in css:
        errors.append("Chart-help divider is not configured with the requested green accent")
    if "--cw-focus-transition: 200ms" not in css or ".cw-focus-target.is-focus-dimmed" not in css:
        errors.append("Shared legend focus must use the agreed 200 ms CSS fade transition")
    if "--cw-pulse-focus-transition" in css:
        errors.append("Rivalry Pulse-specific focus transition token must be removed in favor of the shared focus token")
    if css.count("--cw-color-boycott:") != 1:
        errors.append("Boycott color must have exactly one CSS source of truth")
    if re.search(r"^\s*--(?:line|muted):", css, re.MULTILINE):
        errors.append("cold_war.css must consume, not redefine, generic style.css tokens")
    for token in (
        "--cw-color-usa",
        "--cw-color-ussr",
        "--cw-color-boycott",
        "--cw-country-stroke-normal",
        "--cw-country-stroke-boycott",
        "--cw-country-stroke-highlight",
    ):
        if token not in css:
            errors.append(f"Missing centralized CSS theme token {token}")
    for token in (
        "--cw-color-battle-focus-usa-deep",
        "--cw-color-battle-focus-ussr-deep",
        ".cw-battle-variant .cw-battle-point.is-expanded.is-usa",
        ".cw-battle-variant .cw-battle-point.is-expanded.is-ussr",
    ):
        if token not in css:
            errors.append(f"Local Ripple CSS missing {token}")
    if "rgba(139,107,46" in css.replace(" ", ""):
        errors.append("Stale hardcoded brown boycott glow remains in CSS")
    for token in (
        "--cw-boycott-marker-stroke-width",
        "--cw-boycott-marker-dash",
        "--cw-boycott-marker-label-size",
        ".cw-boycott-marker-rect",
        ".cw-boycott-marker-label",
    ):
        if token not in css:
            errors.append(f"Shared boycott-marker presentation missing {token}")
    for legacy_token in (
        ".cw-pulse-boycott-band",
        ".cw-pulse-boycott-label",
        ".cw-who-boycott-band",
        ".cw-who-boycott-label",
        "--cw-color-boycott-band",
    ):
        if legacy_token in css:
            errors.append(f"Visualization-specific boycott presentation remains in CSS: {legacy_token}")
    if ".cw-world-underlay" not in css or "1.78fr" not in css:
        errors.append("World Stage underlay does not preserve the final 64/36 alignment")
    if "align-items: stretch" not in css:
        errors.append("World Stage upper grid is not configured to stretch both visualization columns")
    if "medalPanelWrap.style.height" not in (BASE / "app.js").read_text(encoding="utf-8"):
        errors.append("World Stage and Medal Race desktop frame heights are not synchronized")
    app_js = (BASE / "app.js").read_text(encoding="utf-8")
    if '(min-width: 1000px)' not in app_js or '@media (max-width: 999.98px)' not in css:
        errors.append("World Stage responsive 1000px stacked/compact Medal Race contract is missing")
    if 'height: 232px' not in css:
        errors.append("Compact Medal Race viewport is not sized to approximately five visible rows")
    if 'font-size: var(--type-axis)' not in css or '.cw-chart-theme-universal .cw-grid line' not in css:
        errors.append("IronNeverden-style typography/grid theme is missing")
    if "focus" in help_js or "blur" in help_js:
        errors.append("Chart help should mirror IronNeverden's hover-only interaction, not the previous focus/modal behavior")
    if "max-height" in help_js or "cw-help-close" in help_js:
        errors.append("Chart help still contains non-reference modal behavior")

    print("Cold War validation")
    print(f"  Arms Race rows: {len(arms)}")
    print(f"  World Stage rows: {len(world)}")
    print(f"  Medal Race rows: {len(race)}")
    print(f"  Sporting Fronts rows: {len(fronts)}")
    print(f"  Rivalry Pulse encounters: {len(pulse)}")
    print(f"  Who Won rows: {len(who)}")
    print(f"  Who Won cumulative rows: {len(cumulative)}")

    if errors:
        print("\nVALIDATION FAILED")
        for error in errors:
            print("  -", error)
        raise SystemExit(1)

    print("\nVALIDATION PASSED")


if __name__ == "__main__":
    main()
