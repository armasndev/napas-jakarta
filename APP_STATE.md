# Napas Jakarta application state

**Last verified:** 9 October 2026 (Asia/Jakarta)

This is the concise operational checkpoint for Napas Jakarta. It records the
broad product, data, deployment, security, and observability state so future
work can resume without relying on chat history or local scratch notes. Keep
this file current when any of those broad areas changes. Do not record secrets,
tokens, raw logs, or user-provided content here.

## Product

Napas Jakarta is a bilingual English and Indonesian air-quality assistant and
map for Jakarta. It combines current station observations with clear
terminology, citations, historical or city-level context, and practical
exposure guidance. The interface supports desktop and mobile layouts, station
selection, air-quality filtering, map exploration, a heatmap view, and a
grounded chat experience.

The product does not require an end-user account. Answers should distinguish a
station observation from citywide context, show the observation time and
source, and abstain when the required evidence is unavailable.

## Repository and release state

- The remote source of truth is `origin/main` at commit `5e1c279`, which includes
  the merged SEO and Google Analytics work from [PR #4](https://github.com/aasnani/napas-jakarta/pull/4).
- Railway web, API, and ingestion deployments are all `SUCCESS` from commit
  `5e1c279`.
- The local checkout used for this snapshot was stale and divergent from
  `origin/main`, with pre-existing local modifications and scratch files. Those
  changes were intentionally left untouched. Reconcile the checkout before a
  future release; do not discard local work without review.
- Detailed planning files under `.codex-dev/plans/` are historical working
  notes. This file is the high-level state reference.

## Production deployment

Production runs in Railway under one project and environment with these
responsibilities:

- **Web:** public Next.js and Eve application at
  [napasjakarta.com](https://napasjakarta.com).
- **API:** private server-side data boundary used by the web and ingestion
  services.
- **Ingestion:** scheduled refresh of official station data.
- **PostgreSQL:** shared runtime store for current observations and related
  operational data.

The web service is rooted at `/web`; the API and ingestion services are rooted
at `/`. The web readiness check uses `/api/health` and includes Eve readiness.
Ingestion runs `python -m ingestion.railway_cron` every two hours
(`0 */2 * * *`). PostgreSQL remains a shared runtime store and is not tied to a
repository commit.

Cloudflare manages the custom-domain DNS path. The web, API, and ingestion
services are connected to `aasnani/napas-jakarta` on `main`, with Railway
auto-deploy enabled for each. Verify the deployed commit, Railway deployment
status, and public health endpoint after each release.

## Data and freshness

- The primary live source is the official Jakarta air-quality monitoring
  network, with source and station provenance retained for attribution.
- Ingestion writes the current catalog and observations to Railway PostgreSQL.
- Readings older than the 24-hour freshness window are stale and must not be
  presented as current air-quality conditions. Readings within that window may
  be presented as fresh, with their timestamp still visible.
- Historical or city-level context is labelled separately from official station
  observations. Packaged fallback data is clearly identified as fallback, not
  live data.
- Station-level source links should remain directly actionable so a user can
  open the underlying source for that observation.

## Security and privacy posture

- The API is intended to remain private to the Railway project. Server-to-server
  calls use the configured internal authentication boundary; the browser does
  not receive that credential.
- Secrets and provider credentials belong in Railway environment variables, not
  the repository or client bundles.
- Chat and telemetry requests have bounded input and request protection. User
  input is treated as untrusted content, not as an instruction to change system
  behavior or access secrets.
- The application does not require login and should avoid collecting identity
  data. Interaction telemetry is best-effort, bounded, and retention-controlled.
- The web code now supports opt-in Google Analytics 4 using Napas's own
  measurement ID. It loads only after explicit browser consent, tracks
  public-page views and interaction categories for assistant prompts, feedback,
  topic and station selection, and map controls. Event parameters are bounded
  enums; Google Analytics events do not include chat text, attachments, station
  or district names or IDs, map coordinates, app session IDs, or URL parameters.
  The current search/analytics PR adds About pages and expands interaction
  coverage; those changes are not in production until the web service is
  redeployed and a visitor opts in. Ad storage, Google signals, and ads
  personalization are disabled.
- After a visitor accepts or declines, the consent prompt closes and no
  persistent control overlays the workspace. Visitors can reopen the choice
  from the English or Indonesian Privacy page. This UI update is in the open
  search/analytics PR and is not in production until deployed.

## Logging and retention

- The first monitoring slice uses Railway's built-in Logs and Log Explorer. No
  separate Loki, Grafana, or paid logging service is deployed.
- Application events are emitted as structured, one-line records with broad
  debug, info, warning, and error severity. Important events include request
  completion, rejected chat input, chat/provider failures, missing provider
  configuration, and telemetry-forwarding failures.
- Eve chat instrumentation records request arrival, model-call start and
  completion, Gemini request start, first provider byte, first streamed token,
  and each tool-call start/completion/failure. These events retain bounded
  identifiers and timings only; prompts, generated text, tool arguments, and
  tool results are excluded.
- Request IDs support correlation between a user-visible failure and its server
  logs.
- Diagnostic stack traces stay in Railway logs. Authorization headers, cookies,
  tokens, and provider secrets must never be logged or forwarded to clients.
- Railway Hobby Log Explorer retention is **7 days**. Export or introduce a
  dedicated backend only if longer retention, alerting, or historical analysis
  becomes necessary.
- Railway health checks establish process and dependency readiness. They do not
  prove that a semantic chat answer succeeded, so chat/provider failures must
  be diagnosed through structured application logs.

## Search discovery and analytics

- The web code defines canonical metadata, bilingual air-quality guides and
  About pages, `robots.txt`, and an XML sitemap. The sitemap lists the public
  homepage, the Indonesian homepage, About pages, both guides, both ISPU explainer
  pages, and bilingual Privacy pages. The homepage header links to the air-quality guide in the
  currently selected language.
- Google Analytics support is opt-in and uses Napas's configured public
  measurement ID, with `NEXT_PUBLIC_GA_MEASUREMENT_ID` available as a build-time
  override. Events include fixed interaction names and bounded action labels,
  not a prompt, station or district details, map coordinates, app session ID,
  or query string. See `web/SEO_AND_GOOGLE_SETUP.md` for the setup and content
  plan.
- The owner reports that the Napas Search Console Domain property is verified.
  Sitemap submission is pending. The dedicated GA4 property and linking the
  two Google properties also remain unconfirmed.
- After deployment of commit `5e1c279`, the production homepage,
  `/api/health`, and `/sitemap.xml` each returned HTTP 200 on 28 September
  2026. Search Console sitemap submission remains to be confirmed.

## Current operating boundaries

- Railway-native logs are the current operational monitoring solution. Email
  alerting and a Loki/Grafana stack are not currently deployed.
- Production verification should cover the public web surface, API readiness,
  ingestion freshness, station marker availability, chat success, and the
  deployed commit.
- The public app is intentionally evidence-grounded. Do not expand the visible
  topic surface without a corresponding typed retrieval path, source coverage,
  and an abstention or failure mode.

## Updating this file

Update the date and affected sections when any of the following changes:

1. production services, domains, deployment workflow, or health behavior;
2. official data sources, freshness rules, provenance, or fallback behavior;
3. logging, retention, alerting, or observability services;
4. authentication, secrets, input limits, privacy, or data handling; or
5. a major user-facing capability or known operational boundary.

After updating, verify that this file still describes the deployed state rather
than only the local working tree.
