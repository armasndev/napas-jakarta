"""US EPA PM2.5 AQI from a 24-hour mean concentration (µg/m³).

Breakpoints follow EPA's 2024 PM2.5 AQI revision (effective 6 May 2024), as
published in EPA's "PM NAAQS Air Quality Index Fact Sheet". Concentrations are
truncated to one decimal place before lookup, as EPA specifies.

Only the 0 to 300 range is implemented. Above 225.4 µg/m³ the function returns
None: the Hazardous sub-breakpoints are not confirmed against EPA's technical
document, so the caller must abstain rather than extrapolate.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from app.models import Measurement

# (concentration low, concentration high, AQI low, AQI high), 24-hour PM2.5.
PM25_BREAKPOINTS: tuple[tuple[float, float, int, int], ...] = (
    (0.0, 9.0, 0, 50),  # Good
    (9.1, 35.4, 51, 100),  # Moderate
    (35.5, 55.4, 101, 150),  # Unhealthy for Sensitive Groups
    (55.5, 125.4, 151, 200),  # Unhealthy
    (125.5, 225.4, 201, 300),  # Very Unhealthy
)

# EPA's convention: a 24-hour mean needs at least 75% of hourly values (18 of 24).
MIN_HOURLY_VALUES = 18


def pm25_aqi(concentration: float | None) -> int | None:
    """Return the PM2.5 AQI for a 24-hour mean in µg/m³, or None if out of range."""
    if concentration is None or not math.isfinite(concentration) or concentration < 0:
        return None
    truncated = math.floor(concentration * 10) / 10
    for conc_lo, conc_hi, aqi_lo, aqi_hi in PM25_BREAKPOINTS:
        if conc_lo <= truncated <= conc_hi:
            value = (aqi_hi - aqi_lo) / (conc_hi - conc_lo) * (truncated - conc_lo) + aqi_lo
            return round(value)
    return None


def pm25_category(aqi: int | None) -> str | None:
    """Return the EPA category name for an AQI value, or None if unavailable."""
    if aqi is None:
        return None
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    if aqi <= 200:
        return "Unhealthy"
    if aqi <= 300:
        return "Very Unhealthy"
    return None


def pm25_24h_mean(hourly_values: list[float | None]) -> float | None:
    """Mean of hourly PM2.5 values, or None unless EPA's 18-of-24 completeness holds."""
    valid = [v for v in hourly_values if v is not None and math.isfinite(v) and v >= 0]
    if len(valid) < MIN_HOURLY_VALUES:
        return None
    return sum(valid) / len(valid)


def station_pm25_aqi(
    measurements: Iterable[Measurement], now: datetime
) -> dict[str, dict[str, Any]]:
    """PM2.5 AQI per station from the trailing 24 hours of hourly readings.

    A station is omitted when it has fewer than 18 hourly values in the window,
    or when its readings are older than the window. Stale stations therefore
    never get an AQI, matching the 24-hour freshness rule.
    """
    window_start = now - timedelta(hours=24)
    hourly: dict[str, dict[datetime, float]] = defaultdict(dict)
    for measurement in measurements:
        if measurement.pollutant != "PM2.5" or measurement.concentration is None:
            continue
        hour = measurement.observed_at.replace(minute=0, second=0, microsecond=0)
        if hour <= window_start or hour > now:
            continue
        hourly[measurement.station_id][hour] = measurement.concentration

    results: dict[str, dict[str, Any]] = {}
    for station_id, by_hour in hourly.items():
        mean = pm25_24h_mean(list(by_hour.values()))
        aqi = pm25_aqi(mean)
        if mean is None or aqi is None:
            continue
        results[station_id] = {
            "aqi": aqi,
            "category": pm25_category(aqi),
            "pm25_24h_mean": round(mean, 1),
            "hours": len(by_hour),
            "window_end": max(by_hour).isoformat(),
        }
    return results
