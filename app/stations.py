from __future__ import annotations

import csv
import re
from pathlib import Path

import requests


def display_station_name(value: object) -> str:
    """Return a readable station label while retaining the raw source value elsewhere.

    Jakarta's feeds commonly prepend an internal station code (``DKI_PM25_64``,
    ``LCS-03``, or ``BAM02``) to the public place name.  The code is useful for
    joins and provenance, but it is noise in a map tooltip or table.
    """
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if not text:
        return "Unknown station"
    # Explicit feed prefixes.  Require whitespace after the code so public
    # names such as "DKI Jakarta" are not accidentally truncated.
    patterns = (
        r"^(?:DKI|DKJ)\d*(?:[_-][A-Za-z0-9]+)*\s+(.+)$",
        r"^LCS[-_ ]?\d+\s*[-–—:]?\s+(.+)$",
        r"^BAM\d+\s+(.+)$",
        r"^pm25[_-][A-Za-z0-9]+\s+(.+)$",
    )
    for pattern in patterns:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match and match.group(1).strip():
            text = match.group(1).strip()
            break
    # Keep normal acronyms (PT., JIS, BMKG) intact while making source enum
    # annotations readable.
    text = re.sub(r"\(ROOFTOP\)", "(Rooftop)", text, flags=re.IGNORECASE)
    return text


def display_district_name(value: object) -> str:
    """Return a concise public-facing district label without changing the ID."""
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if not text:
        return "Unknown district"
    text = re.sub(r"^(?:Kota|Kab\.)\s+Adm\.\s+", "", text, flags=re.IGNORECASE)
    return text.replace("Kep. Seribu", "Kepulauan Seribu")


def load_stations(path: str | Path = "data/demo/stations.csv") -> list[dict]:
    with Path(path).open(newline="", encoding="utf-8") as handle:
        return [
            {**row, "latitude": float(row["latitude"]), "longitude": float(row["longitude"])}
            for row in csv.DictReader(handle)
        ]


def load_runtime_stations(
    path: str | Path = "data/demo/stations.csv",
    source_url: str = "",
    persisted_path: str | Path | None = None,
    prefer_persisted: bool = False,
) -> list[dict]:
    """Load persisted coordinates first; use the remote source as a refresh fallback."""
    if persisted_path is None:
        persisted_path = Path(path).parent.parent / "processed" / "stations.csv"
    if (prefer_persisted or source_url.strip()) and Path(persisted_path).exists():
        return load_stations(persisted_path)
    if source_url.strip():
        try:
            from ingestion.official import spku_html_stations

            response = requests.get(
                source_url, timeout=(10, 30), headers={"User-Agent": "napas-jakarta/0.1"}
            )
            response.raise_for_status()
            stations = spku_html_stations(response.text)
            if stations:
                return stations
        except (ImportError, OSError, RuntimeError, ValueError, requests.RequestException):
            pass
    return load_stations(path)
