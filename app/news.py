"""News items, reported events and the curated timeline.

News is event context, never air-quality evidence: it lives in its own table and
is never added to the guidance corpus (see docs/redesign-spec.md, 5d). With no
database configured the store serves a clearly marked demo fixture so the UI can
be reviewed locally. The table is created by Alembic (``migrations/``).
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock
from time import monotonic
from typing import Any

from .retrieval import tokenize

EVENT_WINDOW_HOURS = 12
RETENTION_DAYS = 30
RESOLVED_TEXT_LIMIT = 1_200
RESOLVED_TOTAL_LIMIT = 4_800
MAX_REFS = 4
LANGUAGES = {"en", "id"}
TOPICS = {"PROTEST", "TRAFFIC", "POLICY", "HEALTH", "ENVIRONMENT", "OTHER"}

_COLUMNS = (
    "id", "lang", "outlet", "source", "title", "url", "excerpt", "topic", "published_at",
    "is_event", "location_text", "lat", "lng", "place_id", "location_precision",
    "event_start", "event_end", "status", "relevant",
)
_TIME_FIELDS = ("published_at", "event_start", "event_end")


def _now() -> datetime:
    return datetime.now(UTC)


def _parse_time(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _iso(value: datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat() if value else None


def _public(row: dict[str, Any]) -> dict[str, Any]:
    out = {key: row.get(key) for key in _COLUMNS if key not in {"location_precision", "relevant"}}
    out["precision"] = row.get("location_precision")
    for key in _TIME_FIELDS:
        out[key] = _iso(_parse_time(row.get(key)))
    out["demo"] = bool(row.get("demo"))
    return out


# --- Postgres -------------------------------------------------------------


def upsert_news(items: list[dict[str, Any]], dsn: str) -> int:
    import psycopg

    placeholders = ", ".join(f"%({c})s" for c in _COLUMNS)
    updates = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in _COLUMNS if c not in {"id", "url"}
    )
    sql = (
        f"INSERT INTO news_items ({', '.join(_COLUMNS)}) VALUES ({placeholders}) "
        f"ON CONFLICT (url) DO UPDATE SET {updates}"
    )
    try:
        with psycopg.connect(dsn) as connection:
            for item in items:
                values = {c: item.get(c) for c in _COLUMNS}
                values["relevant"] = True if values["relevant"] is None else values["relevant"]
                connection.execute(sql, values)
            connection.commit()
    except psycopg.Error as exc:
        raise RuntimeError("could not publish news items to PostgreSQL") from exc
    return len(items)


def purge_news(dsn: str, days: int = RETENTION_DAYS) -> int:
    import psycopg

    cutoff = _now() - timedelta(days=days)
    try:
        with psycopg.connect(dsn) as connection:
            result = connection.execute("DELETE FROM news_items WHERE published_at < %s", (cutoff,))
            connection.commit()
            return max(0, int(result.rowcount or 0))
    except psycopg.Error as exc:
        raise RuntimeError("could not apply news retention cleanup") from exc


def known_news_ids(dsn: str) -> set[str]:
    import psycopg

    try:
        with psycopg.connect(dsn) as connection:
            rows = connection.execute("SELECT id FROM news_items").fetchall()
    except psycopg.Error as exc:
        raise RuntimeError("could not read known news ids from PostgreSQL") from exc
    return {row[0] for row in rows}


def load_news(dsn: str) -> list[dict[str, Any]]:
    import psycopg

    try:
        with psycopg.connect(dsn) as connection:
            rows = connection.execute(
                f"SELECT {', '.join(_COLUMNS)} FROM news_items WHERE relevant ORDER BY published_at DESC LIMIT 500"
            ).fetchall()
    except psycopg.Error as exc:
        raise RuntimeError("could not read news items from PostgreSQL") from exc
    return [dict(zip(_COLUMNS, row, strict=True)) for row in rows]


# --- Store ----------------------------------------------------------------


class NewsStore:
    """Read news from Postgres when configured, else from the demo fixture."""

    def __init__(self, dsn: str, demo_path: str | Path, ttl_seconds: float = 60.0) -> None:
        self.dsn = dsn.strip()
        self.demo_path = Path(demo_path)
        self.ttl_seconds = ttl_seconds
        self._lock = RLock()
        self._rows: list[dict[str, Any]] = []
        self._checked = 0.0
        self.source_mode = "demo"
        self.last_error: str | None = None

    def _load_demo(self) -> list[dict[str, Any]]:
        try:
            raw = json.loads(self.demo_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        now = _now()
        rows = []
        for entry in raw:
            row = dict(entry)
            row["published_at"] = _iso(now - timedelta(minutes=int(entry.get("minutes_ago", 60))))
            row["demo"] = bool(entry.get("demo", True))  # a local preview file may mark real stories demo:false
            rows.append(row)
        return rows

    def rows(self, force: bool = False) -> list[dict[str, Any]]:
        with self._lock:
            fresh = monotonic() - self._checked < self.ttl_seconds
            if self._rows and fresh and not force:
                return self._rows
            self._checked = monotonic()
            if self.dsn:
                try:
                    live = load_news(self.dsn)
                    self.last_error = None
                    if live:
                        self._rows, self.source_mode = live, "live"
                        return self._rows
                except RuntimeError as exc:
                    self.last_error = str(exc)
            self._rows, self.source_mode = self._load_demo(), "demo"
            return self._rows

    def list_items(
        self, lang: str, topic: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        rows = [r for r in self.rows() if r.get("lang") == lang]
        if topic:
            rows = [r for r in rows if r.get("topic") == topic.upper()]
        rows.sort(key=lambda r: _parse_time(r.get("published_at")) or _now(), reverse=True)
        return [_public(r) for r in rows[: max(1, min(limit, 100))]]

    def get(self, item_id: str) -> dict[str, Any] | None:
        return next((_public(r) for r in self.rows() if r.get("id") == item_id), None)

    def search(self, query: str, lang: str, limit: int = 5) -> list[dict[str, Any]]:
        terms = set(tokenize(query))
        if not terms:
            return []
        scored = []
        for row in self.rows():
            if row.get("lang") != lang:
                continue
            text = set(tokenize(f"{row.get('title', '')} {row.get('excerpt', '')}"))
            score = len(terms & text) / len(terms)
            if score > 0:
                scored.append((score, row))
        scored.sort(
            key=lambda pair: (pair[0], _parse_time(pair[1].get("published_at")) or _now()),
            reverse=True,
        )
        return [dict(_public(r), score=round(s, 3)) for s, r in scored[: max(1, min(limit, 10))]]

    def events(self, lang: str, now: datetime | None = None) -> list[dict[str, Any]]:
        return cluster_events(self.rows(), lang, now or _now())


def _event_visible(row: dict[str, Any], now: datetime) -> bool:
    if row.get("status") == "over":
        return False
    end = _parse_time(row.get("event_end"))
    if end:
        return end > now
    published = _parse_time(row.get("published_at"))
    return bool(published and published > now - timedelta(hours=EVENT_WINDOW_HOURS))


def cluster_events(rows: list[dict[str, Any]], lang: str, now: datetime) -> list[dict[str, Any]]:
    """Merge reports of one event: same topic, same place, within the window.

    Conservative on purpose: two pins are safer than one wrong merge.
    """
    candidates = [
        r for r in rows
        if r.get("lang") == lang and r.get("is_event")
        and r.get("lat") is not None and r.get("lng") is not None and _event_visible(r, now)
    ]
    groups: dict[tuple, list[dict[str, Any]]] = defaultdict(list)
    for row in candidates:
        place = row.get("place_id") or (round(float(row["lat"]), 2), round(float(row["lng"]), 2))
        groups[(row.get("topic"), place)].append(row)

    pins: list[dict[str, Any]] = []
    window = timedelta(hours=EVENT_WINDOW_HOURS)
    for members in groups.values():
        members.sort(key=lambda r: _parse_time(r.get("published_at")) or now)
        cluster = [members[0]]
        for row in members[1:]:
            gap = (_parse_time(row.get("published_at")) or now) - (
                _parse_time(cluster[-1].get("published_at")) or now
            )
            if gap <= window:
                cluster.append(row)
            else:
                pins.append(_pin(cluster))
                cluster = [row]
        pins.append(_pin(cluster))
    pins.sort(key=lambda p: p["published_at"] or "", reverse=True)
    return pins


def _pin(cluster: list[dict[str, Any]]) -> dict[str, Any]:
    newest = cluster[-1]
    statuses = {r.get("status") for r in cluster if r.get("status") not in (None, "unknown")}
    starts = {_iso(_parse_time(r.get("event_start"))) for r in cluster if r.get("event_start")}
    ends = {_iso(_parse_time(r.get("event_end"))) for r in cluster if r.get("event_end")}
    return {
        "id": newest["id"],
        "title": newest["title"],
        "topic": newest.get("topic"),
        "lat": newest["lat"],
        "lng": newest["lng"],
        "location_text": newest.get("location_text"),
        "precision": newest.get("location_precision"),
        "status": next(iter(statuses)) if len(statuses) == 1 else "unknown",
        "event_start": next(iter(starts)) if len(starts) == 1 else None,
        "event_end": next(iter(ends)) if len(ends) == 1 else None,
        "published_at": _iso(_parse_time(newest.get("published_at"))),
        "reports": len(cluster),
        "outlets": sorted({r.get("outlet", "") for r in cluster}),
        "article_ids": [r["id"] for r in cluster],
        "demo": all(bool(r.get("demo")) for r in cluster),
    }


# --- Chip resolution ------------------------------------------------------


def resolve_refs(
    refs: list[dict[str, str]],
    store: NewsStore,
    lang: str,
    stations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Turn typed chip refs into bounded, stored records. Unknown ids become unavailable."""
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    budget = RESOLVED_TOTAL_LIMIT
    for ref in refs[:MAX_REFS]:
        kind, ref_id = ref.get("kind", ""), ref.get("id", "")
        if (kind, ref_id) in seen:
            continue
        seen.add((kind, ref_id))
        record = _resolve_one(kind, ref_id, store, lang, stations)
        text = (record.get("text") or "")[: min(RESOLVED_TEXT_LIMIT, budget)]
        record["text"] = text
        budget -= len(text)
        out.append(record)
    return out


