"""Small, auditable connector for official Jakarta air-quality exports.

The portal exposes both API responses and downloadable CSV/JSON files.  The
connector deliberately accepts a URL rather than hard-coding an unstable
dataset route; every run records the URL and validates the normalized schema.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
from collections.abc import Iterable
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from app.models import Measurement

ALIASES = {
    "station_id": ("station_id", "id_stasiun", "kode_stasiun", "stasiun_id"),
    "station_name": ("station_name", "nama_stasiun", "stasiun", "nama spku"),
    "district": ("district", "kecamatan", "wilayah", "kota_administrasi"),
    "observed_at": ("observed_at", "tanggal", "tanggal_waktu", "waktu", "date"),
    "concentration": ("concentration", "pm2.5", "pm25", "pm_duakomalima", "nilai"),
    "ispu_value": ("ispu_value", "ispu", "nilai_ispu"),
    "ispu_category": ("ispu_category", "kategori", "kategori_ispu"),
    "averaging_period": ("averaging_period", "periode_rata_rata", "periode"),
    "quality_flag": ("quality_flag", "quality", "status_data"),
    "fetched_at": ("fetched_at", "waktu_ambil"),
    "dominant_metric": ("dominant_metric", "dominantmetric"),
}


def _key(row: dict[str, Any], name: str) -> str | None:
    normalized = {str(k).strip().lower().replace(" ", "_"): v for k, v in row.items()}
    for alias in ALIASES[name]:
        if alias in normalized and normalized[alias] not in (None, "", "-"):
            return str(normalized[alias]).strip()
    return None


def parse_rows(rows: Iterable[dict[str, Any]], source_url: str) -> list[Measurement]:
    """Normalize portal rows and fail loudly when required fields are absent."""
    result: list[Measurement] = []
    for number, row in enumerate(rows, start=1):
        values = {name: _key(row, name) for name in ALIASES}
        required = ("station_id", "station_name", "district", "observed_at", "ispu_value")
        missing = [name for name in required if not values[name]]
        if missing:
            raise ValueError(f"row {number} missing required fields: {', '.join(missing)}")
        try:
            observed_at = datetime.fromisoformat(values["observed_at"])
            if observed_at.tzinfo is None:
                observed_at = observed_at.replace(tzinfo=ZoneInfo("Asia/Jakarta"))
            ispu_value = int(float(values["ispu_value"]))
            concentration = (float(values["concentration"])
                             if values["concentration"] not in (None, "") else None)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"row {number} has invalid numeric/date values") from exc
        # The portal's raw value belongs to its dominant pollutant. Only keep it as
        # PM2.5 when the portal says PM2.5 is dominant; otherwise abstain.
        dominant = values["dominant_metric"]
        if dominant is not None and dominant.upper().replace(".", "") != "PM25":
            concentration = None
        result.append(
            Measurement(
                station_id=values["station_id"], station_name=values["station_name"],
                district=values["district"], observed_at=observed_at, pollutant="PM2.5",
                concentration=concentration, concentration_unit="ug/m3", ispu_value=ispu_value,
                ispu_category=values["ispu_category"] or "unknown", source=source_url,
                averaging_period=values["averaging_period"] or "unknown",
                quality_flag=values["quality_flag"],
                fetched_at=datetime.fromisoformat(values["fetched_at"]) if values["fetched_at"] else None,
            )
        )
    return result


def payload_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "results", "records", "rows"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    raise ValueError("official payload must be a list or contain data/results/records/rows")


def spku_html_rows(text: str) -> list[dict[str, Any]]:
    """Extract the official portal's server-rendered station snapshot.

    This is intentionally an explicit opt-in connector for the public landing
    page, not a hidden JSON endpoint.  If the portal removes this published
    snapshot, ingestion fails loudly and the committed demo remains available.
    """
    payload = _spku_payload(text)
    rows = []
    for item in payload:
        rows.append({
            "station_id": item.get("id") or item.get("initial"),
            "station_name": item.get("name"),
            "district": item.get("area") or item.get("kota"),
            "observed_at": item.get("dominantMetricTime"),
            "concentration": item.get("dominantRawValue"),
            "dominant_metric": item.get("dominantMetric"),
            "ispu_value": item.get("ispu"),
            "ispu_category": item.get("status"),
        })
    return rows


def spku_html_stations(text: str) -> list[dict[str, Any]]:
    """Return verified station coordinates from the same official snapshot."""
    return [
        {"station_id": item.get("id") or item.get("initial"),
         "station": item.get("name"), "district": item.get("area") or item.get("kota"),
         "latitude": item.get("lat"), "longitude": item.get("lng"),
         "source": "https://udara.jakarta.go.id/"}
        for item in _spku_payload(text)
        if item.get("lat") is not None and item.get("lng") is not None
    ]


def _spku_payload(text: str) -> list[dict[str, Any]]:
    match = re.search(r"window\.__SPKU_DATA__\s*=\s*(\[.*?\]);", text, flags=re.DOTALL)
    if not match:
        raise ValueError("official portal page does not contain __SPKU_DATA__ snapshot")
    payload = json.loads(match.group(1))
    if not isinstance(payload, list):
        raise TypeError("official station snapshot must be a list")
    return payload


def _get_official(url: str, timeout: int, retries: int | None = None):
    """GET an official endpoint with bounded retries for transient failures.

    The Jakarta portal can occasionally accept a connection and then stall
    while reading its page.  Cron should absorb a short outage, but it must
    also terminate rather than retry forever.  Only request failures are
    retried; HTTP errors and schema errors remain visible to the caller.
    """
    import requests

    connect_timeout = max(
        1,
        int(os.getenv("OFFICIAL_CONNECT_TIMEOUT_SECONDS", min(timeout, 10))),
    )
    read_timeout = max(
        1,
        int(os.getenv("OFFICIAL_READ_TIMEOUT_SECONDS", timeout)),
    )
    attempts = max(
        1,
        (int(os.getenv("OFFICIAL_FETCH_RETRIES", "2")) + 1)
        if retries is None
        else retries + 1,
    )
    last_error: requests.RequestException | None = None
    for attempt in range(attempts):
        try:
            response = requests.get(
                url,
                timeout=(connect_timeout, read_timeout),
                headers={"User-Agent": "napas-jakarta/0.1"},
            )
            response.raise_for_status()
            return response
        except requests.HTTPError:
            # A published HTTP error is not a transient socket outage; surface
            # it immediately so source or schema problems remain visible.
            raise
        except requests.RequestException as exc:
            last_error = exc
            if attempt + 1 == attempts:
                break
    assert last_error is not None
    raise last_error


def fetch_measurements(url: str, timeout: int = 30, raw_output: str | Path | None = None) -> list[Measurement]:
    response = _get_official(url, timeout)
    body = response.content
    if raw_output is not None:
        destination = Path(raw_output)
        destination.mkdir(parents=True, exist_ok=True)
        filename = f"snapshot-{hashlib.sha256(body).hexdigest()[:16]}.bin"
        (destination / filename).write_bytes(body)
    text = body.decode("utf-8-sig")
    if url.lower().split("?", 1)[0].endswith(".csv"):
        rows = list(csv.DictReader(io.StringIO(text)))
    elif url.lower().split("?", 1)[0].endswith((".json", ".jsonl")):
        rows = payload_rows(json.loads(text))
    else:
        rows = spku_html_rows(text)
    fetched_at = datetime.now(UTC)
    return [replace(item, fetched_at=fetched_at) for item in parse_rows(rows, url)]


def fetch_stations(url: str, timeout: int = 30) -> list[dict[str, Any]]:
    """Fetch official station metadata from the same published portal snapshot."""
    response = _get_official(url, timeout)
    stations = spku_html_stations(response.content.decode("utf-8-sig"))
    if not stations:
        raise ValueError("official portal returned no station coordinates")
    return stations
