from pathlib import Path

import pytest

from app.data import load_documents, load_measurements
from ingestion.chunking import fixed_chunks, semantic_chunks, structure_chunks
from ingestion.flow import measurement_fingerprint, merge_measurements, run_ingestion
from ingestion.official import parse_rows, payload_rows, spku_html_rows, spku_html_stations
from ingestion.validation import validate_measurements


def test_parse_official_aliases():
    rows = parse_rows(
        [
            {
                "id_stasiun": "DKI-1",
                "nama_stasiun": "Bundaran HI",
                "kecamatan": "Menteng",
                "tanggal": "2026-09-06T10:00:00+07:00",
                "pm25": "18.2",
                "ispu": "42",
                "kategori": "Baik",
            }
        ],
        "https://example.test/ispu.json",
    )
    assert rows[0].station_id == "DKI-1"
    assert rows[0].ispu_value == 42
    assert rows[0].source.endswith("ispu.json")


def test_parse_rejects_schema_drift():
    with pytest.raises(ValueError, match="missing required fields"):
        parse_rows([{"station": "missing everything"}], "source")


def test_missing_concentration_remains_missing_not_zero():
    rows = parse_rows(
        [
            {
                "id_stasiun": "DKI-1",
                "nama_stasiun": "Bundaran HI",
                "kecamatan": "Menteng",
                "tanggal": "2026-09-06T10:00:00+07:00",
                "ispu": "42",
                "kategori": "Baik",
            }
        ],
        "https://example.test/ispu.json",
    )
    assert rows[0].concentration is None


def test_payload_rows_accepts_wrapped_response():
    assert payload_rows({"success": True, "data": [{"x": 1}]}) == [{"x": 1}]


def test_official_portal_snapshot_rows_are_normalized():
    html = 'window.__SPKU_DATA__ = [{"id":"s1","name":"Bundaran HI","area":"Jakarta Pusat","dominantMetricTime":"2026-09-07T04:00:00","dominantRawValue":39.79,"ispu":99,"status":"Sedang"}];'
    rows = spku_html_rows(html)
    parsed = parse_rows(rows, "https://udara.jakarta.go.id/")
    assert parsed[0].station_id == "s1"
    assert parsed[0].observed_at.tzinfo is not None
    stations = spku_html_stations(
        html.replace('"dominantRawValue":39.79', '"lat":-6.2,"lng":106.8,"dominantRawValue":39.79')
    )
    assert stations[0]["latitude"] == -6.2


def test_official_snapshot_drops_concentration_when_another_pollutant_dominates():
    html = (
        'window.__SPKU_DATA__ = [{"id":"s1","name":"Bundaran HI","area":"Jakarta Pusat",'
        '"dominantMetricTime":"2026-09-07T04:00:00","dominantMetric":"O3",'
        '"dominantRawValue":39.79,"ispu":99,"status":"Sedang"}];'
    )
    parsed = parse_rows(spku_html_rows(html), "https://udara.jakarta.go.id/")
    assert parsed[0].concentration is None
    assert parsed[0].ispu_value == 99


def test_official_snapshot_keeps_concentration_when_pm25_dominates():
    html = (
        'window.__SPKU_DATA__ = [{"id":"s1","name":"Bundaran HI","area":"Jakarta Pusat",'
        '"dominantMetricTime":"2026-09-07T04:00:00","dominantMetric":"PM25",'
        '"dominantRawValue":39.79,"ispu":99,"status":"Sedang"}];'
    )
    parsed = parse_rows(spku_html_rows(html), "https://udara.jakarta.go.id/")
    assert parsed[0].concentration == 39.79


def test_official_fetch_retries_transient_read_timeout(monkeypatch):
    import requests

    from ingestion import official

    class Response:
        content = b"window.__SPKU_DATA__ = [];"

        def raise_for_status(self):
            return None

    attempts = {"count": 0}

    def get(*args, **kwargs):
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise requests.ReadTimeout("portal stalled")
        return Response()

    monkeypatch.setattr(requests, "get", get)
    monkeypatch.setenv("OFFICIAL_FETCH_RETRIES", "2")
    response = official._get_official("https://example.test", timeout=1)
    assert response.content.startswith(b"window.__SPKU_DATA__")
    assert attempts["count"] == 3


def test_chunk_variants_have_stable_ids():
    document = load_documents(Path(__file__).parents[1] / "data/docs")[0]
    variants = [
        fixed_chunks(document, words=20),
        structure_chunks(document),
        semantic_chunks(document),
    ]
    assert all(variants)
    assert len({chunk.chunk_id for chunks in variants for chunk in chunks}) == sum(
        map(len, variants)
    )
    assert variants[1][0].source_url
    assert len(variants[1][0].checksum) == 64


