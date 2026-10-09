"""Deterministic measurement tools used by the assistant route."""

from __future__ import annotations

import math
from datetime import UTC, date, datetime
from typing import TypedDict

from .aqi import station_pm25_aqi
from .data import district_matches, latest_by_station
from .models import Document, Measurement

# The official portal names districts in Indonesian ("Jakarta Utara"). Users and
# the model naturally say "North Jakarta", so whole-string aliases resolve to
# the portal name before substring matching.
_DISTRICT_ALIASES = {
    "north jakarta": "jakarta utara",
    "the north": "jakarta utara",
    "north": "jakarta utara",
    "jakut": "jakarta utara",
    "south jakarta": "jakarta selatan",
    "the south": "jakarta selatan",
    "south": "jakarta selatan",
    "jaksel": "jakarta selatan",
    "west jakarta": "jakarta barat",
    "the west": "jakarta barat",
    "west": "jakarta barat",
    "jakbar": "jakarta barat",
    "east jakarta": "jakarta timur",
    "the east": "jakarta timur",
    "east": "jakarta timur",
    "jaktim": "jakarta timur",
    "central jakarta": "jakarta pusat",
    "the centre": "jakarta pusat",
    "the center": "jakarta pusat",
    "jakpus": "jakarta pusat",
    "thousand islands": "kepulauan seribu",
}


def _location_needle(location: str) -> str:
    """Lower-cased search needle with English/short district names resolved."""
    needle = " ".join(location.lower().split())
    return _DISTRICT_ALIASES.get(needle, needle)


class CategoryOccurrence(TypedDict):
    """Most-recent station observation matching an ISPU category threshold."""

    found: bool
    category: str
    threshold_ispu: int
    pollutant: str
    district: str
    coverage_start: str | None
    coverage_end: str | None
    coverage_observations: int
    coverage_timestamps: int
    coverage_stations: int
    qualifying_observations: int
    qualifying_stations: int
    observed_at: str | None
    observed_at_wib: str | None
    station_id: str | None
    station: str | None
    ispu: int | None
    ispu_category: str | None
    concentration: float | None
    unit: str | None
    source: str | None
    source_url: str | None
    freshness: dict | None
    reported_stations_at_timestamp: int
    qualifying_stations_at_timestamp: int
    condition_kind: str
    operator: str | None
    threshold: str | float | int | None
    location_type: str
    temporal_operation: str
    aggregation_semantics: str
    condition_description: str


_ISPU_CATEGORY_BOUNDS = {
    "baik": ("<=", 50),
    "good": ("<=", 50),
    "sedang": ("between", (51, 100)),
    "moderate": ("between", (51, 100)),
    "tidak sehat": ("between", (101, 200)),
    "unhealthy": ("between", (101, 200)),
    "sangat tidak sehat": ("between", (201, 300)),
    "very unhealthy": ("between", (201, 300)),
    "berbahaya": (">", 300),
    "hazardous": (">", 300),
}

DEFAULT_STALE_AFTER_HOURS = 24


def _wib_timestamp(value: datetime) -> str:
    """Render an observation timestamp in Jakarta time without host-TZ dependence."""
    from zoneinfo import ZoneInfo

    observed = value
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=ZoneInfo("Asia/Jakarta"))
    return observed.astimezone(ZoneInfo("Asia/Jakarta")).strftime("%d %b %Y, %H:%M WIB")


def get_most_recent_category_occurrence(
    measurements: list[Measurement],
    district: str,
    category: str = "Baik",
    station: str | None = None,
    pollutant: str = "PM2.5",
    threshold_ispu: int = 50,
    now: datetime | None = None,
) -> CategoryOccurrence:
    """Backward-compatible wrapper for the generic occurrence query."""
    return query_historical_occurrence(
        measurements,
        location=station or district,
        location_type="station" if station else "district",
        pollutant=pollutant,
        condition_kind="category",
        threshold_or_category=category,
        temporal_operation="most_recent",
        now=now,
    )


