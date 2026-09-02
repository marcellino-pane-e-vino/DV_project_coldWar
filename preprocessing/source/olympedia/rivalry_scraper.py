#!/usr/bin/env python3
"""Selective Olympedia scraper for USA-USSR Olympic head-to-head encounters.

The tool intentionally separates acquisition from parsing:

  local CSV -> candidate result IDs -> cached Olympedia HTML -> offline parse -> validation report

It is designed for the Summer Olympics, 1952-1988, and only for sport families
where a literal binary encounter can occur. It never infers a direct encounter merely
because USA and URS appear in the same event.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import shutil
import sys
import time
import unicodedata
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Iterable, Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup, Tag

BASE_URL = "https://www.olympedia.org/results/{result_id}"
DEFAULT_DELAY_SECONDS = 4.5
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_RETRIES = 5
DEFAULT_USER_AGENT = (
    "Olympic-Cold-War-DataViz/1.0 "
    "(university research; selective public-page acquisition; contact: configure-via---user-agent)"
)

START_YEAR = 1952
END_YEAR = 1988
TARGET_NOCS = {"USA", "URS"}

# Only sports where USA and URS may face one another in a literal binary contest.
# The list is intentionally conservative. Multi-participant events are excluded.
SUPPORTED_SPORTS = {
    "Boxing",
    "Wrestling",
    "Judo",
    "Fencing",
    "Tennis",
    "Table Tennis",
    "Basketball",
    "Volleyball",
    "Football",
    "Water Polo",
    "Handball",
}

TEAM_SPORTS = {"Basketball", "Volleyball", "Football", "Water Polo", "Handball"}
COMBAT_SPORTS = {"Boxing", "Wrestling", "Judo"}
RACQUET_SPORTS = {"Tennis", "Table Tennis"}

HOST_CITY_BY_YEAR = {
    1952: "Helsinki",
    1956: "Melbourne",
    1960: "Rome",
    1964: "Tokyo",
    1968: "Mexico City",
    1972: "Munich",
    1976: "Montreal",
    1980: "Moscow",
    1984: "Los Angeles",
    1988: "Seoul",
}


MATCH_COLUMNS = [
    "encounter_id", "olympedia_result_id", "olympedia_match_id",
    "edition", "edition_id", "year", "city", "venue_location",
    "sport", "event", "gender", "encounter_type",
    "round_raw", "group_raw", "stage_raw", "stage_normalized", "match_date_raw",
    "usa_participant", "usa_participant_raw", "usa_athlete_id",
    "ussr_participant", "ussr_participant_raw", "ussr_athlete_id",
    "result_raw", "score_raw", "score_usa_first", "usa_score", "ussr_score",
    "winner", "outcome_class", "winner_method",
    "counts_for_pulse", "source_url", "match_source_url", "source_local_file",
]

AUDIT_COLUMNS = [
    "olympedia_result_id", "sport", "event", "match_tables_detected",
    "source_exact_usa_urs_rows", "usa_urs_pairings_detected",
    "unparsed_exact_pair_rows", "unparsed_match_ids",
    "parse_status", "source_local_file",
]

ISSUE_BASE_COLUMNS = ["severity", "type", "encounter_id"]

NOC_ALIASES = {
    "USA": "USA",
    "UNITED STATES": "USA",
    "UNITED STATES OF AMERICA": "USA",
    "URS": "URS",
    "USSR": "URS",
    "SOVIET UNION": "URS",
}

CANONICAL_TEAM_NAMES = {
    "USA": "United States",
    "URS": "Soviet Union",
}

NO_CONTEST_TERMS = {
    "bye",
    "walkover",
    "walk-over",
    "not contested",
    "not played",
    "did not start",
    "dns",
    "cancelled",
    "canceled",
}
DRAW_TERMS = {"draw", "tie", "tied"}

STAGE_NORMALIZATION = {
    "round one": "Round 1",
    "round 1": "Round 1",
    "first round": "Round 1",
    "round two": "Round 2",
    "round 2": "Round 2",
    "second round": "Round 2",
    "round three": "Round 3",
    "round 3": "Round 3",
    "third round": "Round 3",
    "round four": "Round 4",
    "round 4": "Round 4",
    "quarter-finals": "Quarter-final",
    "quarter finals": "Quarter-final",
    "quarterfinals": "Quarter-final",
    "quarter-final": "Quarter-final",
    "semi-finals": "Semi-final",
    "semi finals": "Semi-final",
    "semifinals": "Semi-final",
    "semi-final": "Semi-final",
    "final round": "Final",
    "final": "Final",
    "bronze medal match": "Bronze medal match",
    "gold medal match": "Final",
}


@dataclass
class DownloadStats:
    live_requests: int = 0
    cache_hits: int = 0
    retries: int = 0
    http_429: int = 0
    http_5xx: int = 0
    timeouts_or_network_errors: int = 0
    permanent_errors: int = 0
    downloaded_pages: int = 0
    failed_result_ids: list[int] = field(default_factory=list)


@dataclass
class ParseStats:
    candidate_pages: int = 0
    cached_pages_present: int = 0
    cached_pages_missing: int = 0
    parse_errors: int = 0
    pages_with_match_tables: int = 0
    pages_without_match_tables: int = 0
    raw_direct_pairings: int = 0
    source_exact_pair_rows: int = 0
    unparsed_exact_pair_rows: int = 0
    duplicates_removed: int = 0
    final_rows: int = 0
    counts_for_pulse: int = 0
    usa_wins: int = 0
    ussr_wins: int = 0
    draws: int = 0
    no_contest: int = 0
    ambiguous: int = 0


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalized_name(value: Any) -> str:
    text = clean_text(value)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_noc(value: Any) -> str:
    text = clean_text(value).upper()
    return NOC_ALIASES.get(text, text)


def extract_year(edition: str) -> Optional[int]:
    match = re.search(r"(18|19|20)\d{2}", clean_text(edition))
    return int(match.group(0)) if match else None


def infer_gender(event: str) -> str:
    e = clean_text(event).casefold()
    if "women" in e or "women's" in e or ", women" in e:
        return "Women"
    if "men" in e or "men's" in e or ", men" in e:
        return "Men"
    if "mixed" in e:
        return "Mixed"
    return "Unknown"


def normalize_stage(stage_raw: str) -> str:
    raw = clean_text(stage_raw)
    if not raw:
        return ""
    key = raw.casefold().strip().rstrip(":")
    if key in STAGE_NORMALIZATION:
        return STAGE_NORMALIZATION[key]
    if re.fullmatch(r"pool\s+#?[a-z0-9]+", key):
        return "Pool"
    if "classification" in key:
        return "Classification round"
    if "semi-final" in key or "semifinal" in key:
        return "Semi-final"
    if "quarter-final" in key or "quarterfinal" in key:
        return "Quarter-final"
    if key.startswith("final pool"):
        return "Final pool"
    round_match = re.search(r"round\s+(one|two|three|four|1|2|3|4)", key)
    pool_match = re.search(r"pool\s+#?([a-z0-9]+)", key)
    if round_match and pool_match:
        word_to_num = {"one": "1", "two": "2", "three": "3", "four": "4"}
        r = word_to_num.get(round_match.group(1), round_match.group(1))
        return f"Round {r} / Pool {pool_match.group(1).upper()}"
    return raw


def is_supported_candidate(sport: str, event: str) -> bool:
    if sport not in SUPPORTED_SPORTS:
        return False
    if sport == "Fencing" and re.search(r"\bteam\b", clean_text(event), flags=re.I):
        return False
    return True


def load_source_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    required = {
        "edition",
        "edition_id",
        "country_noc",
        "sport",
        "event",
        "result_id",
        "athlete",
        "athlete_id",
        "pos",
        "medal",
        "isTeamSport",
    }
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"Input CSV missing required columns: {missing}")
    return df


def analyze_source(df: pd.DataFrame) -> dict[str, Any]:
    work = df.copy()
    work["year"] = work["edition"].map(extract_year)
    summer = work[
        work["edition"].astype(str).str.contains("Summer", na=False)
        & work["year"].between(START_YEAR, END_YEAR)
    ]
    duo = summer[summer["country_noc"].isin(TARGET_NOCS)]
    grouped = (
        duo.groupby(["result_id", "edition", "edition_id", "sport", "event", "isTeamSport"], dropna=False)[
            "country_noc"
        ]
        .agg(lambda s: sorted(set(s)))
        .reset_index()
    )
    both = grouped[grouped["country_noc"].map(lambda nocs: TARGET_NOCS.issubset(set(nocs)))].copy()
    supported = both[both.apply(lambda r: is_supported_candidate(r["sport"], r["event"]), axis=1)].copy()
    return {
        "input_rows": int(len(df)),
        "columns": list(df.columns),
        "summer_1952_1988_rows": int(len(summer)),
        "usa_urs_rows": int(len(duo)),
        "co_present_result_ids_all_sports": int(len(both)),
        "candidate_result_ids_supported_sports": int(len(supported)),
        "candidate_result_ids_by_sport": {
            str(k): int(v)
            for k, v in supported.groupby("sport").size().sort_values(ascending=False).items()
        },
        "years_with_both_delegations": sorted(int(y) for y in supported["edition"].map(extract_year).dropna().unique()),
    }


def build_candidates(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy()
    work["year"] = work["edition"].map(extract_year)
    scoped = work[
        work["edition"].astype(str).str.contains("Summer", na=False)
        & work["year"].between(START_YEAR, END_YEAR)
        & work["country_noc"].isin(TARGET_NOCS)
    ].copy()

    records: list[dict[str, Any]] = []
    group_cols = ["result_id", "edition", "edition_id", "sport", "event", "isTeamSport"]
    for keys, group in scoped.groupby(group_cols, dropna=False):
        result_id, edition, edition_id, sport, event, is_team = keys
        nocs = set(group["country_noc"].dropna().astype(str))
        if not TARGET_NOCS.issubset(nocs):
            continue
        if not is_supported_candidate(str(sport), str(event)):
            continue
        year = extract_year(str(edition))
        usa_names = sorted(group.loc[group["country_noc"] == "USA", "athlete"].dropna().astype(str).unique())
        urs_names = sorted(group.loc[group["country_noc"] == "URS", "athlete"].dropna().astype(str).unique())
        encounter_type = "team" if (bool(is_team) or str(sport) in TEAM_SPORTS) else "individual"
        records.append(
            {
                "candidate_id": f"result-{int(result_id)}",
                "olympedia_result_id": int(result_id),
                "edition": str(edition),
                "edition_id": int(edition_id),
                "year": int(year) if year is not None else pd.NA,
                "city": HOST_CITY_BY_YEAR.get(int(year), "") if year is not None else "",
                "sport": str(sport),
                "event": str(event),
                "gender": infer_gender(str(event)),
                "encounter_type": encounter_type,
                "usa_local_entries": len(usa_names),
                "ussr_local_entries": len(urs_names),
                "usa_local_participants": " | ".join(usa_names),
                "ussr_local_participants": " | ".join(urs_names),
                "source_url": BASE_URL.format(result_id=int(result_id)),
            }
        )
    out = pd.DataFrame(records)
    if not out.empty:
        out = out.sort_values(["year", "sport", "event", "olympedia_result_id"]).reset_index(drop=True)
    return out


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_retry_after(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    value = value.strip()
    if re.fullmatch(r"\d+", value):
        return float(value)
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0.0, (dt - datetime.now(timezone.utc)).total_seconds())
    except Exception:
        return None


class ConservativeDownloader:
    def __init__(
        self,
        cache_dir: Path,
        delay_seconds: float = DEFAULT_DELAY_SECONDS,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        if delay_seconds < 4.0:
            raise ValueError("Olympedia delay must be >= 4.0 seconds by project policy.")
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay_seconds = delay_seconds
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en",
            }
        )
        self.stats = DownloadStats()
        self._last_request_monotonic: Optional[float] = None
        self.manifest_rows: list[dict[str, Any]] = []

    def cache_path(self, result_id: int) -> Path:
        return self.cache_dir / f"{int(result_id)}.html"

    def _respect_delay(self) -> None:
        if self._last_request_monotonic is None:
            return
        elapsed = time.monotonic() - self._last_request_monotonic
        remaining = self.delay_seconds - elapsed
        if remaining > 0:
            time.sleep(remaining)

    def fetch(self, result_id: int) -> Optional[Path]:
        result_id = int(result_id)
        path = self.cache_path(result_id)
        url = BASE_URL.format(result_id=result_id)
        if path.exists() and path.stat().st_size > 0:
            self.stats.cache_hits += 1
            self._record_manifest(result_id, url, path, "cache")
            return path

        for attempt in range(self.max_retries + 1):
            self._respect_delay()
            try:
                self.stats.live_requests += 1
                self._last_request_monotonic = time.monotonic()
                response = self.session.get(url, timeout=self.timeout_seconds, allow_redirects=True)
            except (requests.Timeout, requests.ConnectionError, requests.RequestException):
                self.stats.timeouts_or_network_errors += 1
                if attempt >= self.max_retries:
                    break
                self.stats.retries += 1
                # Conservative exponential backoff; never below the normal inter-request delay.
                time.sleep(max(self.delay_seconds, min(120.0, self.delay_seconds * (2**attempt))))
                continue

            status = response.status_code
            if status == 200:
                content_type = response.headers.get("Content-Type", "")
                if "html" not in content_type.lower() and not response.text.lstrip().lower().startswith("<!doctype html"):
                    self.stats.permanent_errors += 1
                    break
                tmp = path.with_suffix(".html.tmp")
                tmp.write_text(response.text, encoding="utf-8")
                tmp.replace(path)
                self.stats.downloaded_pages += 1
                self._record_manifest(result_id, str(response.url), path, "download")
                return path

            if status == 429:
                self.stats.http_429 += 1
                if attempt >= self.max_retries:
                    break
                self.stats.retries += 1
                retry_after = parse_retry_after(response.headers.get("Retry-After"))
                if retry_after is None:
                    retry_after = min(300.0, self.delay_seconds * (2**attempt))
                time.sleep(max(self.delay_seconds, retry_after))
                continue

            if 500 <= status <= 599:
                self.stats.http_5xx += 1
                if attempt >= self.max_retries:
                    break
                self.stats.retries += 1
                time.sleep(max(self.delay_seconds, min(120.0, self.delay_seconds * (2**attempt))))
                continue

            # No bypass attempts for 403, CAPTCHA, authentication gates, etc.
            self.stats.permanent_errors += 1
            break

        self.stats.failed_result_ids.append(result_id)
        return None

    def _record_manifest(self, result_id: int, url: str, path: Path, source: str) -> None:
        self.manifest_rows.append(
            {
                "olympedia_result_id": int(result_id),
                "source_url": url,
                "local_file": path.name,
                "source": source,
                "sha256": sha256_file(path) if path.exists() else "",
                "recorded_at": now_iso(),
            }
        )

    def write_manifest(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fields = ["olympedia_result_id", "source_url", "local_file", "source", "sha256", "recorded_at"]
        with path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            # Keep last occurrence per result id, deterministic ordering.
            last: dict[int, dict[str, Any]] = {}
            for row in self.manifest_rows:
                last[int(row["olympedia_result_id"])] = row
            for result_id in sorted(last):
                writer.writerow(last[result_id])


def _table_headers(table: Tag) -> tuple[list[str], Optional[Tag]]:
    # Prefer an explicit thead, otherwise first row containing th cells.
    header_row = None
    if table.find("thead"):
        header_row = table.find("thead").find("tr")
    if header_row is None:
        for tr in table.find_all("tr"):
            if tr.find_all("th"):
                header_row = tr
                break
    if header_row is None:
        return [], None
    headers = [clean_text(cell.get_text(" ", strip=True)) for cell in header_row.find_all(["th", "td"])]
    return headers, header_row


def _header_kind(header: str) -> str:
    """Map Olympedia table headers to stable semantic roles."""
    key = clean_text(header).casefold().strip().rstrip(":")
    key = re.sub(r"\s*\([^)]*\)\s*", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    if key == "noc":
        return "noc"
    if key in {
        "competitor", "competitors", "team", "teams", "player", "players",
        "athlete", "athletes", "pair", "pairs",
    }:
        return "competitor"
    if key in {"result", "score"}:
        return "result"
    if key in {"date/time", "date", "time"}:
        return "date"
    if key in {"location", "venue"}:
        return "location"
    if key in {"match", "bout", "game"}:
        return "match"
    return "other"


def _header_indices(headers: list[str], accepted: set[str]) -> list[int]:
    return [i for i, header in enumerate(headers) if _header_kind(header) in accepted]


def _clean_heading_text(text: str) -> str:
    value = clean_text(text)
    if value.casefold() in {"did you know?", "results", "event type"}:
        return ""
    return value


def _nearest_stage_context(table: Tag) -> tuple[str, str, str, str]:
    """Return (round_raw, group_raw, stage_raw, stage_date_raw).

    Olympedia fencing pages nest pool headings below round headings. Keeping both
    levels prevents Round One / Pool #1 from being confused with Round Two / Pool #1.
    """
    nearest = table.find_previous(
        lambda tag: isinstance(tag, Tag) and tag.name in {"h2", "h3", "h4"}
    )
    if nearest is None:
        return "", "", "", ""

    nearest_text = _clean_heading_text(nearest.get_text(" ", strip=True))
    round_raw = ""
    group_raw = ""
    if nearest.name == "h2":
        round_raw = nearest_text
    else:
        group_raw = nearest_text
        parent_h2 = nearest.find_previous("h2")
        if parent_h2 is not None:
            round_raw = _clean_heading_text(parent_h2.get_text(" ", strip=True))

    parts = [part for part in (round_raw, group_raw) if part]
    stage_raw = " / ".join(parts) if parts else nearest_text

    stage_date = ""
    for node in nearest.find_all_next():
        if node is table:
            break
        if isinstance(node, Tag) and node.name == "tr":
            cells = node.find_all(["th", "td"], recursive=False)
            if len(cells) >= 2 and clean_text(cells[0].get_text(" ", strip=True)).rstrip(":") == "Date":
                stage_date = clean_text(cells[1].get_text(" ", strip=True))
                break
    return round_raw, group_raw, stage_raw, stage_date

def _extract_page_metadata(soup: BeautifulSoup) -> dict[str, str]:
    meta: dict[str, str] = {}
    # Olympedia metadata is rendered as small key/value rows near the top.
    for tr in soup.find_all("tr")[:30]:
        cells = tr.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        key = clean_text(cells[0].get_text(" ", strip=True)).rstrip(":")
        if key in {"Date", "Status", "Location", "Participants", "Format"}:
            meta[key] = clean_text(cells[1].get_text(" ", strip=True))
    return meta


def _extract_match_id(row: Tag) -> Optional[int]:
    for link in row.find_all("a", href=True):
        match = re.search(r"/results/(\d+)", link.get("href", ""))
        if match:
            return int(match.group(1))
    return None


def _extract_athlete_id(cell: Tag) -> Optional[int]:
    for link in cell.find_all("a", href=True):
        match = re.search(r"/athletes/(\d+)", link.get("href", ""))
        if match:
            return int(match.group(1))
    return None


def _clean_competitor_display(value: str) -> str:
    """Remove tennis draw/seed annotations while preserving the competitor name."""
    text = clean_text(value)
    text = re.sub(r"\s*\((?:\d+|Q|WC|ALT|LL)\)\s*$", "", text, flags=re.I)
    return clean_text(text)


def _score_pairs(result_raw: str) -> list[tuple[int, int]]:
    text = clean_text(result_raw)
    # Ignore tie-break details in parentheses: 7-6 (7-3) is one set, not two.
    text = re.sub(r"\([^)]*\)", "", text)
    pairs = re.findall(r"(?<!\d)(\d+)\s*[-–:]\s*(\d+)(?!\d)", text)
    return [(int(a), int(b)) for a, b in pairs]


def orient_score_to_usa(result_raw: str, noc1: str, noc2: str) -> tuple[str, Any, Any]:
    """Return a USA-first score plus numeric USA/URS values when meaningful."""
    pairs = _score_pairs(result_raw)
    if not pairs:
        return "", "", ""
    oriented = pairs if noc1 == "USA" else [(b, a) for a, b in pairs]
    score_usa_first = ", ".join(f"{a} – {b}" for a, b in oriented)
    if len(oriented) == 1:
        return score_usa_first, oriented[0][0], oriented[0][1]
    usa_sets = sum(1 for a, b in oriented if a > b)
    urs_sets = sum(1 for a, b in oriented if b > a)
    return score_usa_first, usa_sets, urs_sets

def classify_outcome(result_raw: str, sport: str, noc1: str, noc2: str) -> tuple[str, str, str, bool]:
    """Return (winner, outcome_class, winner_method, counts_for_pulse)."""
    raw = clean_text(result_raw)
    low = raw.casefold()

    if any(term in low for term in NO_CONTEST_TERMS):
        return "UNKNOWN", "NO_CONTEST", "explicit_no_contest", False
    if any(re.search(rf"\b{re.escape(term)}\b", low) for term in DRAW_TERMS):
        return "DRAW", "DRAW", "explicit_draw", True

    pairs = _score_pairs(raw)
    if pairs:
        if len(pairs) == 1:
            a, b = pairs[0]
            if a > b:
                return noc1, f"{noc1}_WIN", "numeric_score", True
            if b > a:
                return noc2, f"{noc2}_WIN", "numeric_score", True
            return "DRAW", "DRAW", "numeric_score", True
        wins1 = sum(1 for a, b in pairs if a > b)
        wins2 = sum(1 for a, b in pairs if b > a)
        if wins1 > wins2:
            return noc1, f"{noc1}_WIN", "set_score", True
        if wins2 > wins1:
            return noc2, f"{noc2}_WIN", "set_score", True
        return "UNKNOWN", "AMBIGUOUS", "set_score_tie_unresolved", False

    # Fencing pool tables explicitly use "beat": the first listed competitor won.
    if low in {"beat", "beats", "defeated", "defeats"}:
        return noc1, f"{noc1}_WIN", "explicit_first_competitor_win", True

    # Olympedia combat elimination tables place the advancing/winning competitor
    # first and the decision/method in Result. Keep this convention sport-scoped.
    if sport in COMBAT_SPORTS and raw:
        return noc1, f"{noc1}_WIN", "first_competitor_result", True

    # Unknown means unverified, therefore it must never become a Pulse point.
    return "UNKNOWN", "AMBIGUOUS", "unresolved", False

def _scan_exact_target_pair_rows(soup: BeautifulSoup) -> list[Optional[int]]:
    """Return child result IDs for every table row containing exact USA and URS NOC cells.

    This deliberately ignores page-level co-presence and is used as a regression
    completeness check: every such source row should be represented by the parser.
    """
    found: list[Optional[int]] = []
    for tr in soup.find_all("tr"):
        cells = [clean_text(cell.get_text(" ", strip=True)) for cell in tr.find_all(["th", "td"])]
        if "USA" in cells and "URS" in cells:
            found.append(_extract_match_id(tr))
    return found


def parse_result_page(html_path: Path, candidate: dict[str, Any], source_df: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    page_meta = _extract_page_metadata(soup)
    page_title = clean_text(soup.find("h1").get_text(" ", strip=True)) if soup.find("h1") else candidate["event"]

    result_id = int(candidate["olympedia_result_id"])
    sport = clean_text(candidate["sport"])
    event = clean_text(candidate["event"])

    local_subset = source_df[source_df["result_id"] == result_id].copy()
    local_name_to_id: dict[tuple[str, str], int] = {}
    for _, r in local_subset.iterrows():
        key = (normalize_noc(r["country_noc"]), normalized_name(r["athlete"]))
        if key[0] in TARGET_NOCS and key[1] and key not in local_name_to_id:
            try:
                local_name_to_id[key] = int(r["athlete_id"])
            except Exception:
                pass

    rows_out: list[dict[str, Any]] = []
    match_tables = 0
    direct_pairings = 0

    for table in soup.find_all("table"):
        headers, header_row = _table_headers(table)
        if not headers:
            continue

        noc_indices = _header_indices(headers, {"noc"})
        competitor_indices = _header_indices(headers, {"competitor"})
        result_indices = _header_indices(headers, {"result"})
        date_indices = _header_indices(headers, {"date"})
        if len(noc_indices) < 2 or len(competitor_indices) < 2:
            continue

        n1_idx, n2_idx = noc_indices[0], noc_indices[1]
        c1_idx, c2_idx = competitor_indices[0], competitor_indices[1]
        r_idx = result_indices[0] if result_indices else None
        d_idx = date_indices[0] if date_indices else None
        match_tables += 1

        round_raw, group_raw, stage_raw, stage_date_raw = _nearest_stage_context(table)
        stage_normalized = normalize_stage(stage_raw)

        for tr in table.find_all("tr"):
            if tr is header_row:
                continue
            cells = tr.find_all("td")
            if not cells:
                continue
            max_needed = max(n1_idx, n2_idx, c1_idx, c2_idx, r_idx or 0, d_idx or 0)
            if len(cells) <= max_needed:
                continue

            noc1 = normalize_noc(cells[n1_idx].get_text(" ", strip=True))
            noc2 = normalize_noc(cells[n2_idx].get_text(" ", strip=True))
            if {noc1, noc2} != TARGET_NOCS:
                continue

            competitor1_raw = clean_text(cells[c1_idx].get_text(" ", strip=True))
            competitor2_raw = clean_text(cells[c2_idx].get_text(" ", strip=True))
            competitor1 = _clean_competitor_display(competitor1_raw)
            competitor2 = _clean_competitor_display(competitor2_raw)
            if not competitor1 or not competitor2:
                continue

            direct_pairings += 1
            result_raw = clean_text(cells[r_idx].get_text(" ", strip=True)) if r_idx is not None else ""
            match_date_raw = clean_text(cells[d_idx].get_text(" ", strip=True)) if d_idx is not None else ""
            if not match_date_raw:
                match_date_raw = stage_date_raw or page_meta.get("Date", "")
            match_id = _extract_match_id(tr)

            winner, outcome_class, winner_method, counts_for_pulse = classify_outcome(
                result_raw, sport, noc1, noc2
            )
            score_usa_first, usa_score, ussr_score = orient_score_to_usa(result_raw, noc1, noc2)

            # Preserve the exact source-side competitor strings for provenance.
            if noc1 == "USA":
                usa_raw, ussr_raw = competitor1_raw, competitor2_raw
                usa_display, ussr_display = competitor1, competitor2
                usa_cell, ussr_cell = cells[c1_idx], cells[c2_idx]
            else:
                usa_raw, ussr_raw = competitor2_raw, competitor1_raw
                usa_display, ussr_display = competitor2, competitor1
                usa_cell, ussr_cell = cells[c2_idx], cells[c1_idx]

            # National team pages sometimes put the entire roster in the Team cell
            # (notably Handball). Rivalry Pulse needs the national teams as the two
            # participants, while the raw roster remains available for audit.
            if sport in TEAM_SPORTS:
                usa_participant = CANONICAL_TEAM_NAMES["USA"]
                ussr_participant = CANONICAL_TEAM_NAMES["URS"]
                usa_id = None
                urs_id = None
            else:
                usa_participant = usa_display
                ussr_participant = ussr_display
                # Prefer Olympedia's athlete link ID: it resolves aliases such as
                # Bert Freeman -> athlete 23704 even when the local CSV says Joseph Freeman.
                usa_id = _extract_athlete_id(usa_cell)
                urs_id = _extract_athlete_id(ussr_cell)
                if usa_id is None:
                    usa_id = local_name_to_id.get(("USA", normalized_name(usa_participant)))
                if urs_id is None:
                    urs_id = local_name_to_id.get(("URS", normalized_name(ussr_participant)))

            if match_id:
                encounter_id = f"olympedia-{match_id}"
                match_url = BASE_URL.format(result_id=match_id)
            else:
                identity = "|".join(
                    [
                        str(result_id),
                        stage_raw,
                        match_date_raw,
                        normalized_name(usa_participant),
                        normalized_name(ussr_participant),
                        result_raw,
                    ]
                )
                encounter_id = f"result-{result_id}-{hashlib.sha1(identity.encode('utf-8')).hexdigest()[:12]}"
                match_url = ""

            year = int(candidate["year"])
            rows_out.append(
                {
                    "encounter_id": encounter_id,
                    "olympedia_result_id": result_id,
                    "olympedia_match_id": match_id if match_id else "",
                    "edition": candidate["edition"],
                    "edition_id": int(candidate["edition_id"]),
                    "year": year,
                    "city": candidate.get("city") or HOST_CITY_BY_YEAR.get(year, ""),
                    "venue_location": page_meta.get("Location", ""),
                    "sport": sport,
                    "event": event or page_title,
                    "gender": candidate.get("gender") or infer_gender(event),
                    "encounter_type": candidate["encounter_type"],
                    "round_raw": round_raw,
                    "group_raw": group_raw,
                    "stage_raw": stage_raw,
                    "stage_normalized": stage_normalized,
                    "match_date_raw": match_date_raw,
                    "usa_participant": usa_participant,
                    "usa_participant_raw": usa_raw,
                    "usa_athlete_id": usa_id if usa_id is not None else "",
                    "ussr_participant": ussr_participant,
                    "ussr_participant_raw": ussr_raw,
                    "ussr_athlete_id": urs_id if urs_id is not None else "",
                    "result_raw": result_raw,
                    "score_raw": result_raw,
                    "score_usa_first": score_usa_first,
                    "usa_score": usa_score,
                    "ussr_score": ussr_score,
                    "winner": winner,
                    "outcome_class": outcome_class,
                    "winner_method": winner_method,
                    "counts_for_pulse": bool(counts_for_pulse),
                    "source_url": BASE_URL.format(result_id=result_id),
                    "match_source_url": match_url,
                    "source_local_file": html_path.name,
                }
            )

    source_pair_ids = _scan_exact_target_pair_rows(soup)
    parsed_match_ids = {
        int(row["olympedia_match_id"])
        for row in rows_out
        if clean_text(row.get("olympedia_match_id"))
    }
    unparsed_ids = sorted({int(mid) for mid in source_pair_ids if mid is not None and int(mid) not in parsed_match_ids})
    source_rows_without_id = sum(1 for mid in source_pair_ids if mid is None)
    parsed_rows_without_id = sum(1 for row in rows_out if not clean_text(row.get("olympedia_match_id")))
    unparsed_without_id = max(0, source_rows_without_id - parsed_rows_without_id)
    unparsed_exact_pair_rows = len(unparsed_ids) + unparsed_without_id

    page_info = {
        "olympedia_result_id": result_id,
        "sport": sport,
        "event": event,
        "match_tables_detected": match_tables,
        "source_exact_usa_urs_rows": len(source_pair_ids),
        "usa_urs_pairings_detected": direct_pairings,
        "unparsed_exact_pair_rows": unparsed_exact_pair_rows,
        "unparsed_match_ids": " | ".join(str(mid) for mid in unparsed_ids),
        "parse_status": "ok" if match_tables else "no_match_table_detected",
        "source_local_file": html_path.name,
    }
    return rows_out, page_info

def deduplicate_matches(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    if df.empty:
        return df, 0
    before = len(df)
    # EncounterId is strongest when match IDs are available. Fallback IDs are deterministic.
    df = df.drop_duplicates(subset=["encounter_id"], keep="first").copy()
    return df, before - len(df)


def validate_matches(df: pd.DataFrame) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    if df.empty:
        return issues

    if df["encounter_id"].duplicated().any():
        for value in df.loc[df["encounter_id"].duplicated(keep=False), "encounter_id"].unique():
            issues.append({"severity": "error", "type": "duplicate_encounter_id", "encounter_id": value})

    valid_winners = {"USA", "URS", "DRAW", "UNKNOWN"}
    for _, row in df.iterrows():
        encounter_id = row["encounter_id"]
        if row["winner"] not in valid_winners:
            issues.append({"severity": "error", "type": "invalid_winner", "encounter_id": encounter_id})
        if not (START_YEAR <= int(row["year"]) <= END_YEAR):
            issues.append({"severity": "error", "type": "year_out_of_scope", "encounter_id": encounter_id})
        if row["sport"] == "Fencing" and re.search(r"\bteam\b", str(row["event"]), flags=re.I):
            issues.append({"severity": "error", "type": "team_fencing_included", "encounter_id": encounter_id})
        if not clean_text(row["usa_participant"]) or not clean_text(row["ussr_participant"]):
            issues.append({"severity": "error", "type": "missing_participant", "encounter_id": encounter_id})
        if row["sport"] in TEAM_SPORTS:
            if row["usa_participant"] != CANONICAL_TEAM_NAMES["USA"] or row["ussr_participant"] != CANONICAL_TEAM_NAMES["URS"]:
                issues.append({"severity": "error", "type": "team_identity_not_normalized", "encounter_id": encounter_id})
        if row["outcome_class"] == "AMBIGUOUS":
            issues.append({"severity": "review", "type": "winner_ambiguous", "encounter_id": encounter_id})
        if row["outcome_class"] == "NO_CONTEST":
            issues.append({"severity": "info", "type": "no_contest_not_counted", "encounter_id": encounter_id})
        if bool(row["counts_for_pulse"]) and row["winner"] == "UNKNOWN":
            issues.append({"severity": "error", "type": "unknown_winner_counted_for_pulse", "encounter_id": encounter_id})
        if row["encounter_type"] == "individual":
            if not clean_text(row["usa_athlete_id"]) or not clean_text(row["ussr_athlete_id"]):
                issues.append({"severity": "review", "type": "individual_athlete_id_unresolved", "encounter_id": encounter_id})
        if not clean_text(row["source_url"]):
            issues.append({"severity": "error", "type": "missing_source_url", "encounter_id": encounter_id})
    return issues

def parse_cached_pages(
    candidates: pd.DataFrame,
    source_df: pd.DataFrame,
    cache_dir: Path,
) -> tuple[pd.DataFrame, pd.DataFrame, ParseStats, list[dict[str, Any]]]:
    stats = ParseStats(candidate_pages=int(len(candidates)))
    all_rows: list[dict[str, Any]] = []
    page_audit: list[dict[str, Any]] = []

    for _, candidate_row in candidates.iterrows():
        candidate = candidate_row.to_dict()
        result_id = int(candidate["olympedia_result_id"])
        html_path = cache_dir / f"{result_id}.html"
        if not html_path.exists():
            stats.cached_pages_missing += 1
            page_audit.append(
                {
                    "olympedia_result_id": result_id,
                    "sport": candidate["sport"],
                    "event": candidate["event"],
                    "match_tables_detected": 0,
                    "source_exact_usa_urs_rows": 0,
                    "usa_urs_pairings_detected": 0,
                    "unparsed_exact_pair_rows": 0,
                    "unparsed_match_ids": "",
                    "parse_status": "cache_missing",
                    "source_local_file": "",
                }
            )
            continue
        stats.cached_pages_present += 1
        try:
            rows, info = parse_result_page(html_path, candidate, source_df)
            all_rows.extend(rows)
            page_audit.append(info)
            if info["match_tables_detected"]:
                stats.pages_with_match_tables += 1
            else:
                stats.pages_without_match_tables += 1
            stats.raw_direct_pairings += int(info["usa_urs_pairings_detected"])
            stats.source_exact_pair_rows += int(info["source_exact_usa_urs_rows"])
            stats.unparsed_exact_pair_rows += int(info["unparsed_exact_pair_rows"])
        except Exception as exc:
            stats.parse_errors += 1
            page_audit.append(
                {
                    "olympedia_result_id": result_id,
                    "sport": candidate["sport"],
                    "event": candidate["event"],
                    "match_tables_detected": 0,
                    "source_exact_usa_urs_rows": 0,
                    "usa_urs_pairings_detected": 0,
                    "unparsed_exact_pair_rows": 0,
                    "unparsed_match_ids": "",
                    "parse_status": f"parse_error: {type(exc).__name__}: {exc}",
                    "source_local_file": html_path.name,
                }
            )

    matches = pd.DataFrame(all_rows, columns=MATCH_COLUMNS)
    matches, duplicates_removed = deduplicate_matches(matches)
    stats.duplicates_removed = duplicates_removed
    if not matches.empty:
        matches = matches.sort_values(
            ["year", "sport", "event", "stage_normalized", "match_date_raw", "encounter_id"],
            kind="stable",
        ).reset_index(drop=True)
        stats.final_rows = int(len(matches))
        stats.counts_for_pulse = int(matches["counts_for_pulse"].astype(bool).sum())
        stats.usa_wins = int((matches["winner"] == "USA").sum())
        stats.ussr_wins = int((matches["winner"] == "URS").sum())
        stats.draws = int((matches["winner"] == "DRAW").sum())
        stats.no_contest = int((matches["outcome_class"] == "NO_CONTEST").sum())
        stats.ambiguous = int((matches["outcome_class"] == "AMBIGUOUS").sum())

    audit = pd.DataFrame(page_audit, columns=AUDIT_COLUMNS).sort_values(["olympedia_result_id"]).reset_index(drop=True)
    issues = validate_matches(matches)
    for info in page_audit:
        if int(info.get("unparsed_exact_pair_rows", 0) or 0) > 0:
            issues.append(
                {
                    "severity": "error",
                    "type": "potential_source_pairing_lost",
                    "encounter_id": f"result-{int(info['olympedia_result_id'])}",
                    "olympedia_result_id": int(info["olympedia_result_id"]),
                    "unparsed_match_ids": info.get("unparsed_match_ids", ""),
                }
            )
    return matches, audit, stats, issues


def build_validation_report(
    analysis: dict[str, Any],
    candidates: pd.DataFrame,
    matches: pd.DataFrame,
    audit: pd.DataFrame,
    parse_stats: ParseStats,
    issues: list[dict[str, Any]],
    download_stats: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    download_stats = download_stats or {}
    report: dict[str, Any] = {
        "generated_at": now_iso(),
        "scope": {
            "season": "Summer",
            "start_year": START_YEAR,
            "end_year": END_YEAR,
            "target_nocs": sorted(TARGET_NOCS),
            "supported_sports": sorted(SUPPORTED_SPORTS),
            "fencing_team_events_excluded": True,
        },
        "source_analysis": analysis,
        "candidate_pages": int(len(candidates)),
        "download": download_stats,
        "parse": asdict(parse_stats),
        "matches_by_edition": {},
        "matches_by_sport": {},
        "outcomes": {},
        "manual_review_count": 0,
        "manual_review": [],
        "pages_needing_review": [],
    }
    if not matches.empty:
        counted = matches[matches["counts_for_pulse"].astype(bool)].copy()
        report["matches_by_edition"] = {
            str(int(k)): int(v) for k, v in counted.groupby("year").size().sort_index().items()
        }
        report["matches_by_sport"] = {
            str(k): int(v) for k, v in counted.groupby("sport").size().sort_values(ascending=False).items()
        }
        report["outcomes"] = {
            "USA": int((counted["winner"] == "USA").sum()),
            "URS": int((counted["winner"] == "URS").sum()),
            "DRAW": int((counted["winner"] == "DRAW").sum()),
            "UNKNOWN": int((counted["winner"] == "UNKNOWN").sum()),
            "NO_CONTEST_rows_not_counted": int((matches["outcome_class"] == "NO_CONTEST").sum()),
        }
        report["identifier_diagnostics"] = {
            "rows_without_olympedia_match_id": int((matches["olympedia_match_id"].astype(str).str.len() == 0).sum()),
            "individual_rows_without_usa_athlete_id": int(((matches["encounter_type"] == "individual") & (matches["usa_athlete_id"].astype(str).str.len() == 0)).sum()),
            "individual_rows_without_ussr_athlete_id": int(((matches["encounter_type"] == "individual") & (matches["ussr_athlete_id"].astype(str).str.len() == 0)).sum()),
        }

    manual = [issue for issue in issues if issue.get("severity") == "review"]
    report["manual_review_count"] = len(manual)
    report["manual_review"] = manual
    if not audit.empty:
        review_pages = audit[
            audit["parse_status"].astype(str).isin(["cache_missing", "no_match_table_detected"])
            | audit["parse_status"].astype(str).str.startswith("parse_error")
        ]
        report["pages_needing_review"] = review_pages.to_dict("records")
        verified_zero = audit[(audit["parse_status"] == "ok") & (audit["usa_urs_pairings_detected"] == 0)]
        report["parsed_pages_with_zero_direct_pairings"] = verified_zero.to_dict("records")
    return report


def read_download_stats(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def command_analyze(args: argparse.Namespace) -> int:
    source = load_source_csv(Path(args.input))
    analysis = analyze_source(source)
    print(json.dumps(analysis, indent=2, ensure_ascii=False))
    if args.output:
        write_json(Path(args.output), analysis)
    return 0


def command_candidates(args: argparse.Namespace) -> int:
    source = load_source_csv(Path(args.input))
    candidates = build_candidates(source)
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    candidates.to_csv(path, index=False)
    analysis = analyze_source(source)
    if args.analysis_output:
        write_json(Path(args.analysis_output), analysis)
    print(f"Wrote {len(candidates)} candidate result pages to {path}")
    return 0


def _filter_candidates(candidates: pd.DataFrame, args: argparse.Namespace) -> pd.DataFrame:
    out = candidates.copy()
    if getattr(args, "sports", None):
        sports = {s.strip() for s in args.sports.split(",") if s.strip()}
        out = out[out["sport"].isin(sports)]
    if getattr(args, "years", None):
        years = {int(y.strip()) for y in args.years.split(",") if y.strip()}
        out = out[out["year"].isin(years)]
    if getattr(args, "result_ids", None):
        ids = {int(x.strip()) for x in args.result_ids.split(",") if x.strip()}
        out = out[out["olympedia_result_id"].isin(ids)]
    if getattr(args, "limit", None):
        out = out.head(int(args.limit))
    return out.reset_index(drop=True)


def command_download(args: argparse.Namespace) -> int:
    candidates = pd.read_csv(args.candidates)
    candidates = _filter_candidates(candidates, args)
    downloader = ConservativeDownloader(
        Path(args.cache_dir),
        delay_seconds=float(args.delay),
        timeout_seconds=float(args.timeout),
        max_retries=int(args.max_retries),
        user_agent=args.user_agent,
    )
    for i, row in candidates.iterrows():
        result_id = int(row["olympedia_result_id"])
        status = "cache" if downloader.cache_path(result_id).exists() else "live"
        print(f"[{i+1}/{len(candidates)}] result {result_id} ({row['sport']}) [{status}]", flush=True)
        downloader.fetch(result_id)

    manifest_path = Path(args.manifest)
    downloader.write_manifest(manifest_path)
    stats_path = Path(args.stats_output)
    write_json(stats_path, asdict(downloader.stats))
    print(json.dumps(asdict(downloader.stats), indent=2))
    return 0 if not downloader.stats.failed_result_ids else 2


def command_parse(args: argparse.Namespace) -> int:
    source = load_source_csv(Path(args.input))
    candidates = pd.read_csv(args.candidates)
    candidates = _filter_candidates(candidates, args)
    analysis = analyze_source(source)
    matches, audit, parse_stats, issues = parse_cached_pages(candidates, source, Path(args.cache_dir))

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    matches.to_csv(output, index=False)

    audit_output = Path(args.audit_output)
    audit_output.parent.mkdir(parents=True, exist_ok=True)
    audit.to_csv(audit_output, index=False)

    issues_output = Path(args.issues_output)
    issues_output.parent.mkdir(parents=True, exist_ok=True)
    issue_df = pd.DataFrame(issues) if issues else pd.DataFrame(columns=ISSUE_BASE_COLUMNS)
    issue_df.to_csv(issues_output, index=False)

    report = build_validation_report(
        analysis,
        candidates,
        matches,
        audit,
        parse_stats,
        issues,
        read_download_stats(Path(args.download_stats)),
    )
    write_json(Path(args.report_output), report)

    print(f"Wrote {len(matches)} direct USA-URS pairing rows to {output}")
    print(f"Rows counted for Rivalry Pulse: {parse_stats.counts_for_pulse}")
    print(f"Manual-review rows: {report['manual_review_count']}")
    return 0


def command_run(args: argparse.Namespace) -> int:
    root = Path(args.work_dir)
    root.mkdir(parents=True, exist_ok=True)
    candidates_path = root / "rivalry_pulse_candidates.csv"
    analysis_path = root / "source_analysis.json"
    manifest_path = root / "cache_manifest.csv"
    stats_path = root / "download_stats.json"
    output_path = root / "rivalry_pulse_matches.csv"
    audit_path = root / "candidate_page_audit.csv"
    issues_path = root / "validation_issues.csv"
    report_path = root / "validation_report.json"
    cache_dir = Path(args.cache_dir)

    source = load_source_csv(Path(args.input))
    candidates = build_candidates(source)
    candidates.to_csv(candidates_path, index=False)
    write_json(analysis_path, analyze_source(source))
    filtered = _filter_candidates(candidates, args)

    downloader = ConservativeDownloader(
        cache_dir,
        delay_seconds=float(args.delay),
        timeout_seconds=float(args.timeout),
        max_retries=int(args.max_retries),
        user_agent=args.user_agent,
    )
    for i, row in filtered.iterrows():
        result_id = int(row["olympedia_result_id"])
        status = "cache" if downloader.cache_path(result_id).exists() else "live"
        print(f"[{i+1}/{len(filtered)}] result {result_id} ({row['sport']}) [{status}]", flush=True)
        downloader.fetch(result_id)
    downloader.write_manifest(manifest_path)
    write_json(stats_path, asdict(downloader.stats))

    analysis = analyze_source(source)
    matches, audit, parse_stats, issues = parse_cached_pages(filtered, source, cache_dir)
    matches.to_csv(output_path, index=False)
    audit.to_csv(audit_path, index=False)
    issue_df = pd.DataFrame(issues) if issues else pd.DataFrame(columns=ISSUE_BASE_COLUMNS)
    issue_df.to_csv(issues_path, index=False)
    report = build_validation_report(
        analysis, filtered, matches, audit, parse_stats, issues, asdict(downloader.stats)
    )
    write_json(report_path, report)
    print(f"Final dataset: {output_path}")
    return 0 if not downloader.stats.failed_result_ids else 2


def command_clear_cache(args: argparse.Namespace) -> int:
    cache = Path(args.cache_dir)
    if not args.yes:
        print("Refusing to delete cache without --yes", file=sys.stderr)
        return 2
    if cache.exists():
        for path in cache.glob("*.html"):
            path.unlink()
        for path in cache.glob("*.tmp"):
            path.unlink()
    print(f"Cleared cached HTML pages in {cache}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)

    pa = sub.add_parser("analyze", help="Inspect the local athlete/event CSV without network access")
    pa.add_argument("--input", required=True)
    pa.add_argument("--output")
    pa.set_defaults(func=command_analyze)

    pc = sub.add_parser("candidates", help="Build the selective Olympedia result_id candidate list")
    pc.add_argument("--input", required=True)
    pc.add_argument("--output", required=True)
    pc.add_argument("--analysis-output")
    pc.set_defaults(func=command_candidates)

    def add_filters(parser: argparse.ArgumentParser) -> None:
        parser.add_argument("--sports", help="Comma-separated exact sport names")
        parser.add_argument("--years", help="Comma-separated years")
        parser.add_argument("--result-ids", help="Comma-separated Olympedia parent result IDs")
        parser.add_argument("--limit", type=int, help="Process only the first N filtered candidates")

    def add_network(parser: argparse.ArgumentParser) -> None:
        parser.add_argument("--cache-dir", required=True)
        parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS)
        parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
        parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
        parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT)

    pdn = sub.add_parser("download", help="Download only missing candidate parent pages into persistent cache")
    pdn.add_argument("--candidates", required=True)
    add_network(pdn)
    add_filters(pdn)
    pdn.add_argument("--manifest", required=True)
    pdn.add_argument("--stats-output", required=True)
    pdn.set_defaults(func=command_download)

    pp = sub.add_parser("parse", help="Offline-only parse of cached HTML into Rivalry Pulse CSV")
    pp.add_argument("--input", required=True)
    pp.add_argument("--candidates", required=True)
    pp.add_argument("--cache-dir", required=True)
    add_filters(pp)
    pp.add_argument("--output", required=True)
    pp.add_argument("--audit-output", required=True)
    pp.add_argument("--issues-output", required=True)
    pp.add_argument("--report-output", required=True)
    pp.add_argument("--download-stats", default="download_stats.json")
    pp.set_defaults(func=command_parse)

    pr = sub.add_parser("run", help="Build candidates, download missing pages, parse, validate")
    pr.add_argument("--input", required=True)
    pr.add_argument("--work-dir", required=True)
    add_network(pr)
    add_filters(pr)
    pr.set_defaults(func=command_run)

    pcl = sub.add_parser("clear-cache", help="Explicitly delete cached Olympedia HTML pages")
    pcl.add_argument("--cache-dir", required=True)
    pcl.add_argument("--yes", action="store_true")
    pcl.set_defaults(func=command_clear_cache)

    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
