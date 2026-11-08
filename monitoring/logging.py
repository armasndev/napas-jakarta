from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock
from time import monotonic
from typing import Any

_JSONL_LOCK = RLock()
_LAST_JSONL_CLEANUP: dict[Path, float] = {}


def interaction_retention_days(value: object | None = None) -> int:
    """Return a bounded retention window for private interaction content."""
    raw = value if value is not None else os.getenv("INTERACTION_RETENTION_DAYS", "30")
    try:
        days = int(str(raw))
    except (TypeError, ValueError):
        days = 30
    return max(1, min(days, 3650))


def cleanup_expired_interactions(dsn: str, retention_days: int | None = None) -> int:
    """Remove old private interaction and feedback rows from the active store.

    The deletion is constrained to the interactions table or JSONL file and
    uses a bounded, explicit retention value. The scheduled ingestion service
    invokes it rather than a request serving a resident.
    """
    configured_dsn = dsn.strip()
    if not configured_dsn:
        return cleanup_expired_jsonl(_monitoring_path(), retention_days)
    days = interaction_retention_days(retention_days)
    cutoff = datetime.now(UTC) - timedelta(days=days)
    import psycopg

    try:
        with psycopg.connect(configured_dsn) as connection:
            # Earlier deployments store ISO-8601 timestamps as text, so parse
            # before comparing to the explicit UTC cutoff.
            result = connection.execute(
                "DELETE FROM interactions WHERE created_at::timestamptz < %s", (cutoff,)
            )
            connection.commit()
            return max(0, int(result.rowcount or 0))
    except psycopg.Error as exc:
        raise RuntimeError("could not apply interaction retention cleanup") from exc


def _monitoring_path() -> Path:
    return Path(os.getenv("MONITORING_DB", "monitoring/interactions.jsonl"))


def _created_at(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def cleanup_expired_jsonl(
    path: str | Path, retention_days: int | None = None, now: datetime | None = None
) -> int:
    """Atomically remove expired JSONL records while preserving malformed lines."""
    target = Path(path)
    if not target.exists():
        return 0
    cutoff = (now or datetime.now(UTC)) - timedelta(days=interaction_retention_days(retention_days))
    temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    removed = 0
    with _JSONL_LOCK:
        try:
            with target.open("r", encoding="utf-8") as source, temporary.open(
                "w", encoding="utf-8"
            ) as destination:
                for line in source:
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError:
                        destination.write(line)
                        continue
                    created_at = _created_at(record.get("created_at")) if isinstance(record, dict) else None
                    if created_at is not None and created_at < cutoff:
                        removed += 1
                        continue
                    destination.write(line)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
    return removed


def _maybe_cleanup_jsonl(path: Path) -> None:
    raw_interval = os.getenv("INTERACTION_CLEANUP_INTERVAL_SECONDS", "3600")
    try:
        interval = max(0.0, float(raw_interval))
    except ValueError:
        interval = 3600.0
    current = monotonic()
    last = _LAST_JSONL_CLEANUP.get(path, 0.0)
    if current - last < interval:
        return
    cleanup_expired_jsonl(path, interaction_retention_days())
    # Only mark a successful cleanup. A transient filesystem failure should
    # be retried by the next telemetry write instead of being hidden for an
    # entire interval.
    _LAST_JSONL_CLEANUP[path] = current


def log_interaction(payload: dict[str, Any]) -> str:
    interaction_id = str(uuid.uuid4())
    record = {
        "id": interaction_id,
        "interaction_id": payload.get("interaction_id", interaction_id),
        "created_at": datetime.now(UTC).isoformat(),
        "source": "live",
        **payload,
    }
    dsn = os.getenv("POSTGRES_DSN", "").strip()
    if dsn:
        try:
            import psycopg

            with psycopg.connect(dsn) as connection:
                connection.execute(
                    """INSERT INTO interactions
                    (id, interaction_id, session_id, created_at, event, question, answer_text, rewritten_query, route,
                     retrieval_mode, citation_grounded, prompt_version, latency_ms,
                     token_usage, estimated_cost, data_age_seconds, error_type,
                     abstention_type, feedback, feedback_comment, source,
                     conversation_turn, history_messages, history_summary_chars, provider_model,
                     carried_entities, source_count)
                    VALUES (%(id)s, %(interaction_id)s, %(session_id)s, %(created_at)s, %(event)s,
                            %(question)s, %(answer_text)s, %(rewritten_query)s, %(route)s,
                            %(retrieval_mode)s, %(citation_grounded)s, %(prompt_version)s,
                            %(latency_ms)s, %(token_usage)s, %(estimated_cost)s,
                            %(data_age_seconds)s, %(error_type)s, %(abstention_type)s,
                            %(feedback)s, %(feedback_comment)s, %(source)s,
                            %(conversation_turn)s, %(history_messages)s,
                            %(history_summary_chars)s, %(provider_model)s,
                            %(carried_entities)s, %(source_count)s)
                    ON CONFLICT (id) DO NOTHING""",
                    {
                        **record,
                        "interaction_id": record.get("interaction_id"),
                        "session_id": record.get("session_id"),
                        "event": record.get("event", "answer"),
                        "question": record.get("question", ""),
                        "answer_text": record.get("answer_text"),
                        "rewritten_query": record.get("rewritten_query"),
                        "route": record.get("route"),
                        "retrieval_mode": record.get("retrieval_mode"),
                        "citation_grounded": record.get("citation_grounded"),
                        "prompt_version": record.get("prompt_version", "v1"),
                        "latency_ms": record.get("latency_ms"),
                        "token_usage": record.get("token_usage"),
                        "estimated_cost": record.get("estimated_cost"),
                        "data_age_seconds": record.get("data_age_seconds"),
                        "error_type": record.get("error_type"),
                        "abstention_type": record.get("abstention_type"),
                        "feedback": record.get("feedback"),
                        "feedback_comment": record.get("comment", record.get("feedback_comment")),
                        "conversation_turn": record.get("conversation_turn"),
                        "history_messages": record.get("history_messages"),
                        "history_summary_chars": record.get("history_summary_chars"),
                        "provider_model": record.get("provider_model"),
                        "carried_entities": record.get("carried_entities"),
                        "source_count": record.get("source_count"),
                    },
                )
                connection.commit()
                return interaction_id
        except (ImportError, OSError, RuntimeError):
            # A monitoring outage must not block an answer; retain the JSONL
            # fallback so local development remains observable.
            pass
        except psycopg.Error:
            # Schema migrations and inserts can fail on a transient database;
            # retain the JSONL fallback rather than failing the answer request.
            pass
    path = _monitoring_path()
    with _JSONL_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        _maybe_cleanup_jsonl(path)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return interaction_id


def log_feedback(
    interaction_id: str,
    feedback: str,
    comment: str = "",
    session_id: str | None = None,
) -> None:
    log_interaction(
        {
            "event": "feedback",
            "interaction_id": interaction_id,
            "session_id": session_id,
            "feedback": feedback,
            "comment": comment[:500],
        }
    )
