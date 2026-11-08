"""News items table (moved out of app/news.py lazy creation).

Idempotent, so it is a no-op where the old code already created the table.

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

STATEMENTS = [
    """CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      lang TEXT NOT NULL,
      outlet TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL DEFAULT 'OTHER',
      published_at TIMESTAMPTZ NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_event BOOLEAN NOT NULL DEFAULT FALSE,
      location_text TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      place_id TEXT,
      location_precision TEXT,
      event_start TIMESTAMPTZ,
      event_end TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'unknown',
      relevant BOOLEAN NOT NULL DEFAULT TRUE
    )""",
    "ALTER TABLE news_items ADD COLUMN IF NOT EXISTS relevant BOOLEAN NOT NULL DEFAULT TRUE",
    "CREATE INDEX IF NOT EXISTS news_items_lang_published ON news_items (lang, published_at DESC)",
]


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    raise RuntimeError("news_items holds live data; restore from backup instead")
