"""Optional PostgreSQL repository for normalized structured measurements.

The schema is owned by Alembic (``migrations/``); nothing here creates tables.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime

from .models import Measurement


def publish_measurements(measurements: Iterable[Measurement], dsn: str) -> int:
    """Upsert normalized observations and return the number published."""
    rows = list(measurements)
    import psycopg

    try:
        with psycopg.connect(dsn) as connection:
            for item in rows:
                connection.execute(
                    """INSERT INTO measurements
                    (station_id, station_name, district, observed_at, pollutant,
                    concentration, concentration_unit, ispu_value, ispu_category, source,
                    averaging_period, quality_flag, fetched_at)
                    VALUES (%(station_id)s, %(station_name)s, %(district)s, %(observed_at)s,
                            %(pollutant)s, %(concentration)s, %(concentration_unit)s,
                        %(ispu_value)s, %(ispu_category)s, %(source)s,
                        %(averaging_period)s, %(quality_flag)s, %(fetched_at)s)
                    ON CONFLICT (station_id, observed_at, pollutant) DO UPDATE SET
                      station_name = EXCLUDED.station_name,
                      district = EXCLUDED.district,
                      concentration = EXCLUDED.concentration,
                      concentration_unit = EXCLUDED.concentration_unit,
                  ispu_value = EXCLUDED.ispu_value,
                  ispu_category = EXCLUDED.ispu_category,
                  source = EXCLUDED.source,
                  averaging_period = EXCLUDED.averaging_period,
                  quality_flag = EXCLUDED.quality_flag,
                  fetched_at = EXCLUDED.fetched_at""",
                    item.__dict__,
                )
            connection.commit()
    except psycopg.Error as exc:
        raise RuntimeError("could not publish measurements to PostgreSQL") from exc
    return len(rows)


def load_measurements_from_db(dsn: str) -> list[Measurement]:
    """Read observations from PostgreSQL; callers should provide a CSV fallback."""
    import psycopg

    try:
        with psycopg.connect(dsn) as connection:
            rows = connection.execute(
                """SELECT station_id, station_name, district, observed_at, pollutant,
                          concentration, concentration_unit, ispu_value, ispu_category, source,
                          averaging_period, quality_flag, fetched_at
                   FROM measurements ORDER BY observed_at DESC"""
            ).fetchall()
    except psycopg.Error as exc:
        raise RuntimeError("could not read measurements from PostgreSQL") from exc
    return [
        Measurement(
            station_id=row[0],
            station_name=row[1],
            district=row[2],
            observed_at=row[3] if isinstance(row[3], datetime) else datetime.fromisoformat(row[3]),
            pollutant=row[4],
            concentration=float(row[5]) if row[5] is not None else None,
            concentration_unit=row[6],
            ispu_value=int(row[7]),
            ispu_category=row[8],
            source=row[9],
            averaging_period=row[10],
            quality_flag=row[11],
            fetched_at=row[12],
        )
        for row in rows
    ]


def record_ingestion_run(report: dict, dsn: str) -> None:
    """Persist a completed station-ingestion fact for runtime provenance."""
    import psycopg

    try:
        with psycopg.connect(dsn) as connection:
            connection.execute(
                """INSERT INTO ingestion_runs
                (finished_at, source_url, source_status, measurement_rows, source_error)
                VALUES (%(finished_at)s, %(source_url)s, %(source_status)s,
                        %(measurement_rows)s, %(source_error)s)""",
                {
                    "finished_at": report["fetched_at"],
                    "source_url": report.get("source"),
                    "source_status": report["source_status"],
                    "measurement_rows": report["measurements"],
                    "source_error": report.get("source_error"),
                },
            )
            connection.commit()
    except psycopg.Error as exc:
        raise RuntimeError("could not record ingestion run in PostgreSQL") from exc


def load_latest_ingestion_run(dsn: str) -> dict | None:
    """Load the newest completed ingestion fact without exposing credentials."""
    import psycopg

    try:
        with psycopg.connect(dsn) as connection:
            row = connection.execute(
                """SELECT finished_at, source_url, source_status, measurement_rows, source_error
                   FROM ingestion_runs ORDER BY finished_at DESC LIMIT 1"""
            ).fetchone()
    except psycopg.Error as exc:
        raise RuntimeError("could not read ingestion provenance from PostgreSQL") from exc
    if row is None:
        return None
    finished_at = row[0].isoformat() if isinstance(row[0], datetime) else str(row[0])
    return {
        "finished_at": finished_at,
        "source_url": row[1],
        "source_status": row[2],
        "measurement_rows": int(row[3]),
        "source_error": row[4],
    }


def publish_historical_city(rows: Iterable[dict], dsn: str) -> int:
    """Upsert the city-level historical series used by the trends page."""
    values = list(rows)
    import psycopg

    def numeric(value: object) -> float | None:
        if value in (None, ""):
            return None
        return float(value)

    try:
        with psycopg.connect(dsn) as connection:
            for row in values:
                observed_date = row.get("date")
                if isinstance(observed_date, datetime):
                    observed_date = observed_date.date()
                if isinstance(observed_date, str):
                    observed_date = date.fromisoformat(observed_date)
                connection.execute(
                    """INSERT INTO historical_city_air_quality
                    (observed_date, pm10, pm2_5, us_aqi, source, refreshed_at)
                    VALUES (%(observed_date)s, %(pm10)s, %(pm2_5)s, %(us_aqi)s,
                            %(source)s, now())
                    ON CONFLICT (observed_date) DO UPDATE SET
                      pm10 = EXCLUDED.pm10,
                      pm2_5 = EXCLUDED.pm2_5,
                      us_aqi = EXCLUDED.us_aqi,
                      source = EXCLUDED.source,
                      refreshed_at = now()""",
                    {
                        "observed_date": observed_date,
                        "pm10": numeric(row.get("pm10")),
                        "pm2_5": numeric(row.get("pm2_5")),
                        "us_aqi": numeric(row.get("us_aqi")),
                        "source": row.get("source") or "Open-Meteo CAMS city series",
                    },
                )
            connection.commit()
    except psycopg.Error as exc:
        raise RuntimeError("could not publish historical city series to PostgreSQL") from exc
    return len(values)


def load_historical_city_from_db(dsn: str) -> list[dict]:
    """Load the durable city series, returning the same shape as the CSV loader."""
    import psycopg

    try:
        with psycopg.connect(dsn) as connection:
            rows = connection.execute(
                """SELECT observed_date, pm10, pm2_5, us_aqi, source
                   FROM historical_city_air_quality ORDER BY observed_date"""
            ).fetchall()
    except psycopg.Error as exc:
        raise RuntimeError("could not read historical city series from PostgreSQL") from exc
    return [
        {
            "date": row[0] if isinstance(row[0], date) else date.fromisoformat(str(row[0])),
            "pm10": float(row[1]) if row[1] is not None else None,
            "pm2_5": float(row[2]) if row[2] is not None else None,
            "pm25_available": row[2] is not None,
            "pm10_available": row[1] is not None,
            "us_aqi": float(row[3]) if row[3] is not None else None,
            "source": row[4] or "Open-Meteo CAMS city series",
        }
        for row in rows
    ]
