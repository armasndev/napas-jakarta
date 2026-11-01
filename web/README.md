# Napas Jakarta web workspace

This directory is the additive Next.js + React + TypeScript replacement
workspace for Napas Jakarta. The `/` route is intentionally one spatial,
conversational surface: Ask Napas stays beside the Jakarta map, and station,
trend, comparison, and source results appear as contextual components.

The product brief and surface targets live at
[`../docs/product-design.md`](../docs/product-design.md). Mobile is currently a
basic fallback only; the approved targets are a 24-inch desktop reference and
a 14-inch laptop reference.

## Getting started

Install and run the browser workspace:

```bash
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3200
```

The current-air-quality Eve tool also needs the local FastAPI service. Start it
in a second terminal from this directory:

```bash
npm run dev:api
```

Confirm the service is reachable before testing a current-conditions prompt:

```bash
curl http://127.0.0.1:8502/health
```

Useful checks:

```bash
npm run typecheck
npm run build
```

`npm run build` compiles both the Eve runtime and the Next.js app. For a
self-hosted production smoke test, run the public Next server and the private
Eve runtime together with the same entrypoint used by the web image:

```bash
PORT=3000 ./scripts/start-production.sh
```

The public health check is `GET /api/health`. The entrypoint keeps Eve on a
loopback port and proxies `/eve/*` through Next, so the browser never needs a
second origin. Set `EVE_NEXT_PRODUCTION_PORT` only when the default loopback
port (`4274`) is unavailable.

The preview map uses MapLibre with the configurable OpenFreeMap Liberty style;
station coordinates and readings are clearly labelled illustrative fixtures
until the live geospatial contract is connected. Set
`NEXT_PUBLIC_MAP_STYLE_URL` to replace the preview style, and set
`NAPAS_API_ORIGIN` to the FastAPI origin when exercising the typed current
air-quality tool and the anonymous chat telemetry relay. In development the
relay defaults to `http://127.0.0.1:8502`; set `NAPAS_API_ORIGIN` explicitly
when the FastAPI service is elsewhere. Configure the server-side model with
`GEMINI_API_KEY` and optionally `GEMINI_MODEL` (the default is
`gemini-3.5-flash-lite`). Never expose the key through a `NEXT_PUBLIC_*`
variable. Telemetry is best-effort and contains no account, cookie, device, or
contact identity fields.

Start by editing `agent/instructions.md` to define the agent's identity, purpose, tone, and response guidelines. Configure its model and runtime behavior in `agent/agent.ts`.

Add capabilities under `agent/`, including tools, connections, channels, skills, subagents, and schedules. eve reloads your changes as you work.

## Eve development

This app was bootstrapped with [`eve init`](https://eve.dev/docs/reference/cli#eve-init).
The agent identity is in `agent/instructions.md`, the model/runtime wiring is in
`agent/agent.ts`, and Napas-specific capabilities live under `agent/tools/`.
The `/` route is the complete Napas product surface. Chat state is intentionally
page-local and disappears on refresh; there are no generated session-navigation
routes because this is an anonymous, no-login experience.

## Learn more

To learn more about eve, explore these resources:

- [eve documentation](https://eve.dev/docs) — learn about eve's features and authoring APIs.
- [Build an Agent tutorial](https://eve.dev/docs/tutorial/first-agent) — build and deploy an agent step by step.
- [eve on GitHub](https://github.com/vercel/eve) — view the source and contribute.

## Deployment target

The planned deployment target is Railway. Keep the web app and FastAPI service
as separate services while the free-tier topology is validated. The public
hostname milestone is the Cloudflare-managed `napasjakarta.com`, mapped
to Railway only after the Railway origin is healthy and HTTPS is verified.

The Railway web service uses [`Dockerfile`](Dockerfile),
[`railway.toml`](railway.toml), and `GET /api/health`. The root Railway
service uses the repository Dockerfile as the private FastAPI boundary and
starts `uvicorn app.api:app`; it is not the public UI.

Do not use Eve's Vercel deployment command for this workspace; it is not part
of the Railway deployment path.
