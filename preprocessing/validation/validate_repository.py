#!/usr/bin/env python3
"""Static validation for the final Gold Rush repository."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "pages" / "final" / "olympic_gold_rush.html"

REQUIRED_HTML_IDS = {
    "introduction",
    "cw-arms-section",
    "cw-world-section",
    "cw-sporting-fronts-section",
    "cw-pulse-section",
    "cw-who-battle-strip-section",
    "methodology",
    "team",
}

LEGACY_HTML_IDS = {
    "choropleth-section",
    "heatmap-section",
    "stacked-section",
    "streamgraph-section",
}


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def check_required_files(errors: list[str]) -> None:
    required = [
        ROOT / "index.html",
        ROOT / "style.css",
        ROOT / "cold_war.css",
        ROOT / "README.md",
        ROOT / "TESTING.md",
        ROOT / "Gemfile",
        ROOT / "Gemfile.lock",
        PAGE,
        ROOT / "scripts" / "final" / "cold_war" / "app.js",
        ROOT / "scripts" / "final" / "cold_war" / "components" / "chart-help.js",
        ROOT / "scripts" / "final" / "cold_war" / "components" / "boycott-marker.js",
        ROOT / "scripts" / "final" / "cold_war" / "components" / "legend-focus.js",
        ROOT / "scripts" / "final" / "cold_war" / "core" / "data.js",
        ROOT / "scripts" / "final" / "cold_war" / "core" / "theme.js",
        ROOT / "scripts" / "final" / "cold_war" / "core" / "geography.js",
        ROOT / "scripts" / "final" / "cold_war" / "visualizations" / "world-stage.js",
        ROOT / "scripts" / "final" / "cold_war" / "visualizations" / "medal-race.js",
        ROOT / "scripts" / "final" / "cold_war" / "visualizations" / "who-won-battle-strip.js",
        ROOT / "preprocessing" / "source" / "olympics" / "120_years_olympic_history_OG.csv",
        ROOT / "preprocessing" / "source" / "olympics" / "Olympic_Athlete_Event_Results.csv",
        ROOT / "preprocessing" / "source" / "nuclear" / "nuclear-warhead-stockpiles-lines.csv",
        ROOT / "preprocessing" / "source" / "geography" / "olympic_geography_mapping.csv",
        ROOT / "preprocessing" / "charts" / "common.py",
        ROOT / "preprocessing" / "charts" / "who_won_cumulative.ipynb",
        ROOT / "preprocessing" / "build_all.py",
    ]

    required += [
        ROOT / "data" / "final" / "cold_war" / name
        for name in (
            "arms_race.csv",
            "world_stage.csv",
            "medal_race.csv",
            "sporting_fronts.csv",
            "rivalry_pulse.csv",
            "who_won.csv",
            "who_won_cumulative.csv",
        )
    ]

    required += [
        ROOT / "data" / "final" / "geography" / "basemaps" / f"cshapes-{year}.topo.json"
        for year in (1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988)
    ]

    for path in required:
        if not path.exists():
            fail(errors, f"Missing required file: {path.relative_to(ROOT)}")


def check_removed_legacy(errors: list[str]) -> None:
    forbidden = [
        ROOT / "scripts" / "final" / "olympics",
        ROOT / "data" / "final" / "olympics",
        ROOT / "data" / "final" / "geography" / "olympic_historical_geography.csv",
        ROOT / "preprocessing" / "olympics",
        ROOT / "WORLD_STAGE_VARIANTS.md",
    ]
    for path in forbidden:
        if path.exists():
            fail(errors, f"Legacy/experimental artifact should have been removed: {path.relative_to(ROOT)}")


def check_forbidden_runtime_artifacts(errors: list[str]) -> None:
    forbidden_paths = [
        ROOT / ".observablehq",
        ROOT / "package.json",
        ROOT / "node_modules",
        ROOT / "vite.config.js",
        ROOT / "webpack.config.js",
    ]
    for path in forbidden_paths:
        if path.exists():
            fail(errors, f"Forbidden frontend/runtime artifact present: {path.relative_to(ROOT)}")

    banned_tokens = [
        "observable" + "hq:",
        "File" + "Attachment",
        "npm:" + "topojson",
        'import * as d3 from "' + 'd3"',
    ]
    text_extensions = {".html", ".css", ".js", ".md"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in text_extensions:
            continue
        if path == Path(__file__).resolve():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for token in banned_tokens:
            if token.lower() in text.lower():
                fail(errors, f"Forbidden runtime token {token!r} found in {path.relative_to(ROOT)}")


def check_html_structure(errors: list[str]) -> None:
    html = PAGE.read_text(encoding="utf-8")
    for element_id in REQUIRED_HTML_IDS:
        if not re.search(rf'id=["\']{re.escape(element_id)}["\']', html):
            fail(errors, f"Missing mandatory HTML section id={element_id!r}")
    for element_id in LEGACY_HTML_IDS:
        if re.search(rf'id=["\']{re.escape(element_id)}["\']', html):
            fail(errors, f"Legacy visualization still present in final page: id={element_id!r}")
    for tag in ("header", "main", "footer"):
        if not re.search(rf"<{tag}\b", html, re.IGNORECASE):
            fail(errors, f"Missing mandatory <{tag}> element")
    if "scripts/final/olympics" in html:
        fail(errors, "Final page still loads the removed legacy Olympics frontend")


def check_relative_html_assets(errors: list[str]) -> None:
    html = PAGE.read_text(encoding="utf-8")
    relative_values = re.findall(r'(?:src|href)=["\'](\.{1,2}/[^"\']+)["\']', html)
    for value in relative_values:
        # Static assets may carry a query string for browser cache busting.
        # Validate the filesystem path, not the URL query/fragment.
        asset_path = value.split("?", 1)[0].split("#", 1)[0]
        target = (PAGE.parent / asset_path).resolve()
        if not target.exists():
            fail(errors, f"Broken relative HTML asset: {value}")


def check_javascript_syntax(errors: list[str]) -> None:
    """Parse every browser module as ESM, including files without package.json."""
    for path in sorted((ROOT / "scripts").rglob("*.js")):
        result = subprocess.run(
            ["node", "--input-type=module", "--check"],
            cwd=ROOT,
            input=path.read_text(encoding="utf-8"),
            text=True,
            capture_output=True,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip().splitlines()
            suffix = f": {detail[-1]}" if detail else ""
            fail(errors, f"Invalid JavaScript module {path.relative_to(ROOT)}{suffix}")


def run_validator(errors: list[str], path: Path, label: str) -> None:
    result = subprocess.run([sys.executable, str(path)], cwd=ROOT, text=True, capture_output=True)
    if result.stdout:
        print(result.stdout.rstrip())
    if result.returncode != 0:
        if result.stderr:
            print(result.stderr.rstrip())
        fail(errors, f"{label} failed")


def main() -> None:
    errors: list[str] = []
    print("Gold Rush repository validation")

    check_required_files(errors)
    if not errors:
        check_removed_legacy(errors)
        check_forbidden_runtime_artifacts(errors)
        check_html_structure(errors)
        check_relative_html_assets(errors)
        check_javascript_syntax(errors)
        run_validator(errors, ROOT / "preprocessing" / "validation" / "validate_geography.py", "Cold War geography validator")
        run_validator(errors, ROOT / "preprocessing" / "validation" / "validate_cold_war.py", "Cold War validator")

    if errors:
        print("\nVALIDATION FAILED")
        for error in errors:
            print(f"  - {error}")
        raise SystemExit(1)

    print("\nVALIDATION PASSED")


if __name__ == "__main__":
    main()
