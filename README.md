<p align="center">
  <img src="assets/napas-jakarta-air-icon.png" width="104" alt="Napas Jakarta air-quality mark">
</p>

<h1 align="center">Napas Jakarta</h1>

<p align="center"><strong>Understand Jakarta’s air, why it changes, and what you can do next.</strong></p>

<p align="center">
  A bilingual, citation-grounded companion for current station observations,
  city-level air-quality context, policy, and practical exposure reduction.
</p>

<p align="center">
  <a href="https://napasjakarta.com"><strong>Open the live app →</strong></a>
</p>

[![Tests](https://github.com/aasnani/napas-jakarta/actions/workflows/test.yml/badge.svg)](https://github.com/aasnani/napas-jakarta/actions/workflows/test.yml)

Napas Jakarta brings station observations, an interactive map, and a bilingual conversational advisor together in one calm, understandable workspace. It helps residents and organizations turn air-quality data into practical next steps.

## Why this matters

Air quality in Jakarta is a serious public-health crisis. Jakarta and its surrounding metropolitan area have repeatedly appeared near the top of pollution comparisons, while industrial activity, population density, seasonal weather, regional fires, and other environmental events can intensify particulate pollution. The [World Health Organization identifies air pollution as a major health risk](https://www.who.int/southeastasia/health-topics/air-pollution), and [DKI Jakarta explains how low rainfall and wind can allow PM2.5 to accumulate](https://www.jakarta.go.id/page/upaya-bersama-jaga-kualitas-udara-jakarta).

Napas Jakarta gives the average Jakartan a simple way to speak directly with the latest available data, follow local air quality, understand what a station reading means, and stay better protected and informed as conditions change. It connects current observations with clear context and practical exposure-reduction guidance, without pretending to replace official authorities or medical advice.

<p align="center">
  <img src="docs/napas-jakarta-preview.png" alt="Napas Jakarta workspace with the advisor, live map, air-quality metrics, and legend">
</p>

## Product value

Napas Jakarta turns a difficult public-data problem into a service people can return to. Organizations can use it to improve audience engagement, support workforce and campus wellbeing, strengthen evidence-led communications, and launch a useful civic or customer experience without building a map, ingestion pipeline, retrieval system, and citation layer from scratch. It is a product capability rather than a promise of revenue: commercial outcomes depend on distribution, audience, and deployment model.

## Product capabilities

- **Current local visibility.** Explore Jakarta monitoring stations with ISPU, PM2.5, observation times, freshness status, district filters, station detail, heatmap views, and direct source links.
- **Bilingual advisor.** The interface and conversational advisor are available in English and Bahasa Indonesia. The language switch changes the experience without a page reload.
- **Grounded answers.** Ask about current conditions, comparisons, historical context, standards, policy, health guidance, and exposure reduction. Typed retrieval tools, source labels, citations, and abstention rules keep the answer tied to available evidence.
- **Operational visibility.** Aggregate monitoring covers service health, latency, token usage, estimated cost, retrieval, citation, and error signals without exposing raw questions in the monitoring dashboard.
- **Clear boundaries.** Station readings, city-level context, historical model data, stale readings, and fallback data are labelled separately so one number is not mistaken for the whole city.

## Data and evidence sources

| Source | Role in the product |
| --- | --- |
| [Udara Jakarta](https://udara.jakarta.go.id/) from Dinas Lingkungan Hidup Provinsi DKI Jakarta | Current station observations, ISPU, PM2.5, timestamps, and station attribution when a validated live feed is configured |
| [Satu Data Jakarta ISPU 2023](https://satudata.jakarta.go.id/open-data/detail/data-indeks-standar-pencemar-udara-ispu-di-provinsi-dki-jakarta-2023) | Historical structured measurements and provenance context |
| [Permen LHK No. 14 Tahun 2020](https://peraturan.bpk.go.id/Details/163466/permen-lhk-no-14-tahun-2020) | Indonesian ISPU methodology and category definitions |
| DKI Jakarta regulations, policy, emissions, and public guidance | Policy status, source-apportionment context, and local programme information |
| [WHO air-quality guidelines](https://www.who.int/publications/i/item/9789240034228) and exposure guidance | Health context and practical protection guidance, not Indonesian law or diagnosis |
| [Zenodo / Open-Meteo CAMS](https://zenodo.org/records/18673885) | Clearly labelled city-level historical model context, not official station history |

The source manifest is versioned in [`data/sources.yaml`](data/sources.yaml). The application preserves source URLs and observation times, labels the packaged snapshot as a fallback, and only presents a runtime feed as live after validation.

## Privacy, login, and security

- No account or login is required in the current product. Conversation state is page-local and is not restored as persistent chat history.
- Anonymous product telemetry may retain the question, generated answer, random page-visit grouping ID, turn metadata, and explicit feedback for quality and reliability work. The default interaction retention window is 30 days and is configurable by the operator.
- No names, email addresses, account IDs, contact details, or device identifiers are requested by chat telemetry. The product is not designed for data harvesting or advertising profiles. Users should not enter sensitive personal or health details.
- Model credentials remain server-side. The public web app communicates with the private API through an internal service token, bounded input validation, and rate limits. Attachments are disabled.

## Integration and cost

The product is a Next.js/Eve web experience backed by a private FastAPI data and telemetry boundary. Organizations can run it as a standalone service under their own domain, connect approved source feeds through configuration, or integrate against typed API routes for stations, latest readings, history, comparisons, policies, guidance, sources, and health. Customer login, SSO, multi-tenant administration, billing, and formal SLAs are not part of the current default and can be scoped as integration work.

The starting architecture targets a strict **$0 infrastructure footprint** using Railway free allocation, a lightweight web service, a private API service, and bounded JSONL telemetry without a paid database. PostgreSQL, scheduled ingestion, a custom domain, and stronger shared rate limiting can be added as usage and reliability requirements grow. Hosting, model, domain, or data-provider charges may apply when free quotas are exceeded or paid capacity is selected.

For the fuller commercial, integration, and deployment overview, see the [Napas Jakarta product brief](docs/product-brief.md). For technical history and architecture notes, see the [archived project README](docs/README.historical.md).

## Important boundaries

- A station reading is local and time-stamped, not a citywide or indoor average.
- Historical context is labelled separately and should not be read as official station history.
- Health content is educational, not a diagnosis or emergency triage service.
- Policy information is date- and source-bounded; users should verify obligations with the responsible authority.

For the technical history, architecture notes, evaluation record, and deployment details, see the [archived project README](docs/README.historical.md).