def test_validation_rejects_negative_measurements():
    # The parser gives us a valid model; mutate through a replacement to keep
    # the production dataclass immutable.
    from dataclasses import replace

    measurement = replace(
        load_measurements(Path(__file__).parents[1] / "data/demo/measurements.csv")[0],
        concentration=-1,
    )
    with pytest.raises(ValueError, match="validation failed"):
        validate_measurements([measurement])


def test_ingestion_is_idempotent(tmp_path):
    import shutil

    shutil.copytree(Path(__file__).parents[1] / "data", tmp_path / "data")
    first = run_ingestion(tmp_path / "data")
    second = run_ingestion(tmp_path / "data")
    assert first == second


def test_measurement_fingerprint_excludes_fetch_time():
    from dataclasses import replace
    from datetime import UTC, datetime

    measurement = load_measurements(Path(__file__).parents[1] / "data/demo/measurements.csv")[0]
    first = measurement_fingerprint(
        [replace(measurement, fetched_at=datetime(2026, 1, 1, tzinfo=UTC))]
    )
    second = measurement_fingerprint(
        [replace(measurement, fetched_at=datetime(2026, 1, 2, tzinfo=UTC))]
    )
    assert first == second


def test_merge_measurements_preserves_history_and_replaces_duplicates():
    from dataclasses import replace
    from datetime import timedelta

    base = load_measurements(Path(__file__).parents[1] / "data/demo/measurements.csv")[0]
    older = replace(base, observed_at=base.observed_at - timedelta(hours=1), ispu_value=10)
    refreshed = replace(base, ispu_value=77)
    merged = merge_measurements([older, base], [refreshed])
    assert len(merged) == 2
    assert [item.ispu_value for item in merged] == [10, 77]


def test_live_report_fingerprint_is_stable_across_fetches(tmp_path, monkeypatch):
    import json
    from dataclasses import replace
    from datetime import UTC, datetime

    from ingestion import flow

    data_dir = tmp_path / "data"
    (data_dir / "docs").mkdir(parents=True)
    for source in (Path(__file__).parents[1] / "data/docs").glob("*.md"):
        (data_dir / "docs" / source.name).write_text(source.read_text())
    base = load_measurements(Path(__file__).parents[1] / "data/demo/measurements.csv")[0]
    fetch_number = {"value": 0}

    def fake_fetch(*args, **kwargs):
        fetch_number["value"] += 1
        return [replace(base, fetched_at=datetime(2026, 1, fetch_number["value"], tzinfo=UTC))]

    monkeypatch.setattr(flow, "fetch_measurements", fake_fetch)
    monkeypatch.setenv("SOURCE_DATA_URL", "https://example.test/official")
    flow.run_ingestion(data_dir)
    first = json.loads((data_dir / "ingestion_report.json").read_text())["measurement_sha256"]
    flow.run_ingestion(data_dir)
    second = json.loads((data_dir / "ingestion_report.json").read_text())["measurement_sha256"]
    assert first == second


def test_ingestion_uses_retained_snapshot_when_official_source_times_out(tmp_path, monkeypatch):
    import json
    import shutil

    import requests

    from ingestion import flow

    source_root = Path(__file__).parents[1] / "data"
    data_dir = tmp_path / "data"
    shutil.copytree(source_root, data_dir)
    monkeypatch.setenv("SOURCE_DATA_URL", "https://example.test/official")

    def timeout(*args, **kwargs):
        raise requests.ReadTimeout("portal stalled")

    monkeypatch.setattr(flow, "fetch_measurements", timeout)
    monkeypatch.setattr(flow, "fetch_stations", lambda *args, **kwargs: [])

    result = flow.run_ingestion(data_dir)
    report = json.loads((data_dir / "ingestion_report.json").read_text())
    assert result["measurements"] == len(load_measurements(data_dir / "processed/measurements.csv"))
    assert report["source_status"] == "retained-local-snapshot"
    assert report["source_error"].startswith("ReadTimeout:")


def test_ingestion_uses_retained_snapshot_when_official_source_is_not_text(
    tmp_path, monkeypatch
):
    import json
    import shutil

    from ingestion import flow

    source_root = Path(__file__).parents[1] / "data"
    data_dir = tmp_path / "data"
    shutil.copytree(source_root, data_dir)
    monkeypatch.setenv("SOURCE_DATA_URL", "https://example.test/official")

    def image_response(*args, **kwargs):
        raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte")

    monkeypatch.setattr(flow, "fetch_measurements", image_response)
    monkeypatch.setattr(flow, "fetch_stations", lambda *args, **kwargs: [])

    result = flow.run_ingestion(data_dir)
    report = json.loads((data_dir / "ingestion_report.json").read_text())
    assert result["measurements"] == len(load_measurements(data_dir / "processed/measurements.csv"))
    assert report["source_status"] == "retained-local-snapshot"
    assert report["source_error"].startswith("UnicodeDecodeError:")