def _resolve_one(
    kind: str, ref_id: str, store: NewsStore, lang: str, stations: list[dict[str, Any]]
) -> dict[str, Any]:
    gone = {"kind": kind, "id": ref_id, "available": False, "title": "", "sub": "", "text": ""}
    if kind in {"article", "event"}:
        item = store.get(ref_id)
        if not item or item["lang"] != lang or (kind == "event" and not item["is_event"]):
            return gone
        pins = {a: p for p in store.events(lang) for a in p["article_ids"]}
        pin = pins.get(ref_id)
        text = f"{item['outlet']}, {item['published_at']}. {item['excerpt']}"
        if kind == "event":
            reports = pin["reports"] if pin else 1
            text = (
                f"Reported event ({reports} report{'s' if reports != 1 else ''}, unverified). "
                f"Place from article text: {item['location_text']}. "
                f"Event time: {item['event_start'] or 'not stated'}. "
                f"Status: {item['status']}. {text}"
            )
        return {
            "kind": kind, "id": ref_id, "available": True, "title": item["title"],
            "sub": f"{item['outlet']} · {item['published_at']}", "text": text,
            "url": item["url"], "demo": item["demo"],
        }
    if kind == "station":
        row = next((s for s in stations if s.get("id") == ref_id), None)
        if not row:
            return gone
        text = (
            f"Station observation: {row.get('name')} ({row.get('district')}), "
            f"category {row.get('category')}, ISPU {row.get('ispu')}, PM2.5 {row.get('pm25')}, "
            f"observed {row.get('observed_at')}, source {row.get('source')}."
        )
        return {
            "kind": kind, "id": ref_id, "available": True, "title": str(row.get("name")),
            "sub": f"{row.get('category')} · {row.get('observed_at')}", "text": text,
        }
    return gone


