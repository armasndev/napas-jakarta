# Napas Jakarta redesign spec

Living document. Each area has **Now** (verified in the code), **Target** (agreed or proposed) and **Gap**. Update **Now** when code lands; mark open decisions in **Open questions**. Visual reference: the Claude Design canvas "Napas Jakarta Redesign" (round 2).

Status key: `agreed` = user decided; `proposed` = my recommendation, needs a yes.

**Scope rule (2026-10-31): v1 stays small.** Do not over-engineer. Anything marked deferred in section 8b is out of v1 until a real problem appears.

## 1. Shell and layout

**Now.** `workspace.tsx` renders `SiteHeader`, then a `.workspace` with `AgentChat` (left) and `WorkspaceMap` (right). On mobile the map is an overlay toggled by `mapOverlayOpen` (logic in `web/lib/mobile-layout.ts`, with `mobile-layout.test.ts`). The map is MapLibre (`workspace-map.tsx`, `lib/map-layers.ts`, `lib/map-heatmap.ts`, each with tests). Content is width-constrained and heavily rounded.

**Target (agreed).**
- Full-bleed: use the whole viewport width and height; no side gutters or max-width page frame. Only reading columns (chat text, article body) cap their own width (~760 px).
- Chat is constant on the left. The right side is one **side panel** with three tabs, **News**, **Map** and **Timeline** (section 5a). Panel width is about 1.1x the chat column; both flex.
- Corners 4 px on controls, cards and inputs; 3 px on tags and badges; 2 px on small markers. No pills or ovals (the heatmap blobs and the low-precision event area are deliberately round because they show an area).
- Flat surfaces with 1 px hairline dividers instead of shadows.

**Gap.** Replace the map/chat split with the tabbed panel; remove the mobile overlay in favour of the same tabs. That retires `mapOverlayOpen`, rewrites `mobile-layout.ts` and its test, and changes the map component's container (not the MapLibre layers).

## 2. Side panel: News tab

**Target (agreed, supersedes the earlier slide-in reader).** There is **no in-app article viewer**. The audit showed iframed publisher pages are mostly blocked by `X-Frame-Options` / `frame-ancestors`, cannot be detected as blocked from the client, and would load third-party trackers inside Napas. So:
- The panel is a filterable list (All, Protests, Traffic, Policy, Health). Row = grip, category tag, outlet, time, serif headline with a `↗` cue, excerpt, and a `+` button.
- Clicking the headline opens the publisher in a **new tab** (`target="_blank" rel="noopener noreferrer"`). Nothing third-party loads inside Napas.
- A row is draggable from its grip or body into the chat; `+` is the keyboard and touch alternative. Rows show `IN CHAT` once added.
- Dropped from the design: slide-in animation, back caret and X, iframe, embed flag and header probe, and the CSP `frame-src` work. This also closes the iframe privacy, clickjacking and CSP findings from the audit.
- Excerpts are the stored, bounded feed description, not a Napas re-render of the article.

## 3. Side panel: Map tab

**Now.** `workspace-map.tsx` (about 840 lines): markers, heatmap layer, station list/detail, legend, station selection shared with chat through `selectedStationId`.

**Target (agreed).** Same behaviour, hosted inside the panel's Map tab. Selecting a station still adds the station chip to chat. New **Events** layer: news items that name a place are shown as diamond markers (distinct from the square station markers), labelled by topic. Events come only from the viewer's language feed (section 5). Position is the reported area, not an exact point. Events need coordinates resolved at ingestion (section 5, Event extraction); items with no resolved location appear in the list only.

## 4. Chat and context chips

**Now.** `agent-chat.tsx` (about 970 lines) keeps two context chips, station and topic (`napas-selected-context`). They are sent as `clientContext`, built by `buildNapasClientContext(...)` in `web/lib/topics.ts` and called from `agent-chat.tsx`. `web/lib/user-input-limits.ts` caps the serialized context at `MAX_CLIENT_CONTEXT_CHARACTERS` (8,000); `web/proxy.ts` separately caps a chat request body at 32,000 bytes (`MAX_CHAT_REQUEST_BYTES`) and `next.config.ts` sets `proxyClientMaxBodySize` to 128 kB. None of these count resolved article text, so 5c defines its own resolved-context caps. The Eve channel has `uploadPolicy: "disabled"` and the prompt input has `allowAttachments={false}`. `web/agent/instructions.md` already treats client context as untrusted data.

**Target (agreed).** News articles are a third chip type. A chip is added three ways:
1. Drag a row (or the open article) into the chat; the whole chat column is the drop target and shows a dashed "Drop to add this article as context" overlay.
2. The `+` button on each row, and "Add to chat" in the article view (keyboard and touch path; drag is never the only way).
3. A chat answer's news citation can be re-added.

