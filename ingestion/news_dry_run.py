"""Try the news job on the live feeds without touching the database.

    NEWS_LLM_API_KEY=... [GOOGLE_MAPS_API_KEY=...] python -m ingestion.news_dry_run [--max-llm 15]

Fetches the active sources in data/news_sources.json, runs the real model call (and geocoder if
a key is set), and prints what would be stored. Nothing is written. Keys come from the environment.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path

from .envfile import load_env_file
from .news import (
    fetch_bytes,
    load_relevance,
    load_sources,
    make_gemini_extractor,
    make_geocoder,
    run_news_job,
)


def _as_dt(value: object) -> datetime:
    return value if isinstance(value, datetime) else datetime.fromisoformat(str(value))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-llm", type=int, default=15, help="model calls to spend on this trial")
    parser.add_argument("--save", help="write the kept stories to this file; point NEWS_DEMO_FILE at it to see them in the app")
    parser.add_argument("--show", type=int, default=12, help="items to print")
    args = parser.parse_args()
    load_env_file()

    sources = load_sources(os.getenv("NEWS_SOURCES_FILE", Path("data") / "news_sources.json"))
    if not sources:
        raise SystemExit("No active sources with checked terms in data/news_sources.json.")
    llm_key = os.getenv("NEWS_LLM_API_KEY", "").strip()
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    model = os.getenv("NEWS_LLM_MODEL", "gemini-3.5-flash-lite").strip()
    stored: list[dict] = []
    summary = run_news_job(
        sources,
        fetch=lambda url, domains: fetch_bytes(url, domains),
        extract=make_gemini_extractor(llm_key, model) if llm_key else None,
        geocode=make_geocoder(maps_key) if maps_key else None,
        known_ids=set,
        publish=lambda items: stored.extend(items) or len(items),
        purge=lambda: 0,
        relevant=load_relevance(os.getenv("NEWS_KEYWORDS_FILE", Path("data") / "news_keywords.json")).matches,
        max_llm_calls=args.max_llm if llm_key else None,
        llm_min_interval=float(os.getenv("NEWS_LLM_MIN_INTERVAL_SECONDS", "4.5")),
    )
    print(json.dumps({"model": model if llm_key else None, "geocoder": bool(maps_key), **summary}, indent=2))
    if args.save:
        now = datetime.now(UTC)
        keep = []
        for item in stored:
            if not item["relevant"]:
                continue
            row = {k: v for k, v in item.items() if k != "published_at"}
            row.update(demo=False, minutes_ago=max(1, int((now - _as_dt(item["published_at"])).total_seconds() // 60)))
            keep.append({k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in row.items()})
        Path(args.save).write_text(json.dumps(keep, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"saved {len(keep)} stories to {args.save}")
    for item in stored[: args.show]:
        place = item["location_text"] if item["is_event"] else "-"
        keep = "keep" if item["relevant"] else "DROP"
        print(f"{keep} [{item['lang']}] {item['topic']:<11} event={item['is_event']!s:<5} {place:<24} {item['title'][:88]}")


if __name__ == "__main__":
    main()