def query_historical_occurrence(
    measurements: list[Measurement],
    location: str,
    location_type: str = "district",
    pollutant: str = "PM2.5",
    condition_kind: str = "category",
    operator: str | None = None,
    threshold_or_category: str | float | None = "Baik",
    temporal_operation: str = "most_recent",
    optional_start: date | datetime | None = None,
    optional_end: date | datetime | None = None,
    aggregation_semantics: str = "station_observation",
    now: datetime | None = None,
) -> CategoryOccurrence:
    """Calculate a parameterized historical station-observation condition.

    This function intentionally performs calculation only. It never claims a
    whole district was in a category: a district query selects qualifying
    station observations and reports their coverage separately. ``condition_kind``
    may be ``category``, ``ispu``, or ``concentration``; numeric conditions use
    ``operator`` and ``threshold_or_category``. ``temporal_operation`` supports
    ``most_recent``, ``first``, and ``count``.
    """
    if location_type not in {"district", "station"}:
        raise ValueError("location_type must be district or station")
    if temporal_operation not in {"most_recent", "first", "count"}:
        raise ValueError("temporal_operation must be most_recent, first, or count")
    if aggregation_semantics != "station_observation":
        raise ValueError("only station_observation semantics are supported")
    if condition_kind not in {"category", "ispu", "concentration"}:
        raise ValueError("condition_kind must be category, ispu, or concentration")

    def in_window(value: datetime) -> bool:
        value_date = value.date()
        if optional_start is not None:
            start = optional_start.date() if isinstance(optional_start, datetime) else optional_start
            if value_date < start:
                return False
        if optional_end is not None:
            end = optional_end.date() if isinstance(optional_end, datetime) else optional_end
            if value_date > end:
                return False
        return True

    def matches_location(item: Measurement) -> bool:
        if location_type == "district":
            return district_matches(item.district, location)
        needle = location.casefold().strip()
        return needle in item.station_name.casefold() or needle == item.station_id.casefold()

    def meets(item: Measurement) -> bool:
        value = item.ispu_value if condition_kind in {"category", "ispu"} else item.concentration
        if value is None:
            return False
        if condition_kind == "category":
            spec = _ISPU_CATEGORY_BOUNDS.get(str(threshold_or_category).casefold().strip())
            if spec is None:
                raise ValueError(f"Unknown ISPU category: {threshold_or_category}")
            selected_operator, selected_threshold = spec
        else:
            selected_operator = operator or "<="
            selected_threshold = float(threshold_or_category)  # type: ignore[arg-type]
        if selected_operator == "between":
            low, high = selected_threshold
            return low <= value <= high
        if selected_operator == "<=":
            return value <= selected_threshold
        if selected_operator == "<":
            return value < selected_threshold
        if selected_operator == ">=":
            return value >= selected_threshold
        if selected_operator == ">":
            return value > selected_threshold
        if selected_operator == "=":
            return value == selected_threshold
        raise ValueError(f"Unsupported operator: {selected_operator}")

    matching = [
        item
        for item in measurements
        if item.pollutant == pollutant
        and matches_location(item)
        and in_window(item.observed_at)
    ]
    qualifying = [item for item in matching if meets(item)]
    coverage_timestamps = {item.observed_at for item in matching}
    coverage_stations = {item.station_id for item in matching}
    qualifying_stations = {item.station_id for item in qualifying}
    if condition_kind == "category":
        category_spec = _ISPU_CATEGORY_BOUNDS[str(threshold_or_category).casefold().strip()]
        condition_description = f"ISPU category {threshold_or_category}"
        if category_spec[0] == "between":
            condition_description += f" ({category_spec[1][0]}–{category_spec[1][1]})"
        else:
            condition_description += f" (ISPU {category_spec[0]} {category_spec[1]})"
    else:
        condition_description = f"{pollutant} {operator or '<='} {threshold_or_category}"
    base: CategoryOccurrence = {
        "found": bool(qualifying),
        "category": str(threshold_or_category) if condition_kind == "category" else "",
        "threshold_ispu": (
            int(_ISPU_CATEGORY_BOUNDS[str(threshold_or_category).casefold().strip()][1])
            if condition_kind == "category"
            and str(threshold_or_category).casefold().strip() in {"baik", "good"}
            else int(threshold_or_category)
            if condition_kind == "ispu" and str(threshold_or_category).replace(".", "", 1).isdigit()
            else 50
        ),
        "pollutant": pollutant,
        "district": location,
        "coverage_start": min((item.observed_at for item in matching), default=None).isoformat()
        if matching
        else None,
        "coverage_end": max((item.observed_at for item in matching), default=None).isoformat()
        if matching
        else None,
        "coverage_observations": len(matching),
        "coverage_timestamps": len(coverage_timestamps),
        "coverage_stations": len(coverage_stations),
        "qualifying_observations": len(qualifying),
        "qualifying_stations": len(qualifying_stations),
        "observed_at": None,
        "observed_at_wib": None,
        "station_id": None,
        "station": None,
        "ispu": None,
        "ispu_category": None,
        "concentration": None,
        "unit": None,
        "source": None,
        "source_url": None,
        "freshness": None,
        "reported_stations_at_timestamp": 0,
        "qualifying_stations_at_timestamp": 0,
        "condition_kind": condition_kind,
        "operator": operator,
        "threshold": threshold_or_category,
        "location_type": location_type,
        "temporal_operation": temporal_operation,
        "aggregation_semantics": aggregation_semantics,
        "condition_description": condition_description,
    }
    if not qualifying or temporal_operation == "count":
        return base
    latest_time = (
        max(item.observed_at for item in qualifying)
        if temporal_operation == "most_recent"
        else min(item.observed_at for item in qualifying)
    )
    at_latest = [item for item in matching if item.observed_at == latest_time]
    latest = min(at_latest, key=lambda item: (item.station_name.lower(), item.station_id))
    qualifying_at_latest = [item for item in at_latest if item in qualifying]
    base.update(
        {
            "observed_at": latest.observed_at.isoformat(),
            "observed_at_wib": _wib_timestamp(latest.observed_at),
            "station_id": latest.station_id,
            "station": latest.station_name,
            "ispu": latest.ispu_value,
            "ispu_category": latest.ispu_category,
            "concentration": latest.concentration,
            "unit": latest.concentration_unit,
            "source": latest.source,
            "source_url": latest.source
            if latest.source.startswith(("http://", "https://"))
            else None,
            "freshness": freshness(latest, now=now),
            "reported_stations_at_timestamp": len({item.station_id for item in at_latest}),
            "qualifying_stations_at_timestamp": len(
                {item.station_id for item in qualifying_at_latest}
            ),
        }
    )
    return base


