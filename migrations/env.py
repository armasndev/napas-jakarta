"""Alembic environment: connects with POSTGRES_DSN, the same variable the app uses."""

import os

from alembic import context
from sqlalchemy import create_engine, text

# Concurrent deploys (api and ingestion) must not race on alembic_version.
LOCK_ID = 727_001


def database_url() -> str:
    dsn = os.getenv("POSTGRES_DSN", "").strip()
    if not dsn:
        raise RuntimeError("POSTGRES_DSN is required to run migrations")
    for prefix in ("postgresql://", "postgres://"):
        if dsn.startswith(prefix):
            return "postgresql+psycopg://" + dsn[len(prefix) :]
    return dsn


with create_engine(database_url()).connect() as connection:
    connection.execute(text("SELECT pg_advisory_lock(:id)"), {"id": LOCK_ID})
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()
    connection.commit()