Chip kinds in v1 (all travel as ids, never text): **article**, **station pin**, **event pin** (map Events layer). Timeline entry chips are deferred (8b). A pin is added by dragging the marker onto the chat, or by "+ Add pin to chat" in the pin card (the accessible path). An event pin chip also gives the agent its linked article. Mixed chips are fine (for example one article plus one station pin).

Chip rules:
- Shown above the input with an × to remove. Up to **4** per message (fits the 8,000 character context budget). Shown as compact pills above the station chip: one pill with its kind label for one chip, a two-column grid without labels from two chips, so the panel never grows past two rows.
- On send, the chips move into the sent message (shown as labelled cards above the user bubble, kind label first) and the composer clears them.
- A message with chips and an empty input is allowed; it defaults to "Summarise this and tell me how it affects me."
- Dragging does not use file uploads, so `uploadPolicy: "disabled"` stays.

**Data flow (see 5c).** Chips travel as typed `{ kind, id }` pairs. The web server validates them and resolves each id through the private API to stored title, outlet, published time, URL and excerpt, before the agent runs. This keeps pasted or spoofed article text out of the prompt, keeps size bounded, and lets the answer cite the stored record. The agent receives the resolved text as untrusted evidence and must show outlet and time.

**Response when chips are attached (proposed).** The answer is grouped as labelled rows, each with its own citation: `NEWS · ATTACHED`, `STATION OBSERVATION`, `EVENT LOCATION`, `TIMELINE`, then `NOT SHOWN BY THE SOURCES` when attached items do not support a link the user asked about (for example rally vs. air quality), then `GUIDANCE · RETRIEVED` for anything the agent fetched itself. A footer line states what was used (`n attached · n retrieved`). Attached evidence is prioritised, retrieval fills gaps, and the agent abstains on anything neither covers.

**Answer shape (agreed from existing rules).** Keep station observation, citywide context and news visibly separate, each with source and time; abstain when evidence is missing. News is never presented as a measurement.

## 5. News pipeline

**Now.** Nothing for news. Station and daily-history refresh run from `ingestion/railway_cron.py` on a Railway cron (`0 */2 * * *`, in `railway-cron.toml`). The news job runs hourly, so it needs its own cron service and config file rather than a change to this one. RAG lives in `app/rag.py`, `app/retrieval.py`, `ingestion/indexing.py`; the API is private behind the internal token (`app/api.py`).

**Target.**
- **Scheduler (agreed).** A separate Railway cron service, same pattern as `railway_cron.py`. No Cloudflare Worker.
- **Sources are curated (agreed).** You supply base domains only, one list per language, after vetting them. The cron discovers feeds or sitemaps from the base domain; it never crawls outside the list. A source can be paused without deleting it.
- **Polling (agreed).** Hourly. Fetch the feed (or sitemap) only, with conditional requests (`ETag` / `If-Modified-Since`), a descriptive user agent, and respect for `Retry-After` and robots.txt. v1 never fetches article pages. Each source runs in its own try/except with a timeout; a failing source just retries next hour and never blocks the others.
- **Language separation (agreed).** English and Indonesian sources are separate feeds. Each item carries `lang` (`en`|`id`), and the list, map Events, chat retrieval and `search-news` all filter by the viewer's language, so EN and ID viewers can see different news by design. Switching language swaps the feed and closes any open article; chips from the other language are dropped. Station data and non-news RAG stay shared. Each language has its own allowlisted source list.
- **Language feed visibility (agreed, audit follow-up).** Because EN and ID viewers see different news, the panel always says which feed it is showing: the News status line reads "English sources" or "Sumber berita Bahasa Indonesia", and the Map's Events note says "Events come from English-language news only". There is no cross-language toggle in the first version; the same event may appear for one language and not the other, and the labels make that explicit. Revisit if bilingual users ask for a read-only view of the other feed.
- **Steps.** fetch the feed; normalise (title, outlet, link, published time, language, feed description as excerpt); upsert on canonical URL; one LLM call; geocode when the call finds an event; store.
- **Event extraction (agreed, v1 simplified).** **One** cheap instruct-model call per new item, on the title and the feed description only (no article body is fetched in v1). It returns constrained JSON:
  `{ "relevant": true|false, "event": true|false, "topic": "PROTEST|TRAFFIC|POLICY|HEALTH|ENVIRONMENT|OTHER", "location": "<place string or null>", "event_start": null|ISO, "event_end": null|ISO, "status": "planned|ongoing|over|unknown" }`.
  - **Relevance (agreed 2026-10-31).** The service is about air quality in Jakarta, and that continues outside haze season. A cheap keyword filter (`data/news_keywords.json`, English and Indonesian, editable) cuts the feeds down first and favours recall. The model's `relevant` answer is the decision: true for air pollution and its sources, haze and fires anywhere that can affect Indonesia or its neighbours, government, legal and health responses, and protests, closures, fires or floods in Jakarta; false for everything else. Stories answered false are stored hidden (`relevant = false`) so the next run does not ask about them again, and are never shown, pinned or searched. A missing or malformed answer keeps the story.
  - `location` is a map-lookup string (landmark, street, district); the model never returns coordinates. Times and status are filled only when the text states them; otherwise null and `unknown`.
  - *Geocode* (only when `event` is true and `location` is set): Google Maps Geocoding, biased to Jakarta, results outside the Jakarta bounding box dropped. Keep `lat`, `lng`, `place_id`, matched label and `precision` (point, street, district); low precision is drawn as a district area, not a pin. Cache results by normalised string.
  - If the call fails or returns invalid output, the item is stored as a normal article (topic from a simple keyword rule) and tried once more next run.
  - **Model class (agreed):** an instruct-tuned model from Google's catalog, picked by the small evaluation in 8a. Ingestion uses its own backend API key, not the shared free-tier chat key.
  - Article text is data, never instructions; output is schema-validated.
  - If accuracy on title and description alone proves too low, adding a second call that reads the body is a deferred option (8b).