def get_latest_measurements(
    measurements: list[Measurement],
    location: str | None = None,
    pollutant: str = "PM2.5",
    now: datetime | None = None,
) -> list[dict]:
    rows = latest_by_station(measurements, pollutant)
    if location:
        needle = _location_needle(location)
        rows = [x for x in rows if needle in (x.district + " " + x.station_name).lower()]
    # AQI is PM2.5 only and needs 18 hourly readings in the trailing 24 hours.
    aqi_by_station = (
        station_pm25_aqi(measurements, now or datetime.now(UTC)) if pollutant == "PM2.5" else {}
    )
    output = []
    for x in rows:
        row_freshness = freshness(x, now=now)
        station_aqi = aqi_by_station.get(x.station_id) or {}
        output.append(
            {
            "station_id": x.station_id,
            "station": x.station_name,
            "district": x.district,
            "pollutant": x.pollutant,
            "concentration": x.concentration,
            "unit": x.concentration_unit,
            "averaging_period": x.averaging_period,
            "ispu": x.ispu_value,
            "aqi": None if row_freshness["stale"] else station_aqi.get("aqi"),
            "aqi_category": None if row_freshness["stale"] else station_aqi.get("category"),
            "aqi_pm25_24h_mean": None if row_freshness["stale"] else station_aqi.get("pm25_24h_mean"),
            "aqi_hours": station_aqi.get("hours"),
            "category": "Stale / missing" if row_freshness["stale"] else x.ispu_category,
            "observed_at": x.observed_at.isoformat(),
            "source": x.source,
            "source_url": x.source if x.source.startswith(("http://", "https://")) else None,
            "freshness": row_freshness,
            "quality_flag": x.quality_flag,
            "fetched_at": x.fetched_at.isoformat() if x.fetched_at else None,
            "missing_data_warning": (
                "Raw concentration unavailable for this observation"
                if x.concentration is None
                else None
            ),
            }
        )
    return output


