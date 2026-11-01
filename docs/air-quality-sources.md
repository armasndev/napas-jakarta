# Air-quality sources: current source and candidates

Status: first evaluation, 2026-10-31. Each claim is labelled **Verified** (checked directly
in this session), **Reported** (from a web search result or an article; not opened at its
primary source) or **Unverified** (needed, not found). Candidate terms and licences must be
read at the source before any decision: nothing here is legal advice.

Rules this evaluation serves (from `docs/data-contract.md` and `docs/limitations.md`):
station observations are separate from city-level or modelled context; every reading shows
its source and observation time; stale readings are never shown as current; missing is never
zero; ISPU and concentrations are never silently converted.

## 1. What we use today

**Source.** The DKI Jakarta air-quality portal, `https://udara.jakarta.go.id/`, run by the
provincial environment agency (Dinas Lingkungan Hidup). The ingestion job
(`ingestion/official.py`, `ingestion/railway_cron.py`) reads the `__SPKU_DATA__` block that the
page embeds in its HTML, validates it, stores it in PostgreSQL, and fails closed if the page
format changes. There is no documented API.

**Checked live on 2026-10-31 (Verified).**

| Check | Result |
| --- | --- |
| HTTP | 200, about 182 KB page |
| Stations in the snapshot | 75, all with coordinates, district and a reading |
| Freshness | All 75 observed within the same hour; newest reading 0.4 h old |
| Fields | station id, name, district, observation time, PM2.5 concentration (µg/m³), ISPU value, ISPU category |
| Pollutants | PM2.5 only (plus its ISPU); no PM10, NO2, SO2, CO, O3 in this snapshot |
| Categories at that hour | 44 Sedang (moderate), 26 Baik (good), 5 Tidak Sehat (unhealthy) |
| Quality flags | none in the snapshot |
| Production catalog (public `/api/stations`) | 105 stations, 92 reporting inside the 24 h freshness window, 13 stale, source mode `live` |

The catalog is larger than the live snapshot because it keeps stations seen earlier; the 24 h
rule decides which count as reporting.

**What the portal says about itself (Reported).** It integrates provincial monitors with
BMKG, WRI and Vital Strategies data. ISPU follows Permen LHK 14/2020. PM2.5 ISPU is published
hourly; other parameters twice a day (09:00 and 15:00 WIB). A BMKG and DLH three-day prediction
service was announced in July 2026.

**Strengths.** Official, free to read, hourly, the densest network in the city, station
coordinates included, and already provenance-tracked (raw snapshots with SHA-256).

**Risks and gaps.**
1. **No stable interface.** The page format is not a contract. Our parser fails closed, which
   protects users but means an unannounced change blanks the map until fixed.
2. **Terms unreviewed.** `docs/data-contract.md` already says to set the portal as a live
   source only after reviewing its terms and attribution. That review is not recorded.
3. **Single source.** One portal is one point of failure and one set of biases.
4. **Mixed station quality, probably.** Station names such as "DKI_PM25_76 RPTRA Anggrek
   Bintaro", schools and public housing suggest a large low-cost PM2.5 sensor network next to
   a few reference-grade stations. This is an inference from naming only (**Unverified**). The
   app currently treats all stations alike and shows no station type or calibration status.
5. **PM2.5 only.** Health guidance often wants ozone, NO2 and PM10, which the snapshot lacks.
6. **No quality flags and no history.** We cannot tell a sensor fault from a clean reading.
   The only history we hold is a model series (Zenodo/Open-Meteo CAMS) and the annual Satu Data
   ISPU dataset (catalogued, not mirrored).
7. **Refresh lag.** The portal updates hourly; our cron runs every two hours, so a reading can
   be up to about two hours behind the portal.
8. **No outage alerting.** If the portal stalls, the 24 h rule hides stale stations, but nobody
   is told that coverage has dropped.

## 2. Candidates

