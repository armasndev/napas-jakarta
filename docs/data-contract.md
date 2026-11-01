# Data contract

## Current status

The repository contains a clearly labeled demo snapshot. It is not a live feed.
The production connector accepts an official Jakarta CSV/JSON export through
`SOURCE_DATA_URL` and writes `data/processed/measurements.csv` after schema
validation. It also supports an explicit opt-in snapshot from
`https://udara.jakarta.go.id/`, whose published `__SPKU_DATA__` server-rendered
station block currently provides station IDs, district, timestamp, ISPU, and
PM2.5 values. That page format is checked and fails closed if it changes; it is
not treated as a guaranteed API. The Satu Data Jakarta search route is
`https://satudata.jakarta.go.id/backend/api/v2/satudata/search-v2`; use its
dataset metadata to select a stable export URL rather than scraping HTML.
Each run writes an ignored `data/ingestion_report.json` containing fetch time,
row/chunk counts, source, SHA-256 fingerprints, station coverage, and
validation counts for duplicates, units, negatives, and future timestamps. A
live fetch also stores a content-addressed raw snapshot under `data/raw/`.
The normalized measurement fingerprint excludes per-fetch `fetched_at`, so an
unchanged upstream snapshot retains the same checksum across refreshes.
When the processed file exists, the API consumes it automatically; otherwise
it falls back to the committed demo snapshot.
`GET /sources` derives the displayed mode from both configuration and the
persisted report, preventing a live snapshot from being mislabeled after a
restart.
When `POSTGRES_DSN` is configured, validated rows are also upserted into the
typed PostgreSQL `measurements` table, using
`(station_id, observed_at, pollutant)` as the idempotency key.
URL-backed observations preserve their source URL and expose it as
`source_url` in structured tool responses; the committed demo source is
explicitly non-live.

## Required connector decision

Before connecting live data, verify that the official Jakarta source provides a
stable permitted interface with station identifiers, timestamps, units, quality
flags, and update frequency. Do not depend on an undocumented browser endpoint.

The committed demo snapshot remains the reliable scored core. For current
conditions, set `SOURCE_DATA_URL=https://udara.jakarta.go.id/` only after
reviewing the portal's current terms and attribution; otherwise link users to
the official portal.

## Invariants

- All timestamps are stored in UTC and displayed in Asia/Jakarta.
- ISPU is an index without a physical concentration unit.
- Concentration and ISPU are stored in separate fields.
- Missing values remain missing.
- Station observations are not automatically generalized to all Jakarta.
- Every displayed observation includes source and observed-at timestamp.
- Current answers include an explicit age/stale flag; stale observations are
  not presented as live conditions.
- Demo station coordinates are approximate and are never presented as official
  geospatial metadata. When `SOURCE_DATA_URL` is set to the official portal,
  the UI uses the portal's station IDs and coordinates instead.

## Derived PM2.5 AQI

`app/aqi.py` derives a US EPA PM2.5 AQI per station from the official portal's
hourly PM2.5 readings. It is a Napas calculation, not a published Jakarta figure.

- Uses the EPA 2024 PM2.5 breakpoints (effective 6 May 2024), with
  concentrations truncated to one decimal first.
- Needs at least 18 hourly PM2.5 values in the trailing 24 hours. Otherwise
  `aqi` is `null`.
- Abstains above 225.4 µg/m³ because the Hazardous sub-breakpoints are not yet
  confirmed against EPA's technical document.
- The `/stations` catalog exposes `aqi`, `aqi_category`, `aqi_pm25_24h_mean`,
  `aqi_hours` and `aqi_window_end`. The assistant's latest-reading tool exposes
  the same AQI fields. ISPU fields are unchanged.
- The official connector stores a concentration as PM2.5 only when the portal
  reports PM25 as the dominant metric (`dominantMetric`).