- **Storage.** New Postgres table(s) beside the observation tables. Store headline, link, bounded excerpt and metadata; **do not store full article text** (copyright and size).
- **Event time and status (agreed).** Event pins carry `event_start` and `event_end`, both nullable and used only when the article states them; the model must not infer times. The extraction call returns them as optional ISO-8601 fields (default timezone WIB), schema-validated, and they are dropped if unparseable or more than 60 days out. Also stored: `status` (`planned` | `ongoing` | `over` | `unknown`; default `unknown`; set by the model only from explicit wording, and cleared back to `unknown` when a later item contradicts it) and `reported_at` (article publish time).
- **Pin expiry (agreed).** A pin is shown while `status` is not `over` and: `event_end` has not passed, or, when no end is stated, `reported_at` is within a configurable window (default 12 hours). Expired events stay in the list and in retrieval, but leave the map.
- **Pin honesty (agreed).** Every pin and event chip says "Reported by <outlet>, unverified", and shows "event time not stated" when it is null. The place is described as taken from the article text. Duplicate reports of one event become one pin with a report count (rule in 5g).
- **Answer rules for events (agreed).** The agent never uses distance or "near" wording unless a tool returned it, and never implies an effect on air quality from an event; it states what each attached source says, adds `NOT SHOWN BY THE SOURCES` when a requested link is unsupported, and abstains otherwise. Evaluation (section 8a) includes causation probes that must abstain.
- **Retention.** Proposed 30 days, with cleanup in the same cron as the interaction cleanup.
- **Freshness.** Show age on every item. Items older than the list window are hidden from the feed but may remain searchable until retention.
- **API.** `GET /news` (filters: topic, since), `GET /news/{id}`, `POST /news/search` (retrieval), all behind the internal token. Web proxies `/api/news` for the browser.
- **Agent.** The authored tool surface is the seven files in `web/agent/tools/`, and `web/agent/tool-surface.test.ts` pins that exact list and asserts each uses `fetchNapasJson` or `fetchSourceManifest`. New tools (`search-news`, `get-timeline`) must be added to that test in the same change. `instructions.md` gets a line: news is event context, not an air-quality reading; cite outlet and time.
- **Evaluation.** Add news cases to `evaluation/` (abstain when no relevant item; no station/news mixing).

## 5a. Timeline (curated)

**Target (agreed).** A third panel tab, **Timeline**: a vertical, date-ordered list of events curated by you. Each entry has date, category (Policy, Protest, Incident, Study), title, short summary, and linked source domains. It is not auto-generated; we build it together from your curation.
- v1: timeline entries are viewable and queryable by the agent (`get-timeline`). Timeline-entry chips (drag or `+`) are deferred (8b).
- **Storage (proposed):** a `timeline_events` table (`id`, `date`, `date_precision`, `category`, `title_en`, `title_id`, `summary_en`, `summary_id`, `sources` as URL list, `place`, `created_at`, `updated_at`, `status` draft|published). Authoring through a validated, version-controlled file (YAML or JSON in the repo) loaded at deploy, so every curated change is reviewed in git. A form can come later.
- **API:** `GET /timeline` (filters: category, from, to), `GET /timeline/{id}`, `POST /timeline/query` (text and filters).
- **Agent tool:** `get-timeline` queries the API and cites entry date and sources. The prompt says timeline entries are curated context, not live data, and the agent never extends them from memory.
- Entries are **not** mixed into the guidance corpus; they are queried only through `get-timeline` (see 5d).
- The canvas timeline shows placeholder entries only. Real entries come from your curation.

**Open:** bilingual entries (both languages per entry, as proposed above) or one language each.

