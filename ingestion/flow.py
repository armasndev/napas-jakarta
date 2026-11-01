from __future__ import annotations

import csv
import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import requests

from app.data import load_documents, load_measurements
from app.models import Measurement

from .chunking import structure_chunks
from .corpus import build_corpus
from .official import fetch_measurements, fetch_stations
from .validation import validate_measurements


def measurement_fingerprint(measurements) -> str:
    """Fingerprint observations while excluding per-fetch metadata."""
    fields = (
        "station_id",
        "station_name",
        "district",
        "observed_at",
        "pollutant",
        "concentration",
        "concentration_unit",
        "ispu_value",
        "ispu_category",
        "source",
        "averaging_period",
        "quality_flag",
    )
    canonical = [
        {
            field: (
                getattr(item, field).isoformat()
                if hasattr(getattr(item, field), "isoformat")
                else getattr(item, field)
            )
            for field in fields
        }
        for item in sorted(
            measurements, key=lambda value: (value.station_id, value.observed_at, value.pollutant)
        )
    ]
    encoded = json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def merge_measurements(
    existing: list[Measurement], incoming: list[Measurement]
) -> list[Measurement]:
    """Append new snapshots while making repeated ingestion runs idempotent."""
    merged = {(item.station_id, item.observed_at, item.pollutant): item for item in existing}
    merged.update({(item.station_id, item.observed_at, item.pollutant): item for item in incoming})
    return sorted(
        merged.values(), key=lambda item: (item.observed_at, item.station_id, item.pollutant)
    )


def run_ingestion(data_dir: str | Path = "data") -> dict[str, int]:
    root = Path(data_dir)
    corpus_report = build_corpus(root)
    documents = load_documents(root / "docs")
    chunks = [chunk for document in documents for chunk in structure_chunks(document)]
    source_url = os.getenv("SOURCE_DATA_URL", "").strip()
    source_status = "committed-demo-snapshot"
    source_error = None
    if source_url:
        output = root / "processed" / "measurements.csv"
        try:
            measurements = fetch_measurements(source_url, raw_output=root / "raw")
            source_status = "live"
        except (requests.RequestException, UnicodeError, ValueError) as exc:
            source_error = f"{type(exc).__name__}: {exc}"
            # A cron outage must not erase or fabricate observations.  Prefer
            # the latest image/local snapshot, then the explicitly committed
            # demo snapshot as a documented last resort.
            fallback = output if output.exists() else root / "demo" / "measurements.csv"
            if not fallback.exists():
                raise RuntimeError(
                    "official source unavailable and no local measurement snapshot exists"
                ) from exc
            measurements = load_measurements(fallback)
            source_status = (
                "retained-local-snapshot" if fallback == output else "committed-demo-snapshot"
            )
        try:
            stations = fetch_stations(source_url)
        except (OSError, RuntimeError, ValueError, requests.RequestException):
            stations = []
        if stations:
            station_output = root / "processed" / "stations.csv"
            station_output.parent.mkdir(parents=True, exist_ok=True)
            with station_output.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=(
                        "station_id",
                        "station",
                        "district",
                        "latitude",
                        "longitude",
                        "source",
                    ),
                )
                writer.writeheader()
                writer.writerows(stations)
        existing = load_measurements(output) if output.exists() else []
        # Do not append fallback data to itself; normal live snapshots still
        # merge into the retained history as before.
        if source_status == "live":
            measurements = merge_measurements(existing, measurements)
        output.parent.mkdir(parents=True, exist_ok=True)
        fields = (
            "station_id",
            "station_name",
            "district",
            "observed_at",
            "pollutant",
            "concentration",
            "concentration_unit",
            "ispu_value",
            "ispu_category",
            "source",
            "averaging_period",
            "quality_flag",
            "fetched_at",
        )
        with output.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for item in measurements:
                writer.writerow(item.__dict__)
    else:
        measurements = load_measurements(root / "demo" / "measurements.csv")
    validation = validate_measurements(measurements)
    postgres_dsn = os.getenv("POSTGRES_DSN", "").strip()
    published_to_postgres = False
    if postgres_dsn:
        try:
            from app.db import publish_measurements

            publish_measurements(measurements, postgres_dsn)
            published_to_postgres = True
        except (ImportError, OSError, RuntimeError, ValueError) as exc:
            raise RuntimeError("PostgreSQL publication failed after validation") from exc
    qdrant_url = os.getenv("QDRANT_URL", "").strip()
    indexed_to_qdrant = False
    if qdrant_url:
        try:
            from .indexing import build_qdrant_hybrid_index

            build_qdrant_hybrid_index(chunks, qdrant_url)
            indexed_to_qdrant = True
        except (ImportError, OSError, RuntimeError, ValueError) as exc:
            raise RuntimeError("Qdrant indexing failed after validation") from exc
    report = {
        "fetched_at": datetime.now(UTC).isoformat(),
        "source": source_url or "committed-demo-snapshot",
        "source_status": source_status,
        "source_error": source_error,
        "documents": len(documents),
        "chunks": len(chunks),
        "measurements": len(measurements),
        "manifest_sources": corpus_report["manifest_sources"],
        "corpus_words": corpus_report["local_words"],
        "corpus_fingerprint": corpus_report["fingerprint"],
        "corpus_diagnostics": {
            "missing_local_documents_for_manifest": corpus_report[
                "missing_local_documents_for_manifest"
            ],
            "local_documents_not_in_manifest": corpus_report["local_documents_not_in_manifest"],
            "duplicate_manifest_checksums": corpus_report["duplicate_manifest_checksums"],
            "provenance_exceptions": corpus_report["provenance_exceptions"],
            "chunk_rejections": corpus_report["chunk_rejections"],
        },
        "document_sha256": hashlib.sha256(
            "".join(doc.text for doc in documents).encode()
        ).hexdigest(),
        "measurement_sha256": measurement_fingerprint(measurements),
        "validation": validation,
        "published_to_postgres": published_to_postgres,
        "indexed_to_qdrant": indexed_to_qdrant,
    }
    if published_to_postgres:
        try:
            from app.db import record_ingestion_run

            record_ingestion_run(report, postgres_dsn)
        except (ImportError, OSError, RuntimeError, ValueError) as exc:
            raise RuntimeError("PostgreSQL ingestion provenance could not be recorded") from exc
    (root / "ingestion_report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    return {"documents": len(documents), "chunks": len(chunks), "measurements": len(measurements)}


if __name__ == "__main__":
    print(run_ingestion())
