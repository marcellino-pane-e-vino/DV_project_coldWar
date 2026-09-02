#!/usr/bin/env python3
"""Rebuild all Cold War visualization-ready datasets from local sources.

This orchestrator intentionally does *not* perform live Olympedia scraping and
*does not* reinstall/regenerate CShapes. Those are explicit source-side steps.
It uses the committed/cache-backed source material, rebuilds the shared Olympic
intermediate, executes the seven chart notebooks, then runs the validators.
"""
from __future__ import annotations

from pathlib import Path
import importlib.util
import subprocess
import sys

import nbformat
from nbconvert.preprocessors import ExecutePreprocessor

ROOT = Path(__file__).resolve().parents[1]
PRE = ROOT / "preprocessing"
CHARTS = PRE / "charts"

NOTEBOOKS = [
    "arms_race.ipynb",
    "world_stage.ipynb",
    "medal_race.ipynb",
    "sporting_fronts.ipynb",
    "rivalry_pulse.ipynb",
    "who_won.ipynb",
    "who_won_cumulative.ipynb",
]


def load_common_module():
    path = CHARTS / "common.py"
    spec = importlib.util.spec_from_file_location("cold_war_common", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def execute_notebook(path: Path) -> None:
    print(f"[notebook] {path.name}")
    notebook = nbformat.read(path, as_version=4)
    runner = ExecutePreprocessor(timeout=600, kernel_name="python3")
    runner.preprocess(notebook, {"metadata": {"path": str(CHARTS)}})


def run_validator(path: Path) -> None:
    print(f"[validate] {path.relative_to(ROOT)}")
    result = subprocess.run([sys.executable, str(path)], cwd=ROOT)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    print("Cold War data build")
    common = load_common_module()

    print("[common] refreshing offline Rivalry Pulse intermediate")
    common.refresh_rivalry_intermediate()

    print("[common] rebuilding cold_war_olympic_common.csv")
    frame = common.build_common()
    print(f"         {len(frame)} Year×NOC/status rows")

    for name in NOTEBOOKS:
        execute_notebook(CHARTS / name)

    # The repository validator invokes the geography and Cold War validators,
    # so there is one authoritative quality gate for the final repository.
    run_validator(PRE / "validation" / "validate_repository.py")

    print("\nBUILD SUCCESSFUL")


if __name__ == "__main__":
    main()
