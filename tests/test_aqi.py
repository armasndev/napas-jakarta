import pytest

from app.aqi import pm25_24h_mean, pm25_aqi, pm25_category


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
