# Railway deployment

The public product is the single Next.js/Eve workspace. The FastAPI service is
the private authoritative data, tool, and telemetry boundary.

## Replacement web milestone

The target Railway web service runs from `web/` with the checked-in Dockerfile.
The image runs Next.js on Railway's public `$PORT` and starts the compiled Eve
runtime on a private loopback port. Its health check is `/api/health`; the
browser still uses one origin for both the page and `/eve/*` chat routes. The
build command is `npm run build`, which runs `eve build` before `next build`.

The separate root Railway service is the private FastAPI boundary. Its
explicit start command is:

```text
uvicorn app.api:app --host 0.0.0.0 --port $PORT
```

The web service's server-side environment is:

```text
GEMINI_API_KEY=<secret>
GEMINI_MODEL=gemini-3.5-flash-lite
NAPAS_API_ORIGIN=https://<fastapi-origin>
```

The Gemini key must never be prefixed with `NEXT_PUBLIC_` or sent to the
browser. The eventual public hostname is the Cloudflare-managed
`napasjakarta.com`; DNS and HTTPS cutover wait until the Railway origin
has passed the replacement web and FastAPI smoke checks.

The web and API services share one separately generated server-to-server token:

```text
NAPAS_INTERNAL_TOKEN=<same long random value in web and api>
TRUST_PROXY_HEADERS=true
CHAT_RATE_LIMIT_MAX=12
CHAT_RATE_LIMIT_WINDOW_SECONDS=60
CHAT_GLOBAL_RATE_LIMIT_MAX=60
CHAT_GLOBAL_RATE_LIMIT_WINDOW_SECONDS=60
TELEMETRY_RATE_LIMIT_MAX=120
TELEMETRY_RATE_LIMIT_WINDOW_SECONDS=60
```

Set the equivalent `*_WINDOW_MS` values on the web service when overriding the
defaults. Keep `NAPAS_INTERNAL_TOKEN` out of all `NEXT_PUBLIC_*` variables.
The browser never receives it. FastAPI rejects protected chat and telemetry
writes without it, while the web boundary applies a per-client and global
chat budget before a Gemini request is allowed through. These are deliberately
process-local first-line controls for the strict-$0 deployment. Keep the
Gemini project quota enabled as the provider-side backstop; a future
multi-instance deployment should replace the in-process limits with a shared
limiter or an edge/WAF rule.

Railway's production-shaped topology has four optional pieces:

1. **Web** runs the Next.js/Eve workspace from `web/` and is the only public
   application service.
2. **API** runs `uvicorn app.api:app` on a private Railway network address and
   owns station data, deterministic tools, and anonymous telemetry.
3. **PostgreSQL** is optional. It stores runtime observations, historical
   context, private interaction events, feedback, and ingestion facts when the
   recommended live-data path is selected.
4. **Ingestion** uses `railway-cron.toml` and runs every two hours. It refreshes station
   observations when configured and applies interaction retention cleanup for
   either PostgreSQL or the strict-$0 JSONL fallback.

Qdrant and Grafana are deliberately local-Compose services. Production uses the
configured in-process `hybrid` retrieval method and the built-in aggregate
Monitoring page, so they are not required by the Railway deployment.

## API service variables

```text
ENVIRONMENT=production
DATA_DIR=/app/data
POSTGRES_DSN=${{Postgres.DATABASE_URL}}
SOURCE_DATA_URL=https://udara.jakarta.go.id/
RETRIEVAL_MODE=hybrid
PROMPT_VARIANT=strict
INTERACTION_RETENTION_DAYS=30
INTERACTION_CLEANUP_INTERVAL_SECONDS=3600
MONITORING_DB=/app/runtime/interactions.jsonl   # fallback volume only
NAPAS_INTERNAL_TOKEN=<same long random value in web and api>
TRUST_PROXY_HEADERS=true
CHAT_RATE_LIMIT_MAX=12
CHAT_RATE_LIMIT_WINDOW_SECONDS=60
CHAT_GLOBAL_RATE_LIMIT_MAX=60
CHAT_GLOBAL_RATE_LIMIT_WINDOW_SECONDS=60
TELEMETRY_RATE_LIMIT_MAX=120
TELEMETRY_RATE_LIMIT_WINDOW_SECONDS=60
APP_VERSION=<release version>
GIT_COMMIT=<deployed commit>
BUILD_TIME=<UTC build timestamp>
RUNTIME_REFRESH_TTL_SECONDS=60
```

