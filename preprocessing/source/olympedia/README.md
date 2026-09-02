# Olympedia Rivalry Pulse scraper

Selective, cache-first scraper and offline parser for reconstructing **literal USA–USSR head-to-head encounters** at the Summer Olympics, 1952–1988.

The tool starts from `Olympic_Athlete_Event_Results.csv` and uses its Olympedia `result_id` values to avoid search pages and generalized crawling.

## What the attached source file already provides

The analyzed input has **314,907 rows** and the columns:

- `edition`
- `edition_id`
- `country_noc`
- `sport`
- `event`
- `result_id`
- `athlete`
- `athlete_id`
- `pos`
- `medal`
- `isTeamSport`

For Summer editions 1952–1988, the local file is enough to determine:

- edition/year;
- sport and event;
- whether USA and URS both entered an event;
- whether the event is team-level according to the source;
- Olympedia parent `result_id`;
- athlete names and Olympedia athlete IDs for individual-event enrichment.

It is **not** enough to determine the individual match/bout, opponent, round, match score, or winner. Those facts are parsed from the corresponding public Olympedia result page.

## Selective acquisition

The source contains 1,299 event `result_id` values from 1952–1988 where both USA and URS appear. The scraper deliberately does **not** request all of them.

It retains only sport families compatible with literal binary encounters and excludes team fencing:

| Sport | Candidate parent pages |
|---|---:|
| Wrestling | 131 |
| Boxing | 83 |
| Fencing (individual only) | 32 |
| Judo | 21 |
| Tennis | 13 |
| Basketball | 10 |
| Water Polo | 7 |
| Volleyball | 6 |
| Football | 4 |
| Handball | 4 |
| Table Tennis | 3 |
| **Total** | **314** |

This is a **candidate list**, not a list of head-to-head encounters. A result page can legitimately contain zero USA–URS matches even if both delegations entered the event.

## Architecture

```text
Olympic_Athlete_Event_Results.csv
        |
        v
candidate generation (offline)
        |
        v
314 selective Olympedia parent result IDs
        |
        v
sequential download + persistent HTML cache
        |
        v
OFFLINE parsing of cached HTML
        |
        +--> candidate_page_audit.csv
        +--> validation_issues.csv
        +--> validation_report.json
        |
        v
rivalry_pulse_matches.csv
```

Download and parsing are separate by design. Once the cache has been materialized, `parse` performs no HTTP requests.

## Why only parent result pages are downloaded by default

Olympedia event pages commonly contain the individual bout/match table and hyperlinks to child `/results/{id}` pages. The parser extracts the child `match_id` directly from those hyperlinks **without requesting the child page**.

This provides both:

- the parent `olympedia_result_id` used by the supplied CSV;
- a child `olympedia_match_id` when Olympedia exposes one;

while minimizing HTTP traffic.

## Server-conservative behavior

The downloader is intentionally restrictive:

- sequential requests only;
- no thread pool, multiprocessing, async HTTP, or concurrent requests;
- default delay: **4.5 seconds** between live requests;
- values below **4.0 seconds are rejected**;
- persistent cache: cached pages never cause another request;
- explicit handling of HTTP `429`;
- honors `Retry-After` in seconds or HTTP-date form;
- conservative exponential backoff when `Retry-After` is unavailable;
- retry handling for `5xx`, timeouts, and network failures;
- finite retry count (default 5);
- `403`/authentication/protection responses are treated as permanent errors rather than bypassed;
- no proxy rotation, IP rotation, CAPTCHA bypass, or protection evasion;
- public unauthenticated `/results/{id}` pages only.

For a public university repository, set a transparent User-Agent containing a real project/contact reference before the live run.

## Installation

Python 3.10+ recommended.

```bash
python -m venv .venv
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
```

## 1. Analyze the local dataset — no network

```bash
python rivalry_scraper.py analyze \
  --input ../olympics/Olympic_Athlete_Event_Results.csv \
  --output output/source_analysis.json
```

## 2. Generate candidate result IDs — no network

