# Geographic source provenance

`olympic_geography_mapping.csv` is a generated dataset. Its complete source
manifest, including immutable checksums, is `source_manifest.json`.

## Olympic participation source

The `NOC × edition` universe and source delegation labels come from the
repository's canonical `120_years_olympic_history_OG.csv`, originally published
as part of the *120 Years of Olympic History: Athletes and Results* dataset.

- Dataset page:
  https://www.kaggle.com/datasets/heesoo37/120-years-of-olympic-history-athletes-and-results
- Role in this pipeline: participation years and delegation labels only; medal
  values are not needed to construct the crosswalk.

## CShapes 2.0

CShapes is the canonical source for historical entities and Gleditsch-Ward
codes. The pipeline uses the GW TopoJSON embedded in the official `cshapes`
2.0 CRAN source package and selects entities active on 1 July of each Olympic
year.

- Provider: International Conflict Research group, ETH Zürich
- Project page: https://icr.ethz.ch/data/cshapes/
- Package: https://cran.r-project.org/package=cshapes
- License: CC BY-NC-SA 4.0 for the dataset
- Citation: Schvitz, G., Rüegger, S., Girardin, L., Cederman, L.-E., Weidmann,
  N. B., & Gleditsch, K. S. (2022). *Mapping the International System,
  1886–2019: The CShapes 2.0 Dataset*. Journal of Conflict Resolution, 66(1),
  144–161. https://doi.org/10.1177/00220027211013563

## countrycode

The mapping from English country/delegation names to Gleditsch-Ward codes comes
from the versioned `countrycode` dictionary. The project stores the
decompressed source as `external_sources/countrycode_codelist.csv`; it is
materialized from the pinned [upstream codelist](https://github.com/vincentarelbundock/countrycode/blob/27718173677329c91f724397c9d0a222b84d7f01/python/countrycode/data/codelist.csv.gz).

- Repository: https://github.com/vincentarelbundock/countrycode
- License: GPL-3.0
- Citation: Arel-Bundock, V., Enevoldsen, N., & Yetman, C. J. (2018).
  `countrycode`: An R package to convert country names and country codes.
  *Journal of Open Source Software*, 3(28), 848.
  https://doi.org/10.21105/joss.00848

## Country-status data

The exact file used in the project is
[`countries.json` at commit `c8015eeb`](https://github.com/mledoze/countries/blob/c8015eebdd94c533358406b0d709f441389e1f2e/countries.json),
stored locally as `external_sources/countries-c8015eeb.json`.

- Repository: https://github.com/mledoze/countries
- License: Open Database License 1.0

## Historical rules

Most rows are produced by the general code-conversion algorithm. The following
historical cases require explicit rules because one Olympic delegation does not
correspond to one automatically convertible political entity:

- **Germany:** the 1952 GER team maps to West Germany only; from 1956 through
  1964 the United Team of Germany represented both East and West Germany, so it
  maps to GW 260 and 265. Evidence:
  https://www.olympedia.org/countries/FRG
- **United Arab Republic:** the 1960 UAR delegation represented the union of
  Egypt and Syria, so it maps to GW 651 and 652. Evidence:
  https://www.olympedia.org/countries/UAR
- **Rhodesia/Zimbabwe:** the source athlete file retrospectively uses ZIM for
  earlier observations. Olympedia identifies the 1964 participation as
  Rhodesia and the return from 1980 as Zimbabwe. Evidence:
  https://www.olympedia.org/countries/ZIM
- **West Indies Federation:** WIF was a composite delegation and is therefore
  excluded rather than assigned to one state. Evidence:
  https://www.olympedia.org/countries/WIF
- **Netherlands Antilles and Saar:** these historical Olympic delegations have
  no independent GW state identity and are classified as non-sovereign rather
  than assigned to a modern successor. Evidence:
  https://www.olympedia.org/countries/AHO and
  https://www.olympedia.org/countries/SAA

These rules are visible constants in the Python builder. They are not stored in
or inferred from the generated CSV.