def get_historical_summary(
    measurements: list[Measurement], location: str, start: date, end: date, pollutant: str = "PM2.5"
) -> dict:
    if end < start:
        raise ValueError("end must not be before start")
    matching = [
        x
        for x in measurements
        if x.pollutant == pollutant
        and _location_needle(location) in (x.district + " " + x.station_name).lower()
        and start <= x.observed_at.date() <= end
    ]
    selected = [x for x in matching if x.concentration is not None]
    if not matching:
        raise ValueError("No measurements found for the requested location and date range")
    if not selected:
        raise ValueError("Measurements found, but raw concentration is unavailable")
    return {
        "location": location,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "observations": len(selected),
        "mean_concentration": round(sum(x.concentration for x in selected) / len(selected), 2),
        "max_ispu": max(x.ispu_value for x in selected),
        "source": selected[0].source,
        "source_url": (
            selected[0].source if selected[0].source.startswith(("http://", "https://")) else None
        ),
        "missing_observations": len(matching) - len(selected),
        "missing_data_warning": (
            "Some observations lacked raw concentration" if len(selected) < len(matching) else None
        ),
    }


def compare_measurement_with_standard(value: float, pollutant: str = "PM2.5") -> dict:
    if not math.isfinite(value) or value < 0:
        raise ValueError("measurement value must be a finite non-negative number")
    guideline = {"PM2.5": 5.0, "PM10": 15.0}.get(pollutant)
    if guideline is None:
        raise ValueError(f"No configured WHO guideline for {pollutant}")
    return {
        "pollutant": pollutant,
        "value": value,
        "unit": "ug/m3",
        "who_annual_guideline": guideline,
        "exceeds_guideline": value > guideline,
        "note": "WHO guideline, not an Indonesian legal threshold",
        "source_id": "who-aqg-2021",
    }


def get_unhealthy_day_count(
    measurements: list[Measurement], location: str, start: date, end: date
) -> dict:
    needle = _location_needle(location)
    matching = [
        x
        for x in measurements
        if needle in (x.district + " " + x.station_name).lower()
        and start <= x.observed_at.date() <= end
    ]
    selected = [x for x in matching if x.ispu_value > 100]
    days = {x.observed_at.date() for x in selected}
    return {
        "location": location,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "unhealthy_days": len(days),
        "observations": len(matching),
        "source": matching[0].source if matching else None,
        "warning": None if matching else "No observations available",
    }