## 5b. Architecture

See canvas board 9. Rows: stations (existing), news, events, timeline, retrieval. Columns: sources, ingestion on Railway cron, Postgres, private API, agent tools. New: curated domain lists, hourly news poll, event pipeline (one instruct-model call on title and description, then Google geocode), `news_items` / `events` / `timeline_events`, `/news`, `/events`, `/timeline`, tools `search-news` and `get-timeline`, and a server-side context resolver (not a model-callable tool). The portfolio architecture diagram was not available to me; share its link and I will align the style.

## 5c. Fetch safety and context resolution

Scope decision (2026-10-31): keep this light. Sources are curated, so only the basics go in now; the rest is listed as deferred.

**Basic protections (agreed)**
- v1 fetches feeds only, never article pages.
- **Fetch only curated domains.** `https` only; the host must be a curated domain or a subdomain of one, checked on feed links, article URLs and each redirect. Anything else is stored as text and never fetched.
- **Refuse internal addresses.** Reject loopback, private, link-local and cloud-metadata IPs before connecting, including after redirects. At most 3 redirects.
- **Bounds.** 15 s total timeout, and a response size cap (feed 2 MB) so a bad feed cannot hang or exhaust the job.
- **Safe XML.** Parse feeds with a parser that has DTDs and external entities off.
- **Escape on output.** Titles and excerpts are length-capped and rendered as escaped text; links must be `http(s)` and open with `rel="noopener noreferrer"`.
- **LLM and geocoder.** Ingestion LLM calls use no tools. The `location` string is capped at about 120 characters, must appear in the article title or body, and is URL-encoded into the fixed geocoder endpoint; results outside Jakarta's bounding box are dropped. The geocoder key is restricted to the Geocoding API with a budget cap.
- **Keys.** Ingestion LLM and geocoder keys live in Railway env vars, separate from the chat key.

**Chip context resolution (agreed; this is correctness, not SSRF)**
- The browser sends chips as `[{ kind, id }]`, at most 4, with `kind` in `article | station | event | timeline` and a well-formed `id`. Chip text never travels from the browser.
- The web server resolves them through the private API before the agent runs. There is no model-callable resolve tool.
- Resolved text is capped per chip (about 1,200 characters) and in total (3,600). Missing or expired ids show "no longer available" and are dropped; the message still sends.

**Deferred (revisit if scope or risk grows)**: DNS pinning against rebinding, a decompressed-size cap, a content-type allowlist, a separate database role for the news job, and extra rate limits on the news and resolver routes (the normal chat-route limits still apply).

## 5d. Retrieval separation (news and timeline vs. guidance)

**Now.** `POST /guidance/search` runs `search_guidance(query, DOCUMENTS, ...)` over one curated corpus (`DOCUMENTS`, built by `ingestion/corpus.py` and `chunking.py`, optionally indexed in Qdrant by `ingestion/indexing.py`). Every chunk has a `source_id` that maps to the source manifest, and `validate_citations` in `app/rag.py` checks answer citations against the retrieved `source_ids`. Anything added to that corpus is treated as manifest-backed evidence for health, standards and policy claims.

**Risk.** If news chunks went into that corpus, a health or policy question could retrieve and cite a news item as evidence, and news would be ranked against studies and standards.

**Decision (proposed).**
- **Separate stores.** News lives in its own collection (a separate in-memory document list built from `news_items`, and a separate Qdrant collection if Qdrant is used), searched only by `POST /news/search`. Timeline entries are queried only through `/timeline/query`. Neither is ever added to `DOCUMENTS`, the manifest, or the guidance index. No cross-corpus score merging: the agent calls each tool explicitly.
- **Separate citation namespace.** News ids are `news:<id>` and timeline ids `timeline:<id>`. The citation validator accepts a news or timeline id only against rows the agent actually received from that tool, and tags each citation with its kind so the UI can label it `NEWS` or `TIMELINE`, never as guidance.
- **Tool boundaries.** `search-grounded-guidance` never returns news or timeline rows. `search-news` returns only news (language-filtered, freshness shown). `get-timeline` returns only curated entries.
- **Prompt rule** (`web/agent/instructions.md`): news and timeline are event context, not air-quality, health or policy evidence. They may support "what was reported" and "when", but not claims about exposure, health effects, causes, standards or law. Mixed answers keep them in separate labelled rows, as in the Sent board.
- **Attached chips** follow the same rule: an attached article is evidence of what was reported, not of air quality.
- **Index builder.** `ingestion/` guidance indexing is unchanged. The news job writes only the news collection and has no path into the guidance index.

**Evaluation** (adds to section 8a). Probes where news on the topic exists in the store: (1) a health-effect question must cite guidance only, never a news item; (2) a "what happened at X" question must cite news only, with outlet and time; (3) a mixed question must produce separate rows; (4) no relevant news must abstain rather than fall back to guidance.

