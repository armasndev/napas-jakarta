# Napas Jakarta search and analytics setup

This setup is for Napas Jakarta's own site and GA4 property. The current public
domain recorded for the project is `napasjakarta.armasn.dev`.

## Current baseline

The production homepage responds successfully. At the last public check, its
HTML used the generic description “A conversational workspace for understanding
Jakarta air quality,” and `/sitemap.xml` returned 404. The web code now defines
canonical metadata, an XML sitemap, a sitemap-linked robots file, and paired
English and Indonesian air-quality guides.

Confirm the deployed commit and Railway deployment after publishing these
changes; merging code alone does not prove that production has updated.

## Google Search Console

1. The property is the verified **Domain property** `sc-domain:napasjakarta.armasn.dev`.
   A service account for API access lives in
   `.claude/secrets/gsc-service-account.json` (git-ignored). Enable the Search
   Console API in that Cloud project if not already enabled. As of 2026-10-04
   the sitemap is registered in GSC but has **never been crawled** and the
   property shows **0 impressions all time**, so Googlebot has not reached the
   property since verification. Re-submitting the sitemap and running
   *Request indexing* on the changed URLs is the next step.
2. Submit `https://napasjakarta.armasn.dev/sitemap.xml` under **Sitemaps**.
   Use URL inspection for the homepage, About pages, both guide pages, and both
   Privacy pages:
   - `https://napasjakarta.armasn.dev/`
   - `https://napasjakarta.armasn.dev/about`
   - `https://napasjakarta.armasn.dev/id/tentang`
   - `https://napasjakarta.armasn.dev/air-quality-jakarta`
   - `https://napasjakarta.armasn.dev/id/kualitas-udara-jakarta`
   - `https://napasjakarta.armasn.dev/privacy`
   - `https://napasjakarta.armasn.dev/id/privasi`
   The Privacy pages are indexable and included in the sitemap.
3. In **Settings → Search generative AI**, verify Napas is included in Google
   Search's generative AI features. If the property inherits a parent setting,
   confirm that setting is also inclusion. Google says inclusion is the default
   for a property that does not inherit an exclusion.

Domain properties cover their subdomains and protocols; `napasjakarta.armasn.dev`
does not merge data with a separate `armasn.dev` property. See Google's
[property setup guide](https://support.google.com/webmasters/answer/34592?hl=en)
and [Search generative AI control](https://support.google.com/webmasters/answer/16908024).

## Google Analytics 4

1. The Napas web code is configured with measurement ID `G-H242BLRQXX`. Confirm
   that it belongs to a web stream in the separate **Napas Jakarta** GA4
   property for `https://napasjakarta.armasn.dev`, not the ServersUp property.
   If needed, create a separate property and web stream before linking it.
2. This measurement ID is a public ID, not a password or API secret. The optional
   `NEXT_PUBLIC_GA_MEASUREMENT_ID` build variable overrides that default; if
   Railway already defines it, make sure it matches this Napas stream. Rebuild
   and deploy the web service after changing the value.
3. Analytics loads only after a visitor chooses **Allow analytics**. A visitor
   who declines before opting in does not load the Google tag. If a visitor
   later changes consent using **Privacy choices** on the English or Indonesian
   Privacy page, the app stops sending manual page-view and interaction events
   when consent is declined and updates Google's consent state.
4. The code sends page views for the homepage, About pages, and both guides.
   After consent, it also counts assistant question starts, suggested-question
   selections, positive/negative answer feedback, topic and station picker
   actions, station selection and clearing, mobile map and legend actions,
   station-list actions, map-layer and filter changes, map camera and zoom
   changes, and map retry or station-question actions. Parameters are limited
   to fixed action labels, feedback rating, selection source, zoom direction,
   layer name, and coarse filter category. Napas sends page paths without query
   strings or fragments and reduces referrers to their domain. Campaign query
   values are disabled. Events contain no question or answer text, attachments,
   station or district names or IDs, map coordinates, or app session IDs.
   Ads storage, Google signals, and ads personalization are disabled.
5. In the GA4 web stream, turn **Enhanced Measurement off**. This keeps GA from
   collecting automatic scroll, outbound-click, site-search, form, file-download,
   and video events in addition to Napas's explicit event list. The app sends
   its own page views for the homepage, About pages, and guides; Privacy pages
   are excluded. GA4's standard session and device signals still apply after
   consent.
6. Test with an explicit opt-in: open the public homepage, use suggested
   questions and topics, submit a question, rate an answer, use map controls,
   and visit both guides. Confirm the page views and interaction events in
   **Realtime**. Repeat after declining and confirm no Google Analytics events
   are sent.

Google's current setup steps are in its [GA4 website setup guide](https://support.google.com/analytics/answer/14183469?hl=en).

## Link the two Google properties

After Search Console ownership is verified and the GA4 property is created,
link them in **GA4 Admin → Product links → Search Console Links**. Google
requires a verified Search Console owner and Editor access to the Analytics
property. Keep the Napas Search Console property and Napas GA4 property
selected; this link does not combine Napas and ServersUp data. See Google's
[linking instructions](https://support.google.com/analytics/answer/10737381?hl=en).

## SEO and answer-search content plan

### Napas's audience and job

Napas is a bilingual Jakarta air-quality map and assistant. Its practical
audiences are Jakarta residents and commuters who want to understand a station
reading, and people who need a clear explanation of PM2.5, PM10, ISPU, data
timestamps, or sources. The core job is to help them interpret a reading and
reach its source, not to present one monitor as a city-wide average.

### Search topics to start with

- English: Jakarta air quality, Jakarta air quality map, Jakarta PM2.5, Jakarta
  ISPU, how to read an air-quality station reading.
- Indonesian: kualitas udara Jakarta, ISPU Jakarta, PM2.5 Jakarta, cara membaca
  data kualitas udara, stasiun pemantau kualitas udara Jakarta.

These are intent themes, not claims about search volume. Use Search Console
queries and landing-page performance to refine them after indexing.

### Pages and next content

- **Available now:** the workspace homepage, a sourced air-quality guide in
  each language, and bilingual About pages. The guide pages have reciprocal
  language links and self-canonicals. Privacy pages are directly accessible,
  indexable, and included in the sitemap with reciprocal language alternates.
- **Next:** a data-source and freshness page, once the exact update cadence,
  station coverage, and fallback behavior can be stated for users.
- **Then:** a station coverage explainer with official source links and dates;
  create individual station pages only when each has stable, useful, distinct
  information.
- **Later:** an exposure-guidance page only with carefully sourced official
  health guidance and a clear editorial review process.

Do not create thin district or station pages solely to repeat keywords. Google
says its AI Search features use the same core Search practices: useful original
content, crawlability, and clear organization. Google does not require a special
AI file or schema for AI Overviews or AI Mode. The guides use direct answers,
ordinary question headings, visible government and WHO sources, and structured
HTML for readers and answer engines. See [Google's guide to generative AI
features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

### How to review progress

- Search Console: indexing of the three public URLs, search queries, impressions,
  clicks, and click-through rate for both English and Indonesian topics.
- GA4: opted-in public-page views and counts of assistant, topic, feedback, and
  map interactions. Never treat low opt-in volume as total site traffic.
- After each release: verify the deployed commit, homepage, both guide URLs,
  `/robots.txt`, and `/sitemap.xml` on the live domain.