| Source | What it is | Access and terms | Fit | Status |
| --- | --- | --- | --- | --- |
| **Satu Data Jakarta** (satudata.jakarta.go.id) | Provincial open-data catalogue; ISPU datasets by year | Dataset metadata search route exists; licence per dataset | History and a stable export for backfill; not real time | Catalogued; not fetched. **Unverified** |
| **KLHK ISPU** (national ministry; ISPU site and SIPSN) | National ISPU at about 72 stations across Indonesia, seven pollutants, PM2.5 hourly, others twice a day | Public web pages; no open API or licence found | Official cross-check, extra pollutants, other provinces for context | **Reported**. Ask the ministry about a feed |
| **BMKG** | PM2.5 at Kemayoran (Jakarta); 27 air-quality instruments nationwide as of Oct 2024; BMKG and DLH prediction service (Jul 2026) | No open air-quality API found | Forecast and one reference station | **Reported**; check `data.bmkg.go.id` and ask BMKG |
| **US Embassy and Consulate monitors** (Central and South Jakarta) | Two reference-grade PM2.5 monitors published through AirNow | AirNow web services need a free key (from general knowledge, not verified); mirrored by WAQI and IQAir | Independent cross-check of the official network | **Reported**; confirm AirNow access and terms |
| **OpenAQ v3** | Open aggregator with per-provider licences | API key; Jakarta provider list not confirmed | Cross-check and a single open interface | **Unverified** for Jakarta |
| **WAQI / aqicn.org** | Aggregator with a token API | Attribution to WAQI and the originating agency is mandatory. Terms say data may not be redistributed as cached or archived data, used in paid apps, or sold; for-profit public use needs agreement; non-profit public use needs prior notification | Live pass-through only. **Conflicts with storing it in our database** | **Reported** from the terms page; re-read before use |
| **IQAir** | Aggregator with community and government contributors | API tiers and terms not checked | Unclear | **Unverified** |
| **PurpleAir** | Crowd-sourced low-cost sensors | API key; licence not checked | Dense but uncalibrated; label as community data | **Unverified** |
| **Nafas Indonesia** | Private low-cost network (a Central Jakarta station appears on WAQI) | Partnership needed | Possible, as labelled community data | **Reported**, nothing more |
| **Open-Meteo Air Quality** (CAMS model) | Modelled hourly PM, ozone and other pollutants at a point | Free non-commercial, attribution (CC BY 4.0 per project docs); ask to stay below 10,000 calls a day | Modelled context and a gap-filler between stations; already the basis of the city series | **Reported**; model resolution over Jakarta not confirmed |
| **Google Air Quality API** | Modelled heatmaps and health text | 10,000 calls a month free, then about $4-5 per 1,000; must be shown on a Google Map with attribution; caching limited by contract | **Tested 2026-11-01 at 79 live stations: correlation -0.06 with the stations, median 45 vs 19 ug/m3, far too smooth** | **Not suitable**; modelled, not measured |

## 3. Recommendation

Keep the official DKI portal as the **only** source of "station observations", and improve how
we use it before adding more feeds.

1. **Get the terms and, ideally, an agreement.** Read the portal's terms, record the outcome
   here, and write to the DKI environment agency asking for a documented export or API, the
   station metadata (type, operator, calibration, coordinates, location photos), and permission
   to cache. This also answers the station-photo plan.
2. **Poll hourly, and watch coverage.** Move the station refresh to hourly, log
   stations-reporting per run, and alert when the count drops sharply or the newest timestamp
   is more than three hours old.
3. **Show station type** once we know it (reference monitor, sensor network, community), and
   label low-cost sensors as such.
4. **Add independent cross-checks as separate, labelled layers**, never merged into official
   numbers: first the two US Embassy monitors (after confirming AirNow access), then OpenAQ for
   whatever providers it holds for Jakarta.
5. **Keep modelled data as context**, clearly labelled (Open-Meteo CAMS), for the gaps between
   stations and for short forecasts; revisit the BMKG and DLH prediction service when it has an
   open interface.
6. **Do not store WAQI data** unless its caching terms are renegotiated; at most show it
   live with attribution.
7. **Add history** from the Satu Data ISPU datasets for backfill and for trend context that is
   station-based rather than model-based.

## 4. What to check next

- The portal's terms of use and attribution wording (needs a person to read them).
- Whether `__SPKU_DATA__` carries any station-type or quality field we ignore today.
- AirNow web services: key, terms, and whether the Jakarta embassy monitors are included.
- OpenAQ: which providers it lists for Jakarta and under what licences.
- BMKG: any open data route for PM2.5 and for the prediction service.
- KLHK ISPU: a data feed, or a contact for one.
- Open-Meteo: grid resolution over Jakarta, and whether the existing city series should switch
  to point queries per station.

## 5. How to repeat the live check

The probe used the repository's own parser in read-only mode against the public page
(`ingestion.official.spku_html_rows` and `spku_html_stations`) and compared its station list
with the public `/api/stations` summary. Re-run it before any change to the connector and after
any outage report.