**Tests.** Unit test that `search_guidance` cannot return a `news:` or `timeline:` id; contract test that `tool-surface.test.ts` lists the new tools; fixture with a news item containing health-sounding text.

## 5e. Copyright and source terms

Response to the audit's copyright and terms finding. This is an engineering policy to reduce risk, not legal advice; whether it is enough depends on each outlet's terms; Napas is strictly non-commercial (decision below).

**Principle.** Napas is an index and a pointer, not a republisher. It stores what a feed offers for syndication, shows it with attribution, and sends readers to the publisher.

**What we store (per item)**
- Title, canonical link, outlet, published time, language, topic, and the feed's own description truncated to a hard cap (300 characters).
- Derived fields from extraction: location string, coordinates or place id, `event_start` / `event_end`, `status`.
- **Not stored or fetched: the article body.** v1 never fetches article pages, so there is nothing to store.
- **No generated summaries** stored or shown; the LLM only extracts structured fields.
- **No images or thumbnails.**

**Source record (v1).** `domain`, `lang`, `outlet`, `feed_url`, `terms_url`, `terms_checked`, `active`, and optional `relevance_filter` (default true). The filter is `data/news_keywords.json`: keep stories about air quality from anywhere (haze, fires, emissions, government response, Singapore and Malaysia included) in English and Indonesian, plus Jakarta protest and closure stories; any exclude term drops a story first. It runs before any model call. A source is switched on only after you have checked its terms and noted the URL. If a site forbids reuse, it stays off. Fields like per-source excerpt limits, retention overrides and reuse-basis codes are deferred (8b).

**How it is shown**
- Every item shows the outlet name, and the headline links to the publisher in a new tab (see section 2). The list says "via <outlet>".
- Chat answers paraphrase and cite; they quote at most a short phrase and never reproduce an article. The prompt rule is added to `web/agent/instructions.md` with the news rules (5d).
- Attached chips send only the stored fields to the model, never the original page.

**Operations**
- Fetches identify as Napas with a contact URL. Robots.txt is respected.
- **Takedown.** A publisher request: switch the source off and delete its items. A contact address is on the About page.
- **Retention.** 30 days.
- **Timeline.** Entries are your own written summaries with links to sources.

**Decisions (2026-10-31).** Napas is strictly non-commercial: no ads, sponsorship or paid tier, a free public good. No legal review is planned. Consequences:
- The non-commercial status is recorded as a standing constraint; adding ads, sponsorship or a paid tier would reopen this section and every source record.
- `terms_notes` on each source still records what that outlet's terms say, so a source that bars even non-commercial reuse is judged by you when vetting, not assumed fine.
- The About page states that Napas is non-commercial and links to publishers.

## 5f. Accessibility and edge states

Response to the audit's accessibility and missing-states findings. Canvas board 13 draws the edge states; board 1 carries the control fixes.

**Controls and targets**
- Primary controls are at least 44 px high on touch and 40 px on desktop: panel tabs 44, EN/ID toggle 40, `+` 52 wide, pin card button 44, map pins 36 (event pins have a 44 px hit area around a 22 px diamond). Filter chips stay 32 to 36 px with at least 6 px spacing (WCAG 2.2 target minimum is 24 px).
- Colour: muted text is `#5B5F66` or darker; placeholder text uses `#5B5F66`; decorative grip uses `#6B6759`. Input and control borders stay at least 3:1. Verify every AQI band label pair and the event label over the map with a contrast tool before build.

**Structure and keyboard**
- One `main` (chat); the side panel is a labelled region. The tab strip is a proper `tablist` with `tab` / `tabpanel` roles, `aria-controls`, `aria-labelledby`, a roving `tabindex` and Left/Right/Home/End keys. The panel for a hidden tab is not focusable.
- News is a list; each headline link is named "<title> (opens <outlet> in a new tab)" and carries `lang` from the feed. The timeline is an ordered list with `<time>`.
- Drag is never the only way: `+` on every row, "Add pin to chat" on every pin card, "Add to chat" on timeline entries. Pins are focusable buttons; Enter selects and opens the card; the card's button is the keyboard path.
- The map is not the only view of its data: the Map tab gets a "List" toggle showing the same stations and events as a list (also the screen-reader path).
- Chips: a labelled group "Attached context, n"; each remove button is named "Remove <title> from message". A polite live region announces "Added to your message, 2 of 4" and "Limit reached: 4 of 4. Remove one to add another." Focus stays where it was after adding; after send, focus returns to the input.
- Motion: there is no slide-in any more. Any remaining transition (drop overlay) respects `prefers-reduced-motion`.
- Reflow: layouts work at 320 px width and 400% zoom (panel stacks under the chat; mobile uses the bottom nav sheets).

