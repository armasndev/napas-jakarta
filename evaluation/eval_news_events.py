"""Evaluate the news job's one LLM call (event gate, topic, place) on labelled headlines.

    NEWS_LLM_API_KEY=... python -m evaluation.eval_news_events [--model gemini-3.5-flash-lite]

The cases in evaluation/news_events/cases.jsonl are synthetic (written for this test, not real
articles). Recall on `is_event` matters most: a missed event is invisible. Pass an extractor with
the same signature as ingestion.news.make_gemini_extractor to score a different model.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ingestion.envfile import load_env_file
from ingestion.news import make_gemini_extractor, validate_extraction

CASES = Path(__file__).parent / "news_events" / "cases.jsonl"


def load_cases(path: Path = CASES) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def score(cases: list[dict[str, Any]], predictions: list[dict[str, Any]]) -> dict[str, Any]:
    """Compare validated predictions with labels, overall and per language."""

    def block(rows: list[tuple[dict[str, Any], dict[str, Any]]]) -> dict[str, float | int]:
        tp = sum(1 for c, p in rows if c["is_event"] and p["is_event"])
        fp = sum(1 for c, p in rows if not c["is_event"] and p["is_event"])
        fn = sum(1 for c, p in rows if c["is_event"] and not p["is_event"])
        rel_tp = sum(1 for c, p in rows if c.get("relevant", True) and p.get("relevant", True))
        rel_fp = sum(1 for c, p in rows if not c.get("relevant", True) and p.get("relevant", True))
        rel_fn = sum(1 for c, p in rows if c.get("relevant", True) and not p.get("relevant", True))
        located = [(c, p) for c, p in rows if c["is_event"] and p["is_event"]]
        place_ok = sum(
            1 for c, p in located
            if c["place_contains"] and c["place_contains"].lower() in (p["location_text"] or "").lower()
        )
        return {
            "n": len(rows),
            "relevance_recall": round(rel_tp / (rel_tp + rel_fn), 3) if rel_tp + rel_fn else 1.0,
            "relevance_precision": round(rel_tp / (rel_tp + rel_fp), 3) if rel_tp + rel_fp else 1.0,
            "event_recall": round(tp / (tp + fn), 3) if tp + fn else 1.0,
            "event_precision": round(tp / (tp + fp), 3) if tp + fp else 1.0,
            "place_match": round(place_ok / len(located), 3) if located else 0.0,
            "topic_accuracy": round(sum(1 for c, p in rows if c["topic"] == p["topic"]) / len(rows), 3),
        }

    pairs = list(zip(cases, predictions, strict=True))
    result = {"all": block(pairs)}
    for lang in sorted({c["lang"] for c in cases}):
        result[lang] = block([(c, p) for c, p in pairs if c["lang"] == lang])
    return result


def run(extract: Callable[[dict[str, Any]], dict[str, Any]], cases: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    cases = cases if cases is not None else load_cases()
    now = datetime.now(UTC)
    predictions = []
    for case in cases:
        item = {"title": case["title"], "excerpt": case["excerpt"], "lang": case["lang"]}
        try:
            raw = extract(item)
        except Exception:  # noqa: BLE001 - a failed call counts as "no event"
            raw = None
        predictions.append(validate_extraction(raw, item, now))
    return score(cases, predictions)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=os.getenv("NEWS_LLM_MODEL", "gemini-3.5-flash-lite"))
    args = parser.parse_args()
    load_env_file()
    key = os.getenv("NEWS_LLM_API_KEY", "").strip()
    if not key:
        raise SystemExit("Set NEWS_LLM_API_KEY to run the model evaluation.")
    extract = make_gemini_extractor(key, args.model)

    def throttled(item: dict[str, Any]) -> dict[str, Any]:
        time.sleep(float(os.getenv("NEWS_LLM_MIN_INTERVAL_SECONDS", "4.5")))  # stay under the free-tier rate limit
        return extract(item)

    print(json.dumps({"model": args.model, **run(throttled)}, indent=2))


if __name__ == "__main__":
    main()