def compare_locations(
    measurements: list[Measurement], locations: list[str], pollutant: str = "PM2.5"
) -> list[dict]:
    """Compare latest observed values without inventing missing locations."""
    output = []
    for location in locations:
        rows = get_latest_measurements(measurements, location, pollutant)
        fresh = [
            row["concentration"]
            for row in rows
            if row["concentration"] is not None and not row["freshness"]["stale"]
        ]
        output.append(
            {
                "location": location,
                "available": bool(rows),
                "latest": rows[0] if rows else None,
                # A district is many stations; summarise the fresh ones so a
                # comparison is not decided by one arbitrary monitor.
                "matched_station_count": len(rows),
                "fresh_station_count": len(fresh),
                "fresh_mean_concentration": round(sum(fresh) / len(fresh), 2) if fresh else None,
                "fresh_min_concentration": min(fresh) if fresh else None,
                "fresh_max_concentration": max(fresh) if fresh else None,
                "warning": None if rows else "No observation available",
            }
        )
    return output


def get_peak_measurement(
    measurements: list[Measurement], start: date, end: date, pollutant: str = "PM2.5"
) -> dict:
    """Return the highest numeric observation in a date window deterministically."""
    if end < start:
        raise ValueError("end must not be before start")
    matching = [
        item
        for item in measurements
        if item.pollutant == pollutant
        and item.concentration is not None
        and start <= item.observed_at.date() <= end
    ]
    if not matching:
        raise ValueError("No numeric measurements found for the requested date range")
    peak = max(matching, key=lambda item: item.concentration)
    return {
        "station_id": peak.station_id,
        "station": peak.station_name,
        "district": peak.district,
        "pollutant": peak.pollutant,
        "concentration": peak.concentration,
        "unit": peak.concentration_unit,
        "ispu": peak.ispu_value,
        "category": peak.ispu_category,
        "observed_at": peak.observed_at.isoformat(),
        "source": peak.source,
        "source_url": (peak.source if peak.source.startswith(("http://", "https://")) else None),
        "start": start.isoformat(),
        "end": end.isoformat(),
    }


def search_guidance(
    query: str,
    documents: list[Document],
    language: str = "English",
    retrieval_mode: str = "dense",
    top_k: int = 5,
    source_ids: list[str] | None = None,
) -> list[dict]:
    """Typed document-guidance tool; it returns source metadata, never raw SQL.

    ``source_ids`` lets a topic-scoped client constrain retrieval to the
    sources selected by the product catalog. An empty or omitted filter keeps
    the existing corpus-wide behavior.
    """
    from .retrieval import search

    normalized_source_ids = {
        source_id.strip()
        for source_id in (source_ids or [])
        if source_id and source_id.strip()
    }
    candidate_documents = (
        [
            document
            for document in documents
            if document.source_id in normalized_source_ids
            or document.document_id in normalized_source_ids
        ]
        if normalized_source_ids
        else documents
    )
    results = search(query, candidate_documents, mode=retrieval_mode, top_k=top_k)
    return [
        {
            "document_id": item.document.document_id,
            "source_id": item.document.source_id or item.document.document_id,
            "title": item.document.title,
            "publisher": item.document.publisher,
            "source_url": item.document.source_url,
            "section": item.document.section,
            "heading_path": item.document.heading_path,
            "page": item.document.page,
            "article_or_clause": item.document.article_or_clause,
            "language": language,
            "score": item.score,
            "excerpt": item.document.text[:500],
        }
        for item in results
    ]


def freshness(
    measurement: Measurement,
    now: datetime | None = None,
    stale_after_hours: int = DEFAULT_STALE_AFTER_HOURS,
) -> dict:
    now = now or datetime.now(UTC)
    observed = measurement.observed_at
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=UTC)
    age_seconds = max(0.0, (now - observed).total_seconds())
    return {
        "observed_at": measurement.observed_at.isoformat(),
        "age_seconds": round(age_seconds, 2),
        "stale": age_seconds > stale_after_hours * 3600,
        "stale_after_hours": stale_after_hours,
    }


def latest_data_age_seconds(
    measurements: list[Measurement], now: datetime | None = None
) -> float | None:
    """Age of the newest observation; ``None`` when there are no observations."""
    if not measurements:
        return None
    latest = max(measurements, key=lambda item: item.observed_at)
    return freshness(latest, now=now)["age_seconds"]