**Edge states (copy is draft; each needs an Indonesian version)**
| Area | State | Behaviour |
| --- | --- | --- |
| News | loading | skeleton rows, `role=status` |
| News | filter has no match | message plus "Show all topics" |
| News | no successful poll in 3 h, or sources paused | banner with last-updated time; old items stay with their times |
| News | no active sources in this language | message in that language; chat, map, timeline still work |
| Map | events on, none current | "No reported events right now" plus the 12 h rule |
| Map | low location precision | dashed area, never a pin |
| Map | station reading over 24 h old | marked stale, not shown as current (existing rule) |
| Timeline | empty or no match | message plus "Show all" |
| Chat | 4th chip | refused, visible and announced message |
| Chat | chip target deleted by retention | past messages keep the title marked "no longer available"; a new send drops it and still sends |
| Chat | language switch with attached chips | chips removed with a visible note |
| Chat | rate limited or offline | clear message; the draft and attachments are kept |

**Testing.** Add an axe pass over the main states, a keyboard-only walkthrough (tabs, add via `+`, pin card, send, remove chip), and a reduced-motion check to the pre-release checklist.

## 5g. Reliability and duplicate events (v1)

Kept deliberately small for an hourly job on a handful of domains.

- **One failure never stops the run.** Each source runs in its own try/except with a timeout; a failed source retries next hour.
- **No duplicates.** Items upsert on a unique canonical URL (lowercase host, no fragment, no `utm_*`). A near-identical title from the same outlet within 24 h replaces the older item.
- **Time.** Store UTC; assume WIB when the feed gives no timezone; ignore dates more than a day in the future; show WIB.
- **Retention.** A cleanup at the end of the run deletes news items and events older than 30 days.
- **Geocode cost.** Cache by normalised string. The Google billing budget alert is the backstop.
- **Duplicate event pins.** Reports merge into one pin with a report count when they share topic, the same place (`place_id` or district) and were reported within 12 h of each other. Otherwise they stay separate (two pins is safer than a wrong merge). The cluster pin card says "3 reports from different outlets, unverified"; the list still shows every article. Times: an explicit time from any report is used, conflicts become null. Status: the latest explicit status wins, contradictions become `unknown`. The pin leaves the map when the end time passes or 12 h after the newest report.

Deferred (8b): persisted backoff and circuit breaker, advisory locks, per-run caps, daily geocode cap, tuned merge thresholds, multi-day clusters.

## 5h. Logging (v1)

Uses the existing `monitoring.structured.emit_log(level, event, **fields)` (one-line JSON to Railway Logs). Two events are enough to diagnose any source:

- **`news_source_failed`** (warn): `run_id`, `source` (domain), `lang`, `stage` (`feed` or `geocode` or `llm`), `error_class`, `http_status`, bounded `message`. `error_class` is one of `timeout`, `dns`, `tls`, `http_429`, `http_4xx`, `http_5xx`, `parse_error`, `off_domain`, `blocked_ip`, `too_large`, `robots_disallowed`, `unknown`.
- **`news_run_completed`** (info; error with `alertable=true` if every source failed): `run_id`, `duration_ms`, `sources_ok`, `sources_failed`, `items_new`, `events_found`, `geocoded`, `llm_failed`, `items_purged`.

Rules: never log titles, excerpts, feed XML, headers, keys, or URLs with query strings. One failure is one line, so "what failed, at which step, for which source" is a single search by `source` and `event`.

Deferred (8b): per-stage fetch lines, pause and resume events, `source_state` mirror, `make news-status`.

## 6. Mobile

**Target (proposed).** Chat fills the screen. A bottom nav switches Chat / News / Map / Timeline; each opens as a full-height sheet over the chat. Articles open in a new tab. Chips use the `+ Add to chat` / `+ Add pin to chat` buttons (no drag on touch); chips show above the message and in the sent bubble as on desktop. Canvas boards 10 to 12 show chat after send, the news list, and map with pin.

**Gap.** Mobile Timeline sheet is not drawn yet.

## 7. Approval-required changes

Per repo rules these need an explicit yes before implementation: the Google Maps API key and its outbound calls, a separate ingestion LLM key, new database tables, new env vars (source list, cron schedule, retention), a new Railway cron service, new outbound sources (the news hosts), new public routes (`/api/news`, context resolver).

## 8. Open questions

