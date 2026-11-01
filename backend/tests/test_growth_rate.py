"""Growth rate from e-Stat: real signed values, null when unavailable.

The field was previously hard-coded to 0 because the census table has a single
time point. A hard 0 is the worst possible placeholder here: it is a plausible
statistic, so nothing looks wrong, and 千代田区's real figure is NEGATIVE.

Since real-data plan PR 2 the rate is read from the 確報 table 0004065882
(5年間の人口増減率, tab 2025_35), no longer from the 速報; the published values
are guarded in test_census_2025.py.
"""

import pytest

from services.demographics import (
    GROWTH_TAB_CODE,
    fetch_growth_rates,
    parse_growth_rates,
    transform_census,
)


def _rate(area, value, tab=GROWTH_TAB_CODE):
    return {"@area": area, "@tab": tab, "@time": "2025000000", "@unit": "％", "$": value}


CHIYODA_POPULATION = {"13101": 66270.0}


def test_parses_signed_rates():
    rates = parse_growth_rates([_rate("13101", "-0.61488"), _rate("13113", "-2.07354")])
    assert rates["13101"] == pytest.approx(-0.61488)
    assert rates["13113"] == pytest.approx(-2.07354)


def test_sign_is_preserved():
    """A negative rate is a downside signal; dropping the sign inverts meaning."""
    rates = parse_growth_rates([_rate("13101", "-0.61488"), _rate("13102", "3.5")])
    assert rates["13101"] < 0
    assert rates["13102"] > 0


def test_other_tabs_are_ignored():
    """The table carries 9 tabs (面積, 人口密度, 世帯 …); only the change-rate one is ours."""
    rates = parse_growth_rates([_rate("13101", "66680", tab="2025_03"), _rate("13101", "11.66", tab="2025_47")])
    assert rates == {}


@pytest.mark.parametrize("suppressed", ["-", "***", "X", ""])
def test_suppressed_cell_is_null_not_zero(suppressed):
    rates = parse_growth_rates([_rate("13101", suppressed)])
    assert rates["13101"] is None


def test_transform_uses_the_real_rate():
    out = {r["region"]: r for r in transform_census(CHIYODA_POPULATION, {}, {"13101": -0.61488})}
    assert out["千代田区"]["growthRate"] == pytest.approx(-0.61488)


def test_missing_growth_rate_is_null_not_zero():
    """The whole point: absent data must not masquerade as 0% change."""
    out = {r["region"]: r for r in transform_census(CHIYODA_POPULATION, {}, {})}
    assert out["千代田区"]["growthRate"] is None
    assert out["千代田区"]["growthRate"] != 0


def test_failed_growth_call_leaves_population_intact():
    """A growth-table outage must not take the population data down with it."""
    out = {r["region"]: r for r in transform_census(CHIYODA_POPULATION, {}, None)}
    assert out["千代田区"]["population"] == 66270
    assert out["千代田区"]["growthRate"] is None


def test_unset_key_raises_rather_than_returning_zeros(monkeypatch):
    monkeypatch.delenv("ESTAT_API_KEY", raising=False)
    import asyncio

    with pytest.raises(RuntimeError):
        asyncio.run(fetch_growth_rates())