```bash
python rivalry_scraper.py candidates \
  --input ../olympics/Olympic_Athlete_Event_Results.csv \
  --output output/rivalry_pulse_candidates.csv \
  --analysis-output output/source_analysis.json
```

The repository already includes the candidate CSV generated from the canonical Olympic source in `../olympics/`.

## 3. Download missing Olympedia pages

Use a clear User-Agent. Example:

```bash
python rivalry_scraper.py download \
  --candidates output/rivalry_pulse_candidates.csv \
  --cache-dir cache \
  --manifest output/cache_manifest.csv \
  --stats-output output/download_stats.json \
  --delay 4.5 \
  --max-retries 5 \
  --user-agent "Olympic-Cold-War-DataViz/1.0 (University project; contact: YOUR_CONTACT)"
```

Useful selective test runs:

```bash
# one known result ID
python rivalry_scraper.py download ... --result-ids 22501

# one sport
python rivalry_scraper.py download ... --sports Boxing

# selected years
python rivalry_scraper.py download ... --years 1952,1960

# first N candidates
python rivalry_scraper.py download ... --limit 5
```

Filters can be combined.

### Resume behavior

If `cache/22501.html` already exists and is non-empty, that page is read from cache and no request is made. Therefore an interrupted run can simply be launched again.

## 4. Parse the cache — offline

```bash
python rivalry_scraper.py parse \
  --input ../olympics/Olympic_Athlete_Event_Results.csv \
  --candidates output/rivalry_pulse_candidates.csv \
  --cache-dir cache \
  --output output/rivalry_pulse_matches.csv \
  --audit-output output/candidate_page_audit.csv \
  --issues-output output/validation_issues.csv \
  --report-output output/validation_report.json \
  --download-stats output/download_stats.json
```

No Olympedia request occurs in this command.

## One-command mode

`run` performs candidate generation, downloads only missing pages, then parses and validates:

```bash
python rivalry_scraper.py run \
  --input ../olympics/Olympic_Athlete_Event_Results.csv \
  --work-dir output \
  --cache-dir cache \
  --delay 4.5 \
  --user-agent "Olympic-Cold-War-DataViz/1.0 (University project; contact: YOUR_CONTACT)"
```

## Clear the persistent cache intentionally

The cache is never silently invalidated.

```bash
python rivalry_scraper.py clear-cache --cache-dir cache --yes
```

Without `--yes`, deletion is refused.

## Head-to-head definition

A row is emitted only when a **single parsed match row** contains exactly the pair:

```text
{NOC1, NOC2} == {USA, URS}
```

Therefore these are not inferred as head-to-head:

- athletics finals with USA and USSR competitors;
- swimming races;
- gymnastics standings;
- weightlifting rankings;
- rowing races;
- any other multi-participant event where both delegations merely co-occur.

The final candidate whitelist is intentionally conservative.

## Winner extraction

The parser never derives a match winner from the final Olympic medal.

Winner classification uses only the parsed match row:

1. explicit draw/tie -> `DRAW`;
2. numeric score (`81-57`, `5-0`) -> compare the two source sides;
3. multi-set scores (volleyball/tennis) -> compare set wins, ignoring tie-break detail in parentheses;
4. explicit fencing `beat`/`defeated` rows -> first listed competitor wins;
5. combat-sport elimination rows with an explicit result method -> Olympedia's winner-first table convention;
6. otherwise -> `UNKNOWN` / `AMBIGUOUS` **and `counts_for_pulse = false`**.

No-contest patterns (`bye`, `walkover`, `not contested`, `DNS`, etc.) are retained only for audit and never counted as a Rivalry Pulse dot.

The parser also creates a `score_usa_first` representation. `score_raw` always preserves Olympedia source order, whereas `score_usa_first` reorients parsed numeric/set scores so USA is consistently the first side. For a single score, `usa_score` and `ussr_score` are the direct values; for multi-set sports they are sets won.

### Team identity normalization

Some historical team pages, notably Handball, place the complete match roster in the `Team` cell. For national-team sports (`Basketball`, `Volleyball`, `Football`, `Water Polo`, `Handball`) the visualization-ready fields are normalized to:

```text
usa_participant  = United States
ussr_participant = Soviet Union
```

