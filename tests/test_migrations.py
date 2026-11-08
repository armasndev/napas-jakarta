"""Applies the Alembic migrations to a real PostgreSQL; skipped unless MIGRATION_TEST_DSN is set.

CI provides a throwaway database. Locally, point it at any empty scratch database.
"""

import os
import subprocess
import sys

import pytest

DSN = os.getenv("MIGRATION_TEST_DSN", "")
pytestmark = pytest.mark.skipif(not DSN, reason="MIGRATION_TEST_DSN not set")

REQUIRED_TABLES = {
    "interactions",
    "measurements",
    "historical_city_air_quality",
    "ingestion_runs",
    "news_items",
}


def upgrade() -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=True,
        env={**os.environ, "POSTGRES_DSN": DSN},
    )


def test_migrations_build_the_schema_and_are_repeatable():
    import psycopg
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    upgrade()
    upgrade()  # a second run must be a safe no-op
    head = ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()
    with psycopg.connect(DSN) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()"
            )
        }
        version = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert REQUIRED_TABLES <= tables
    assert version == head
