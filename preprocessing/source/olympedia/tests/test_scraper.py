import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

import rivalry_scraper as rs


class ScraperTests(unittest.TestCase):
    def setUp(self):
        self.fixture_dir = Path(__file__).parent / "fixtures"
        self.source = pd.DataFrame([
            {"result_id": 23614, "country_noc": "USA", "athlete": "Joe Frazier", "athlete_id": 1},
            {"result_id": 23614, "country_noc": "URS", "athlete": "Vadim Yemelyanov", "athlete_id": 2},
            {"result_id": 86895, "country_noc": "URS", "athlete": "Viktor Zhdanovich", "athlete_id": 3},
            {"result_id": 86895, "country_noc": "USA", "athlete": "Joseph Paletta, Jr.", "athlete_id": 4},
        ])

    def candidate(self, result_id, sport, event, year, encounter_type="individual"):
        return {
            "olympedia_result_id": result_id,
            "edition": f"{year} Summer Olympics",
            "edition_id": 1,
            "year": year,
            "city": rs.HOST_CITY_BY_YEAR[year],
            "sport": sport,
            "event": event,
            "gender": "Men",
            "encounter_type": encounter_type,
        }

    def test_boxing_text_result_first_competitor_winner(self):
        rows, info = rs.parse_result_page(
            self.fixture_dir / "boxing.html",
            self.candidate(23614, "Boxing", "Heavyweight, Men", 1964),
            self.source,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["winner"], "USA")
        self.assertEqual(rows[0]["stage_normalized"], "Semi-final")
        self.assertEqual(rows[0]["olympedia_match_id"], 23699)
        self.assertTrue(rows[0]["counts_for_pulse"])

    def test_fencing_numeric_score_reorients_to_usa_ussr(self):
        rows, _ = rs.parse_result_page(
            self.fixture_dir / "fencing.html",
            self.candidate(86895, "Fencing", "Foil, Individual, Men", 1960),
            self.source,
        )
        self.assertEqual(rows[0]["usa_participant"], "Joseph Paletta, Jr.")
        self.assertEqual(rows[0]["ussr_participant"], "Viktor Zhdanovich")
        self.assertEqual(rows[0]["winner"], "URS")
        self.assertEqual(rows[0]["usa_athlete_id"], 4)
        self.assertEqual(rows[0]["ussr_athlete_id"], 3)

    def test_team_numeric_score(self):
        rows, _ = rs.parse_result_page(
            self.fixture_dir / "basketball.html",
            self.candidate(32115, "Basketball", "Basketball, Men", 1960, "team"),
            self.source,
        )
        self.assertEqual(rows[0]["winner"], "USA")
        self.assertEqual(rows[0]["result_raw"], "81-57")

    def test_set_score(self):
        rows, _ = rs.parse_result_page(
            self.fixture_dir / "volleyball.html",
            self.candidate(37066, "Volleyball", "Volleyball, Men", 1968, "team"),
            self.source,
        )
        self.assertEqual(rows[0]["winner"], "USA")
        self.assertEqual(rows[0]["winner_method"], "set_score")

    def test_no_contest_not_counted(self):
        rows, _ = rs.parse_result_page(
            self.fixture_dir / "no_contest.html",
            self.candidate(1, "Boxing", "Example, Men", 1952),
            self.source,
        )
        self.assertEqual(rows[0]["outcome_class"], "NO_CONTEST")
        self.assertFalse(rows[0]["counts_for_pulse"])

    def test_rate_limit_guard(self):
        with self.assertRaises(ValueError):
            rs.ConservativeDownloader(Path(tempfile.mkdtemp()), delay_seconds=3.9)

    def test_retry_after_seconds(self):
        self.assertEqual(rs.parse_retry_after("17"), 17.0)

    def test_429_retry_after_then_success(self):
        class Response:
            def __init__(self, status, text="", headers=None, url="https://www.olympedia.org/results/1"):
                self.status_code = status
                self.text = text
                self.headers = headers or {}
                self.url = url

        class Session:
            def __init__(self):
                self.headers = {}
                self.responses = [
                    Response(429, headers={"Retry-After": "9"}),
                    Response(200, text="<!doctype html><html><body>ok</body></html>", headers={"Content-Type": "text/html"}),
                ]
            def get(self, *args, **kwargs):
                return self.responses.pop(0)

        temp = Path(tempfile.mkdtemp())
        dl = rs.ConservativeDownloader(temp, delay_seconds=4.0, max_retries=2)
        dl.session = Session()
        sleeps = []
        real_sleep = rs.time.sleep
        real_mono = rs.time.monotonic
        ticks = iter([0.0, 10.0, 10.0, 20.0])
        try:
            rs.time.sleep = lambda seconds: sleeps.append(seconds)
            rs.time.monotonic = lambda: next(ticks, 20.0)
            result = dl.fetch(1)
        finally:
            rs.time.sleep = real_sleep
            rs.time.monotonic = real_mono
        self.assertTrue(result.exists())
        self.assertEqual(dl.stats.http_429, 1)
        self.assertEqual(dl.stats.retries, 1)
        self.assertEqual(dl.stats.live_requests, 2)
        self.assertTrue(any(s >= 9 for s in sleeps))

    def test_5xx_retry_then_success(self):
        class Response:
            def __init__(self, status, text="", headers=None):
                self.status_code = status
                self.text = text
                self.headers = headers or {}
                self.url = "https://www.olympedia.org/results/2"

        class Session:
            def __init__(self):
                self.headers = {}
                self.responses = [
                    Response(503),
                    Response(200, "<!doctype html><html><body>ok</body></html>", {"Content-Type": "text/html"}),
                ]
            def get(self, *args, **kwargs):
                return self.responses.pop(0)

        temp = Path(tempfile.mkdtemp())
        dl = rs.ConservativeDownloader(temp, delay_seconds=4.0, max_retries=2)
        dl.session = Session()
        real_sleep = rs.time.sleep
        real_mono = rs.time.monotonic
        ticks = iter([0.0, 10.0, 10.0, 20.0])
        try:
            rs.time.sleep = lambda seconds: None
            rs.time.monotonic = lambda: next(ticks, 20.0)
            result = dl.fetch(2)
        finally:
            rs.time.sleep = real_sleep
            rs.time.monotonic = real_mono
        self.assertTrue(result.exists())
        self.assertEqual(dl.stats.http_5xx, 1)
        self.assertEqual(dl.stats.retries, 1)

    def test_cache_hit_performs_no_request(self):
        temp = Path(tempfile.mkdtemp())
        cached = temp / "3.html"
        cached.write_text("<html>cached</html>", encoding="utf-8")
        dl = rs.ConservativeDownloader(temp, delay_seconds=4.0)
        class NoNetworkSession:
            headers = {}
            def get(self, *args, **kwargs):
                raise AssertionError("network should not be called for cache hit")
        dl.session = NoNetworkSession()
        result = dl.fetch(3)
        self.assertEqual(result, cached)
        self.assertEqual(dl.stats.cache_hits, 1)
        self.assertEqual(dl.stats.live_requests, 0)


class RealCacheRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parents[1]
        cls.root = root
        source_path = root.parent / "olympics" / "Olympic_Athlete_Event_Results.csv"
        candidates_path = root / "output" / "rivalry_pulse_candidates.csv"
        if not source_path.exists() or not candidates_path.exists():
            raise unittest.SkipTest("Bundled regression corpus not available")
        cls.source = pd.read_csv(
            source_path,
            usecols=["result_id", "country_noc", "athlete", "athlete_id"],
            low_memory=False,
        )
        cls.candidates = pd.read_csv(candidates_path)

    @classmethod
    def parse_result(cls, result_id):
        row = cls.candidates.loc[cls.candidates["olympedia_result_id"] == result_id].iloc[0].to_dict()
        return rs.parse_result_page(cls.root / "cache" / f"{result_id}.html", row, cls.source)

    def test_basketball_plural_competitors_header(self):
        rows, info = self.parse_result(32115)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["olympedia_match_id"], 32134)
        self.assertEqual(rows[0]["winner"], "USA")
        self.assertEqual(rows[0]["usa_participant"], "United States")
        self.assertEqual(rows[0]["ussr_participant"], "Soviet Union")
        self.assertEqual(rows[0]["score_usa_first"], "81 – 57")
        self.assertEqual(info["unparsed_exact_pair_rows"], 0)

    def test_volleyball_set_score_and_plural_header(self):
        rows, _ = self.parse_result(37066)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["winner"], "USA")
        self.assertEqual(rows[0]["usa_score"], 3)
        self.assertEqual(rows[0]["ussr_score"], 2)

    def test_fencing_beat_and_stage_hierarchy(self):
        rows, _ = self.parse_result(96118)
        pair = [r for r in rows if {r["usa_participant"], r["ussr_participant"]} == {"Jan Romary", "Aleksandra Zabelina"}]
        self.assertEqual(len(pair), 2)
        self.assertEqual({r["winner"] for r in pair}, {"USA", "URS"})
        self.assertEqual({r["stage_raw"] for r in pair}, {"Round One / Pool #1", "Round Two / Pool #1"})
        self.assertTrue(all(r["counts_for_pulse"] for r in pair))

    def test_handball_roster_is_not_used_as_team_identity(self):
        rows, _ = self.parse_result(34742)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["usa_participant"], "United States")
        self.assertEqual(row["ussr_participant"], "Soviet Union")
        self.assertIn("Driggers", row["usa_participant_raw"])
        self.assertIn("Tuchkin", row["ussr_participant_raw"])
        self.assertEqual(row["score_usa_first"], "14 – 26")
        self.assertEqual(row["winner"], "URS")

    def test_tennis_seed_header_and_tiebreak_safe_score_parsing(self):
        rows, _ = self.parse_result(45037)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["usa_participant"], "Brad Gilbert")
        self.assertEqual(row["ussr_participant"], "Andrey Cherkasov")
        self.assertEqual(row["winner"], "USA")
        self.assertEqual(row["usa_score"], 3)
        self.assertEqual(row["ussr_score"], 1)

    def test_olympedia_athlete_link_resolves_alias(self):
        rows, _ = self.parse_result(96653)
        bert = [r for r in rows if r["usa_participant"] == "Bert Freeman"]
        self.assertEqual(len(bert), 2)
        self.assertTrue(all(r["usa_athlete_id"] == 23704 for r in bert))

    def test_unknown_outcome_is_never_counted(self):
        winner, outcome, method, count = rs.classify_outcome("unparsed result", "Fencing", "USA", "URS")
        self.assertEqual(winner, "UNKNOWN")
        self.assertEqual(outcome, "AMBIGUOUS")
        self.assertFalse(count)



if __name__ == "__main__":
    unittest.main()