The original cells remain in `usa_participant_raw` and `ussr_participant_raw` for provenance.

### Stage hierarchy

Nested Olympedia structures are retained. For example, fencing no longer collapses both of these to `Pool #1`:

```text
Round One / Pool #1
Round Two / Pool #1
```

The output therefore exposes `round_raw`, `group_raw`, `stage_raw`, and `stage_normalized`.

## Output schema

`rivalry_pulse_matches.csv` contains one row per parsed direct USA–URS pairing:

- `encounter_id`
- `olympedia_result_id`
- `olympedia_match_id`
- `edition`, `edition_id`, `year`, `city`, `venue_location`
- `sport`, `event`, `gender`, `encounter_type`
- `round_raw`, `group_raw`, `stage_raw`, `stage_normalized`
- `match_date_raw`
- `usa_participant`, `usa_participant_raw`, `usa_athlete_id`
- `ussr_participant`, `ussr_participant_raw`, `ussr_athlete_id`
- `result_raw`, `score_raw`, `score_usa_first`, `usa_score`, `ussr_score`
- `winner` (`USA`, `URS`, `DRAW`, `UNKNOWN`)
- `outcome_class` (`USA_WIN`, `URS_WIN`, `DRAW`, `NO_CONTEST`, `AMBIGUOUS`)
- `winner_method`
- `counts_for_pulse`
- `source_url`, `match_source_url`, `source_local_file`

D3 should use only `counts_for_pulse == true` for the Pulse marks.

### Cache-wide completeness audit

For every cached parent page the parser independently scans for table rows containing exact `USA` and `URS` NOC cells. The audit compares those source rows against parsed encounter IDs. Any source row that is not represented in the parsed output generates a `potential_source_pairing_lost` validation error.

Against the bundled 314-page cache, the current parser finds **184 exact USA–URS source rows and parses all 184**, with zero unparsed source rows.

## Validation outputs

### `validation_report.json`

Contains:

- source row/column analysis;
- number of candidate pages;
- live requests and cache hits;
- retries, 429, 5xx and network errors;
- cached pages present/missing;
- parse errors;
- pages where no match table could be recognized;
- total direct pairings;
- duplicates removed;
- Rivalry Pulse rows;
- matches by edition;
- matches by sport;
- USA/URS wins, draws, unknowns and no-contest rows;
- unresolved match/athlete IDs;
- records requiring manual review.

### `candidate_page_audit.csv`

One row per candidate parent page, including:

- whether a match table was detected;
- number of USA–URS pairings extracted;
- parse status.

A successfully parsed candidate page with zero pairings is legitimate: both delegations may have entered the event without ever facing each other.

### `validation_issues.csv`

Record-level errors/review items such as ambiguous winners, duplicates, missing participants, or forbidden team-fencing rows.

## Tests

```bash
PYTHONPATH=. python -m unittest discover -s tests -v
```

The test suite covers:

- boxing-style textual results;
- fencing numeric scores and participant reorientation;
- team-sport numeric results;
- volleyball-style set scores;
- no-contest handling;
- the hard minimum 4-second rate limit;
- `Retry-After` parsing;
- an HTTP 429 -> retry -> success sequence without live network access.

The HTML test fixtures are small structural fixtures reproducing patterns verified on public Olympedia result pages; they are not a substitute for the production cache.

## Reproducibility and repository policy

The HTML cache is deliberately separated from derived data. This lets the project:

1. materialize source pages once;
2. preserve them locally;
3. disconnect from the Internet;
4. rebuild the match CSV deterministically from the cache.

The included `.gitignore` ignores cached Olympedia HTML by default. Before redistributing a cache in a public GitHub repository, verify Olympedia's current redistribution terms/permission. The derived dataset retains `olympedia_result_id`, `source_url`, and optional child `match_id` for provenance.

## Current environment note

The implementation was validated offline against parser fixtures and the actual attached CSV. The execution environment used to build this package does not expose arbitrary outbound HTTP to Python, so a full 314-page live run was **not** executed here. The public page structures used by the parser were separately verified against Olympedia for Boxing, Fencing, Basketball, and Judo.
