"""Growth rate from e-Stat: real signed values, null when unavailable.

The field was previously hard-coded to 0 because the census table has a single
time point. A hard 0 is the worst possible placeholder here: it is a plausible
statistic, so nothing looks wrong, and 千代田区's real figure is NEGATIVE.
"""

import pytest

from services.demographics import (
    GROWTH_TAB_CODE,
    fetch_growth_rates,
    parse_growth_rates,
    transform_estat,
)


def _rate(area, value, tab=GROWTH_TAB_CODE):
    return {"@area": area, "@tab": tab, "@time": "2025000000", "@unit": "％", "$": value}


def test_parses_signed_rates():
    rates = parse_growth_rates([_rate("13101", "-0.72136"), _rate("13113", "-1.95340")])
    assert rates["13101"] == pytest.approx(-0.72136)
    assert rates["13113"] == pytest.approx(-1.95340)


def test_sign_is_preserved():
    """A negative rate is a downside signal; dropping the sign inverts meaning."""
    rates = parse_growth_rates([_rate("13101", "-0.72136"), _rate("13102", "3.5")])
    assert rates["13101"] < 0
    assert rates["13102"] > 0


def test_other_tabs_are_ignored():
    """The table carries 10 tabs; only the change-rate one is ours."""
    rates = parse_growth_rates([_rate("13101", "66680", tab="2025_03")])
    assert rates == {}


@pytest.mark.parametrize("suppressed", ["-", "***", "X", ""])
def test_suppressed_cell_is_null_not_zero(suppressed):
    rates = parse_growth_rates([_rate("13101", suppressed)])
    assert rates["13101"] is None


def test_transform_uses_the_real_rate():
    values = [
        {"@area": "13101", "@tab": "020", "@cat01": "100", "@cat02": "100", "$": "66680"},
    ]
    out = {r["region"]: r for r in transform_estat(values, {"13101": -0.72136})}
    assert out["千代田区"]["growthRate"] == pytest.approx(-0.72136)


def test_missing_growth_rate_is_null_not_zero():
    """The whole point: absent data must not masquerade as 0% change."""
    values = [
        {"@area": "13101", "@tab": "020", "@cat01": "100", "@cat02": "100", "$": "66680"},
    ]
    out = {r["region"]: r for r in transform_estat(values, {})}
    assert out["千代田区"]["growthRate"] is None
    assert out["千代田区"]["growthRate"] != 0


def test_failed_growth_call_leaves_population_intact():
    """A growth-table outage must not take the population data down with it."""
    values = [
        {"@area": "13101", "@tab": "020", "@cat01": "100", "@cat02": "100", "$": "66680"},
    ]
    out = {r["region"]: r for r in transform_estat(values, None)}
    assert out["千代田区"]["population"] == 66680
    assert out["千代田区"]["growthRate"] is None


def test_unset_key_raises_rather_than_returning_zeros(monkeypatch):
    monkeypatch.delenv("ESTAT_API_KEY", raising=False)
    import asyncio

    with pytest.raises(RuntimeError):
        asyncio.run(fetch_growth_rates())