The API token is required in production for protected chat and telemetry
writes. Never place it, `POSTGRES_DSN`, or telemetry contents in a source file,
build argument, browser response, or screenshot.

## Strict-$0 starting point

Start with only the `web` and `api` services. Leave `POSTGRES_DSN` unset and
attach one small API Volume at `/app/runtime`; set
`MONITORING_DB=/app/runtime/interactions.jsonl` on the API. This keeps anonymous
telemetry bounded by the existing retention cleanup without adding a paid
database. The packaged station snapshot remains the fallback until a source
refresh path is scheduled and verified. If the Railway free credit cannot
support a continuously running pair, scale the web service down between tests
and use a manual or external free scheduler for refreshes. Do not label an
unvalidated fallback as live.

## Web service variables

```text
GEMINI_API_KEY=<sealed Google key>
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_REQUEST_TIMEOUT_MS=120000
NAPAS_API_ORIGIN=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
NAPAS_INTERNAL_TOKEN=<same long random value in web and api>
TRUST_PROXY_HEADERS=true
CHAT_RATE_LIMIT_MAX=12
CHAT_RATE_LIMIT_WINDOW_MS=60000
CHAT_GLOBAL_RATE_LIMIT_MAX=60
CHAT_GLOBAL_RATE_LIMIT_WINDOW_MS=60000
TELEMETRY_RATE_LIMIT_MAX=120
TELEMETRY_RATE_LIMIT_WINDOW_MS=60000
NEXT_PUBLIC_MAP_STYLE_URL=<approved production map style, if not the preview>
```

Never prefix `GEMINI_API_KEY` or `NAPAS_INTERNAL_TOKEN` with
`NEXT_PUBLIC_`.

## Ingestion variables

```text
DATA_DIR=/app/data
POSTGRES_DSN=${{Postgres.DATABASE_URL}}
SOURCE_DATA_URL=https://udara.jakarta.go.id/
HISTORICAL_AIR_URL=https://air-quality-api.open-meteo.com/v1/air-quality
HISTORICAL_REFRESH_UTC_HOUR=18
HISTORICAL_REFRESH_DAYS=92
INTERACTION_RETENTION_DAYS=30
OFFICIAL_CONNECT_TIMEOUT_SECONDS=5
OFFICIAL_READ_TIMEOUT_SECONDS=15
OFFICIAL_FETCH_RETRIES=2
```

For the strict-$0 fallback, omit `POSTGRES_DSN`, mount
`MONITORING_DB=/app/runtime/interactions.jsonl` on the API service, and run
the same six-hour cron. The cron calls the JSONL retention path as well as the
PostgreSQL path, so old anonymous interaction records are removed even when
the fallback has no new writes.

When PostgreSQL is selected, the ingestion service must use the same
`POSTGRES_DSN` as the API service. A successful PostgreSQL publication writes
an `ingestion_runs` row containing only the completion time, source status,
source URL, row count, and non-sensitive failure detail. The API uses that row
as runtime provenance. The strict-$0 JSONL path omits the DSN and still runs
the retention branch.

## Verify a deployment

After Railway reports a healthy deployment, make non-sensitive public requests:

```bash
curl --fail https://<web-domain>/api/health
curl --fail https://<domain>/health
curl --fail https://<domain>/version
curl --fail https://<domain>/sources
curl --fail https://<domain>/monitoring/summary?days=30
curl --fail https://<domain>/docs
```

`/sources` has separate `runtime` and `packaged_fallback` objects. A live
runtime uses `store: postgres` and includes loaded row count, newest observation,
and the latest completed ingestion record. If PostgreSQL is empty or unavailable,
the response names the fallback reason rather than presenting packaged data as a
fresh run.

Then submit one synthetic current-station question, verify the cited answer and
selected retrieval/prompt fields, and submit one synthetic feedback event. Keep
only aggregate results and screenshots; do not use personal or health details.

Railway can scale the web process to zero. A first request may therefore have a
cold-start delay. The scheduled ingestion process is finite and idempotent;
inspect its deployment log after source failures rather than assuming the
six-hour target guarantees a successful refresh.
