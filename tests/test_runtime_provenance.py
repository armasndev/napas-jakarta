import sys
import types

from app.db import load_latest_ingestion_run, record_ingestion_run
from monitoring.logging import interaction_retention_days


def test_ingestion_run_round_trip_contract(monkeypatch):
    calls = []

    class Connection:
        def execute(self, query, values=None):
            calls.append((query, values))
            if "SELECT finished_at" in query:
                return types.SimpleNamespace(
                    fetchone=lambda: (
                        "2026-09-08T00:00:00+00:00",
                        "https://udara.jakarta.go.id/",
                        "live",
                        398,
                        None,
                    )
                )
            return types.SimpleNamespace()

        def commit(self):
            calls.append(("commit", None))

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

    fake_psycopg = types.SimpleNamespace(connect=lambda _: Connection(), Error=Exception)
    monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)
    report = {
        "fetched_at": "2026-09-08T00:00:00+00:00",
        "source": "https://udara.jakarta.go.id/",
        "source_status": "live",
        "measurements": 398,
        "source_error": None,
    }
    record_ingestion_run(report, "postgresql://example")
    latest = load_latest_ingestion_run("postgresql://example")
    assert any(
        "INSERT INTO ingestion_runs" in query for query, _ in calls if isinstance(query, str)
    )
    assert latest == {
        "finished_at": "2026-09-08T00:00:00+00:00",
        "source_url": "https://udara.jakarta.go.id/",
        "source_status": "live",
        "measurement_rows": 398,
        "source_error": None,
    }


def test_interaction_retention_is_bounded_and_safe_without_a_database():
    assert interaction_retention_days("bad") == 30
    assert interaction_retention_days(0) == 1
    assert interaction_retention_days(9_999) == 3650
