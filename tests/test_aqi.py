import pytest

from app.aqi import pm25_24h_mean, pm25_aqi, pm25_category, station_pm25_aqi


@pytest.mark.parametrize(
    ("concentration", "expected"),
    [
        (0.0, 0),
        (9.0, 50),
        (9.1, 51),
        (35.4, 100),
        (35.5, 101),
        (55.4, 150),
        (55.5, 151),
        (125.4, 200),
        (125.5, 201),
        (225.4, 300),
    ],
)
def test_breakpoint_edges_match_epa_2024_table(concentration, expected):
    assert pm25_aqi(concentration) == expected


def test_interpolates_within_a_band():
    # Moderate band: (100 - 51) / (35.4 - 9.1) * (12.0 - 9.1) + 51 = 56.4
    assert pm25_aqi(12.0) == 56


def test_truncates_to_one_decimal_before_lookup():
    # 35.49 truncates to 35.4, which is still Moderate (100), not Unhealthy (101).
    assert pm25_aqi(35.49) == 100


@pytest.mark.parametrize("concentration", [225.5, 500.0, -0.1, float("nan"), float("inf"), None])
def test_abstains_outside_implemented_range(concentration):
    assert pm25_aqi(concentration) is None


def test_category_names_follow_epa_bands():
    assert pm25_category(50) == "Good"
    assert pm25_category(51) == "Moderate"
    assert pm25_category(150) == "Unhealthy for Sensitive Groups"
    assert pm25_category(200) == "Unhealthy"
    assert pm25_category(300) == "Very Unhealthy"
    assert pm25_category(None) is None


def test_24h_mean_requires_18_valid_hours():
    assert pm25_24h_mean([10.0] * 17 + [None] * 7) is None
    assert pm25_24h_mean([10.0] * 18 + [None] * 6) == 10.0


def test_24h_mean_ignores_negative_and_non_finite_values():
    values = [10.0] * 18 + [-1.0, float("nan")]
    assert pm25_24h_mean(values) == 10.0


def _hourly(station_id, start, values, pollutant="PM2.5"):
    from datetime import timedelta

    from app.models import Measurement

    return [
        Measurement(
            station_id=station_id, station_name=station_id, district="Test",
            observed_at=start + timedelta(hours=i), pollutant=pollutant,
            concentration=value, concentration_unit="ug/m3", ispu_value=0,
            ispu_category="Good", source="test",
        )
        for i, value in enumerate(values)
    ]


def test_station_aqi_uses_trailing_24h_mean():
    from datetime import UTC, datetime

    now = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
    start = datetime(2026, 10, 8, 13, 0, tzinfo=UTC)
    rows = _hourly("s1", start, [10.0] * 23)
    result = station_pm25_aqi(rows, now)
    assert result["s1"]["aqi"] == 53  # 10.0 µg/m³ is Moderate
    assert result["s1"]["category"] == "Moderate"
    assert result["s1"]["hours"] == 23


def test_station_aqi_needs_18_hours_and_fresh_data():
    from datetime import UTC, datetime

    now = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
    too_few = _hourly("s1", datetime(2026, 10, 9, 0, 0, tzinfo=UTC), [10.0] * 12)
    old = _hourly("s2", datetime(2026, 10, 7, 0, 0, tzinfo=UTC), [10.0] * 24)
    assert station_pm25_aqi(too_few + old, now) == {}


def test_station_aqi_ignores_other_pollutants():
    from datetime import UTC, datetime

    now = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
    rows = _hourly("s1", datetime(2026, 10, 8, 13, 0, tzinfo=UTC), [90.0] * 23, pollutant="O3")
    assert station_pm25_aqi(rows, now) == {}


def test_assistant_latest_reading_includes_station_aqi():
    from datetime import UTC, datetime

    from app.tools import get_latest_measurements

    now = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
    rows = _hourly("s1", datetime(2026, 10, 8, 13, 0, tzinfo=UTC), [10.0] * 23)
    latest = get_latest_measurements(rows, now=now)[0]
    assert latest["aqi"] == 53
    assert latest["aqi_category"] == "Moderate"
    assert latest["ispu"] == 0


def test_catalog_summary_counts_aqi_bands_among_reporting_stations():
    from datetime import UTC, datetime

    from app.api import build_station_catalog

    records = [
        {"station_id": f"s{i}", "station": f"S{i}", "district": "Test", "latitude": -6.2,
         "longitude": 106.8, "source": "https://udara.jakarta.go.id/"}
        for i in range(3)
    ]
    observed = datetime(2026, 10, 9, 11, 0, tzinfo=UTC).isoformat()
    latest = [
        {"station_id": f"s{i}", "station": f"S{i}", "district": "Test", "concentration": 30.0,
         "ispu": 90, "category": "Moderate", "observed_at": observed,
         "source": "https://udara.jakarta.go.id/", "freshness": {"status": "fresh", "stale": False}}
        for i in range(3)
    ]
    aqi = {
        "s0": {"aqi": 60, "category": "Moderate", "pm25_24h_mean": 20.0, "hours": 20, "window_end": observed},
        "s1": {"aqi": 120, "category": "Unhealthy for Sensitive Groups", "pm25_24h_mean": 40.0, "hours": 20, "window_end": observed},
        "s2": {"aqi": 180, "category": "Unhealthy", "pm25_24h_mean": 70.0, "hours": 20, "window_end": observed},
    }
    summary = build_station_catalog(records, latest, "live", aqi_by_station=aqi)["summary"]
    assert summary["aqi_moderate_count"] == 1
    assert summary["aqi_unhealthy_count"] == 2
