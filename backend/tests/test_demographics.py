"""Demographics: suppressed cells null the FIELD but keep the ward."""

import json

import pytest

from core.boundary import json_safe
from services.demographics import TOKYO_WARDS, transform_estat

CHIYODA = "13101"


def _value(area, tab, cat01, raw, cat02="100"):
    return {"@area": area, "@tab": tab, "@cat01": cat01, "@cat02": cat02, "$": raw}


def _full_ward(area, total="66680", young="6000", elderly="10000"):
    return [
        _value(area, "020", "100", total),
        _value(area, "020", "110", young),
        _value(area, "020", "130", elderly),
    ]


def _by_region(records):
    return {r["region"]: r for r in records}


def test_healthy_ward_is_populated():
    record = _by_region(transform_estat(_full_ward(CHIYODA)))["千代田区"]
    assert record["population"] == 66680
    assert record["density"] == round(66680 / 11.66)
    assert record["ageGroups"]["young"] + record["ageGroups"]["working"] + record[
        "ageGroups"
    ]["elderly"] == 100


@pytest.mark.parametrize("suppressed", ["-", "***", "X", ""])
def test_suppressed_total_nulls_fields_but_keeps_the_ward(suppressed):
    """Aggregate data → null-not-drop: the ward must not vanish from the map."""
    records = transform_estat(_full_ward(CHIYODA, total=suppressed))
    by_region = _by_region(records)

    assert len(records) == len(TOKYO_WARDS)  # every ward still present
    assert "千代田区" in by_region
    assert by_region["千代田区"]["population"] is None
    assert by_region["千代田区"]["density"] is None


def test_missing_ward_entirely_still_appears():
    records = transform_estat([])  # e-Stat returned nothing at all
    assert len(records) == len(TOKYO_WARDS)
    assert all(r["population"] is None for r in records)


@pytest.mark.parametrize("suppressed", ["-", "***", "X"])
def test_response_with_suppressed_cells_is_valid_json(suppressed):
    payload = json_safe(
        {"data": transform_estat(_full_ward(CHIYODA, total=suppressed)), "isLive": True}
    )
    encoded = json.dumps(payload)
    assert "NaN" not in encoded
    parsed = json.loads(encoded, parse_constant=_reject)
    chiyoda = _by_region(parsed["data"])["千代田区"]
    assert chiyoda["population"] is None


def test_unguarded_transform_would_emit_invalid_json():
    """Fault injection: the same data WITHOUT the guard is unparseable.

    Mirrors what the TypeScript original did — parseFloat("-") -> NaN, the
    `total === 0` check misses it, and the value reaches serialization.
    """
    raw_nan = float("nan")
    encoded = json.dumps({"data": [{"region": "千代田区", "population": raw_nan}]})
    assert "NaN" in encoded
    with pytest.raises(ValueError):
        json.loads(encoded, parse_constant=_reject)


def test_working_share_is_clamped_not_negative():
    # Percentages that disagree with the counts must not produce a negative.
    values = _full_ward(CHIYODA) + [
        _value(CHIYODA, "105", "110", "70"),
        _value(CHIYODA, "105", "130", "60"),
    ]
    record = _by_region(transform_estat(values))["千代田区"]
    assert record["ageGroups"]["working"] >= 0


def _reject(constant_name):
    raise ValueError(f"invalid JSON constant: {constant_name}")
