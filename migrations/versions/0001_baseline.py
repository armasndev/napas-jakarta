"""Baseline schema.

Every statement is idempotent so this is a no-op on databases that were
created by the earlier lazy-create code (production, dev, Compose volumes).

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

STATEMENTS = [
    """CREATE TABLE IF NOT EXISTS interactions (
      id TEXT PRIMARY KEY,
      interaction_id TEXT,
      session_id TEXT,
      created_at TEXT NOT NULL,
      event TEXT NOT NULL DEFAULT 'answer',
      question TEXT NOT NULL,
      answer_text TEXT,
      rewritten_query TEXT,
      route TEXT,
      retrieval_mode TEXT,
      citation_grounded BOOLEAN,
      prompt_version TEXT,
      latency_ms DOUBLE PRECISION,
      token_usage INTEGER,
      estimated_cost DOUBLE PRECISION,
      data_age_seconds DOUBLE PRECISION,
      error_type TEXT,
      abstention_type TEXT,
      feedback TEXT,
      feedback_comment TEXT,
      source TEXT NOT NULL DEFAULT 'live'
    )""",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS session_id TEXT",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS interaction_id TEXT",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS answer_text TEXT",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS feedback_comment TEXT",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS conversation_turn INTEGER",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS history_messages INTEGER",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS history_summary_chars INTEGER",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS provider_model TEXT",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS carried_entities TEXT",
    "ALTER TABLE interactions ADD COLUMN IF NOT EXISTS source_count INTEGER",
    """CREATE TABLE IF NOT EXISTS measurements (
      station_id TEXT NOT NULL,
      station_name TEXT NOT NULL,
      district TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      pollutant TEXT NOT NULL,
      concentration DOUBLE PRECISION,
      concentration_unit TEXT NOT NULL,
      ispu_value INTEGER NOT NULL,
      ispu_category TEXT NOT NULL,
      source TEXT NOT NULL,
      averaging_period TEXT,
      quality_flag TEXT,
      fetched_at TIMESTAMPTZ,
      PRIMARY KEY (station_id, observed_at, pollutant)
    )""",
    "ALTER TABLE measurements ADD COLUMN IF NOT EXISTS averaging_period TEXT",
    "ALTER TABLE measurements ADD COLUMN IF NOT EXISTS quality_flag TEXT",
    "ALTER TABLE measurements ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ",
    """CREATE TABLE IF NOT EXISTS historical_city_air_quality (
      observed_date DATE PRIMARY KEY,
      pm10 DOUBLE PRECISION,
      pm2_5 DOUBLE PRECISION,
      us_aqi DOUBLE PRECISION,
      source TEXT NOT NULL,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS ingestion_runs (
      id BIGSERIAL PRIMARY KEY,
      finished_at TIMESTAMPTZ NOT NULL,
      source_url TEXT,
      source_status TEXT NOT NULL,
      measurement_rows INTEGER NOT NULL,
      source_error TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS ingestion_runs_finished_at_idx "
    "ON ingestion_runs (finished_at DESC)",
]


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    raise RuntimeError("the baseline holds live data; restore from backup instead")