1. Which named sources go in each language list (EN and ID)? Needs your picks, plus a check of each source's terms for RSS reuse.
2. Embedded article vs. summary-only when a publisher blocks framing: is the fallback acceptable?
3. Dark theme in scope?
4. Google Maps Geocoding terms (checked 2026-10-30 against the Geocoding policies page; the Maps Service Specific Terms page did not load, so storage durations below are unverified): the policies page says results "displayed on a map must be shown on a Google Map", requires attribution when shown without one, says content caching or storage is "generally restricted", and exempts place IDs ("store place ID values indefinitely"). Our map is MapLibre, so pins from Google geocoding cannot go on it. You are fine with a Google map, so the options are: (a) render the Events layer on a Google Maps basemap and keep MapLibre for stations (two engines, awkward); (b) move the whole Map tab to Google Maps JS (one engine, rewrite of `workspace-map.tsx`, per-load billing); (c) keep MapLibre and use a geocoder whose terms allow storage and non-Google maps. Storage under (a)/(b): keep `place_id` indefinitely and refresh lat/lng from it, never store lat/lng long-term; verify the lat/lng cache limit in the Maps Service Specific Terms before building. Recommendation: (b) if you want Google quality and are willing to pay the rewrite, else (c). Needs your call.

Decided 2026-10-30: Railway cron; EN and ID sources separate; Events layer in scope.

## 8a. LLM evaluation plan (event extraction)

Pick models by measurement, not preference. Add `evaluation/news_events/` with about 40 labelled items, English and Indonesian, balanced across event and non-event.
- **Gate:** precision and recall of `event: true` against labels; target high recall (missed events are invisible), then precision to control cost. Report per language.
- **Location extraction:** exact or acceptable match of the location string against a hand-labelled place, plus the real measure: share of strings the geocoder resolves inside Jakarta.
- **Event time and status:** precision of extracted `event_start` / `event_end` / `status` against labels, with the null-when-unstated rate reported; a stated-nothing item must never get a time.
- **Causation probes:** about 10 questions such as "does the rally worsen air near X" with attached event and station chips; pass only if the answer abstains or attributes each statement to its own source.
- **Operational:** cost per 1,000 items, p95 latency, schema-valid output rate, behaviour on prompt-injection samples planted in article bodies.
- **Candidates:** the current chat default (`gemini-3.5-flash-lite`) as baseline, a smaller or cheaper tier of it, and one non-Gemini small model. Run through the same harness as `evaluation/evaluate.py` so results are comparable. Model is a config value, not hard-coded.

## 8b. Deferred (not in v1)

- Two-step LLM extraction that reads the article body (add only if the one-call version is too inaccurate).
- Timeline-entry chips (drag or `+`); timeline stays view and query for now.
- Persisted source state, exponential backoff, circuit breaker, advisory lock, per-run item and LLM caps, daily geocode cap.
- Detailed logging: per-stage fetch lines, pause and resume events, `source_state` mirror, `make news-status`.
- Richer source record (excerpt limits, retention override, reuse basis codes, terms-checked date).
- Multi-day event clusters and tuned merge thresholds.
- Heavier fetch safety: DNS pinning, decompressed-size cap, content-type allowlist, separate database role.
- Cross-language read-only toggle.
- Event-time precision evaluation and the large (150 item) labelled set.

## 8c. As built (branch `feat/redesign`)

Where the first implementation differs from the text above:

- **Events are not a separate table.** They are `news_items` rows with `is_event`, location and event-time columns; clustering into pins happens at read time (`app/news.py`). Same behaviour, one table.
- **Timeline** is read from `data/timeline.json` (validated on load) rather than a table. The agent tool `get-timeline` and `/timeline` endpoints are as specified. The shipped file holds placeholder entries marked `demo`.
- **News sources** live in `data/news_sources.json` (empty `sources` list, to be filled with vetted domains).
- **Chip text is not signed.** The browser asks `/api/context/resolve` for stored records and sends them in the client context. They are untrusted data to the agent, and a visitor can already write anything in their own message, so signing was left out (deferred, 8b).
- **Station pins** are added with the pin card (drag the card, or press "Add pin to chat"); station markers on the WebGL layer are not draggable themselves. **Event markers** are draggable DOM markers.
- **Feed fetching** is sequential and unconditional (no ETag / near-duplicate-title replacement yet); known items are skipped by id so the LLM is called once per new item.
- **Demo mode.** With no news in PostgreSQL the API serves `data/demo/news_items.json` (labelled "Sample data" in the UI) so the redesign can be reviewed locally.
- **Station photos.** Optional, curated in `data/station_photos.json` (`{station_id: {url, credit}}`, https only) and exposed as `photo_url` / `photo_credit` on the station catalog, so ingestion's station CSV is untouched. The map overlay shows the photo when present and a placeholder otherwise. Photos load from the URL's host in the visitor's browser (no referrer sent).
- **Fonts.** No new web fonts were added; the redesign uses the existing stack, Georgia for news headlines and the system monospace for labels.
- Not drawn in the canvas but built: language-switch drops attached articles and events with a notice; a 4th chip is refused with a message.

## 8d. Status against this spec (2026-10-31)