# --- Curated timeline -----------------------------------------------------


def load_timeline(path: str | Path) -> list[dict[str, Any]]:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    entries = []
    for entry in raw if isinstance(raw, list) else []:
        if isinstance(entry, dict) and entry.get("id") and entry.get("date") and entry.get("title_en"):
            entries.append(entry)
    entries.sort(key=lambda e: str(e["date"]), reverse=True)
    return entries


def query_timeline(
    entries: list[dict[str, Any]],
    lang: str,
    category: str | None = None,
    text: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    terms = set(tokenize(text or ""))
    results = []
    for entry in entries:
        if category and str(entry.get("category", "")).lower() != category.lower():
            continue
        if start and str(entry["date"]) < start:
            continue
        if end and str(entry["date"]) > end:
            continue
        title = entry.get("title_id") if lang == "id" and entry.get("title_id") else entry["title_en"]
        summary = (
            entry.get("summary_id") if lang == "id" and entry.get("summary_id")
            else entry.get("summary_en", "")
        )
        if terms and not terms & set(tokenize(f"{title} {summary}")):
            continue
        results.append({
            "id": entry["id"], "date": entry["date"], "category": entry.get("category"),
            "title": title, "summary": summary, "sources": entry.get("sources", []),
            "place": entry.get("place"), "demo": bool(entry.get("demo")),
        })
    return results[: max(1, min(limit, 50))]
