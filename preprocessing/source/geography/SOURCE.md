# Canonical geographic source

The project's historical sovereign-state geometries come from **CShapes 2.0**, maintained by the International Conflict Research group at ETH Zürich.

- Official source: https://icr.ethz.ch/data/cshapes/
- Access used by this repository: official R package `cshapes`
- State coding used: Gleditsch-Ward (`useGW = TRUE`)
- Snapshot convention: January 1 of each Olympic year
- Runtime format: locally generated TopoJSON keyed by `gw<code>`
- License stated by the provider: CC BY-NC-SA 4.0

Recommended citation:

> Schvitz, G., Girardin, L., Rüegger, S., Weidmann, N. B., Cederman, L.-E., & Gleditsch, K. S. (2022). Mapping the International System, 1886–2019: The CShapes 2.0 Dataset. *Journal of Conflict Resolution*, 66(1), 144–161. https://doi.org/10.1177/00220027211013563

`olympic_geography_mapping.csv` is **not an external source**. It is a project-authored crosswalk that links Olympic delegations from the canonical Olympic source to CShapes/Gleditsch-Ward identities.
