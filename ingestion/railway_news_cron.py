"""Railway cron entrypoint for the hourly news poll (see railway-news-cron.toml).

Needs POSTGRES_DSN. NEWS_LLM_API_KEY and GOOGLE_MAPS_API_KEY are optional: without
the first, items are stored as plain articles (keyword topic, no event pins); without
the second, events are not pinned. Keys are server-side env vars only.
"""

from __future__ import annotations

import os
from functools import partial
from pathlib import Path

from app.news import known_news_ids, purge_news, upsert_news

from .news import (
    fetch_bytes,
    load_relevance,
    load_sources,
    make_gemini_extractor,
    make_geocoder,
    run_news_job,
)


def main() -> dict[str, object]:
    dsn = os.getenv("POSTGRES_DSN", "").strip()
    if not dsn:
        raise SystemExit("POSTGRES_DSN is required for the news job")
    data_dir = Path(os.getenv("DATA_DIR", "data"))
    llm_key = os.getenv("NEWS_LLM_API_KEY", "").strip()
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    model = os.getenv("NEWS_LLM_MODEL", "gemini-3.5-flash-lite").strip()
    return run_news_job(
        load_sources(os.getenv("NEWS_SOURCES_FILE", data_dir / "news_sources.json")),
        fetch=lambda url, domains: fetch_bytes(url, domains),
        extract=make_gemini_extractor(llm_key, model) if llm_key else None,
        geocode=make_geocoder(maps_key) if maps_key else None,
        known_ids=partial(known_news_ids, dsn),
        publish=lambda items: upsert_news(items, dsn),
        purge=partial(purge_news, dsn),
        relevant=load_relevance(os.getenv("NEWS_KEYWORDS_FILE", data_dir / "news_keywords.json")).matches,
        max_llm_calls=int(os.getenv("NEWS_LLM_MAX_PER_RUN", "60")) if llm_key else None,
        llm_min_interval=float(os.getenv("NEWS_LLM_MIN_INTERVAL_SECONDS", "4.5")),
    )


if __name__ == "__main__":
    main()