**Built:** chat and tabbed panel layout; news list with new-tab links, drag and `+`; four-chip cap with announcements, focus return and compact attachment pills; article, station and event chips resolved server-side; station multiselect with a map that shows one; map Events layer with clustered, expiring, unverified pins; detail overlay with photo field; curated timeline tab and `get-timeline`; `search-news`; generated suggestions with a loading state; hourly news job with one LLM call, geocoding, a Jakarta relevance filter, failure isolation and two log events; labelled-row answer format in the agent instructions; About page section on news, non-commercial status and takedown; `data/news_sources.json` with probed candidates (all inactive); an evaluation harness for the model call (`evaluation/eval_news_events.py`, 24 synthetic EN/ID cases).

The relevance gate is two stages: editable keywords for recall, then the model for precision (see section 5). Trial on 2026-10-31 with the keyword stage alone: 12 of 300 feed items kept, almost all haze, fire and government-response stories.

**Not built yet (deliberately deferred or waiting on a decision):**
- Source activation: no source is active until you have read its terms and set `terms_checked`, `terms_url` and `active` in `data/news_sources.json`. The job enforces this.
- The model call is untested against a real model; run `evaluation/eval_news_events.py` with `NEWS_LLM_API_KEY` and compare candidates (8a).
- Geocoding: decided 2026-11-01 to use Google Geocoding with MapLibre pins for now (key in place, tested). The terms ask for results to be shown on a Google Map and limit how long coordinates are kept, so this is a known risk; fallback is Photon (OpenStreetMap), tested on 35 Jakarta places: found 34, 29 within 2 km of Google.
- News stale banner and last-poll tracking (needs persisted source state, 8b).
- Grouping duplicate articles as one story with a source count; replacing near-duplicate titles; ETag requests.
- Timeline-entry chips; real timeline entries (the file holds placeholders).
- A list alternative for event pins on the map (stations already have a list dialog).
- A contrast check of every colour pair with a tool, and the axe and keyboard walkthroughs (5f).
- The causation probes for the agent (8a) need agent-level evaluation, not just the extraction harness.
- Station-type labelling and hourly station refresh: see `docs/air-quality-sources.md`.

## 9. Change log

- 2026-11-01: Maps key working; Google Geocoding with MapLibre pins accepted for now (open question 4); Google Air Quality API tested against 79 live stations (no correlation, not used); Photon and Nominatim compared as geocoders.
- 2026-10-31: status section 8d; Jakarta relevance filter and source activation gate in the news job; evaluation harness; candidate sources probed; air-quality source evaluation document.
- 2026-10-31: first implementation on `feat/redesign` (see 8c).
- 2026-10-31: v1 cut applied (one LLM call on title and description, no article fetching, small logging, small reliability, small source record, 40-item evaluation, timeline chips deferred). Removed items listed in 8b.
- 2026-10-31: per-source logging (5h); audit follow-ups: Now sections corrected (client context, caps, tool-surface test, cron file, mobile/map files), tabs count and corner radii reconciled, language feed labels.
- 2026-10-31: reliability and duplicate pins (5g): persisted source state, idempotent upserts, per-run caps, event clustering; pin card shows report count.
- 2026-10-31: accessibility and edge-state requirements (5f); target sizes, tab roles, live announcements, contrast fixes on board 1; edge states board 13.
- 2026-10-31: confirmed strictly non-commercial, no legal review; copyright and source terms policy (source record, activation gate, no body storage, no generated summaries, takedown).
- 2026-10-31: retrieval separation (news and timeline kept out of the guidance corpus; own collections, citation namespaces, tool boundaries).
- 2026-10-31: SSRF scope cut back to basic protections; heavier controls deferred.
- 2026-10-31: fetch safety (SSRF), LLM/geocoder input rules, server-side chip resolution; resolve-context is no longer a model tool.
- 2026-10-31: event time/status schema, pin expiry, unverified labelling, causation rules.
- 2026-10-30: no in-app article viewer (articles open in a new tab; still draggable); iframe/CSP/embed-flag work dropped.
- 2026-10-30: pin and timeline chips, response format, curated timeline, curated source domains and polite hourly polling, LLM also categorises, architecture board, mobile update.
- 2026-10-30: Google geocoding terms checked (Google Map required for display); LLM evaluation plan added.
- 2026-10-30: event extraction (title-gate LLM, body location LLM, Google Maps geocode) recorded; geocoder terms flagged.
- 2026-10-30: decisions recorded (Railway cron, separate EN/ID feeds, Events layer); canvas Main board has EN/ID feed swap and Events toggle.
- 2026-10-30: initial draft from design round 2; Now sections verified against `workspace.tsx`, `agent-chat.tsx`, `agent/channels/eve.ts`, `agent/instructions.md`, `ingestion/railway_cron.py`, `app/api.py`.
