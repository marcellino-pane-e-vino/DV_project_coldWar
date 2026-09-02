#!/usr/bin/env Rscript

# Rebuild the historical sovereign-state basemaps used by the project and emit
# a lightweight state-name/Gleditsch-Ward reference for auditing the Olympic
# geography crosswalk.
#
# Canonical source: CShapes 2.0 via the official `cshapes` R package.
# Snapshot convention: January 1 of each Olympic year.

suppressPackageStartupMessages({
  library(cshapes)
  library(sf)
})

message("Using cshapes R package version ", as.character(packageVersion("cshapes")))

OLYMPIC_YEARS <- c(
  1896, 1900, 1904, 1906, 1908, 1912, 1920, 1924, 1928, 1932,
  1936, 1948, 1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980,
  1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016
)

args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", args, value = TRUE)
script_path <- if (length(file_arg)) normalizePath(sub("^--file=", "", file_arg[[1]])) else normalizePath(".")
script_dir <- if (file.info(script_path)$isdir) script_path else dirname(script_path)
repo_root <- normalizePath(file.path(script_dir, "..", "..", ".."), mustWork = TRUE)
out_dir <- file.path(repo_root, "data", "final", "geography", "basemaps")
intermediate_dir <- file.path(repo_root, "preprocessing", "intermediate")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(intermediate_dir, recursive = TRUE, showWarnings = FALSE)

mapshaper_bin <- Sys.getenv("MAPSHAPER_BIN", unset = "mapshaper")
if (Sys.which(mapshaper_bin) == "") {
  stop(
    "mapshaper CLI not found. Install it (for example: npm install -g mapshaper) ",
    "or set MAPSHAPER_BIN to the executable path."
  )
}

reference_rows <- list()

for (year in OLYMPIC_YEARS) {
  message("Generating CShapes snapshot for ", year, "...")

  snapshot <- cshp(
    date = as.Date(sprintf("%d-01-01", year)),
    useGW = TRUE,
    dependencies = FALSE
  )
  snapshot <- st_as_sf(snapshot)

  # Keep a human-readable reference for the crosswalk audit before reducing the
  # runtime geometry to its minimal GW identifier.  CShapes 2.0 currently
  # exposes `country_name`; `statename` is accepted only as a compatibility
  # fallback for older/local package builds.
  name_column <- if ("country_name" %in% names(snapshot)) {
    "country_name"
  } else if ("statename" %in% names(snapshot)) {
    "statename"
  } else {
    stop("CShapes snapshot has no supported state-name column")
  }

  reference_rows[[as.character(year)]] <- data.frame(
    Year = year,
    CShapesName = as.character(snapshot[[name_column]]),
    GwCode = as.integer(snapshot$gwcode),
    stringsAsFactors = FALSE
  )

  runtime_snapshot <- snapshot
  runtime_snapshot$id <- paste0("gw", runtime_snapshot$gwcode)
  runtime_snapshot <- runtime_snapshot[, "id", drop = FALSE]

  temp_geojson <- tempfile(pattern = sprintf("cshapes-%d-", year), fileext = ".geojson")
  output_topojson <- file.path(out_dir, sprintf("cshapes-%d.topo.json", year))

  st_write(runtime_snapshot, temp_geojson, driver = "GeoJSON", quiet = TRUE, delete_dsn = TRUE)
  status <- system2(
    mapshaper_bin,
    args = c(
      shQuote(temp_geojson),
      "-clean",
      "-filter-fields", "id",
      "-o", "format=topojson", "precision=0.0001", shQuote(output_topojson)
    )
  )
  unlink(temp_geojson)
  if (status != 0) stop("mapshaper failed for year ", year)
}

reference <- do.call(rbind, reference_rows)
reference <- unique(reference[order(reference$Year, reference$GwCode), ])
reference_path <- file.path(intermediate_dir, "cshapes_state_reference.csv")
write.csv(reference, reference_path, row.names = FALSE, fileEncoding = "UTF-8")

message("Generated ", length(OLYMPIC_YEARS), " historical TopoJSON basemaps in ", out_dir)
message("Wrote CShapes audit reference to ", reference_path)
