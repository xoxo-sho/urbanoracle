"""Demographics: suppressed cells null the FIELD but keep the ward.

Since real-data plan PR 2 the figures come from three tables of the 令和7年
国勢調査 人口等基本集計（確報）— population (0004065881), 不詳補完値 age shares
(0004066221) and the growth rate (0004065882) — and density is the population
over the 面積調 area pinned in TOKYO_WARDS. The rows below have the shape of
those tables' VALUE rows; the published figures themselves are guarded in
test_census_2025.py from the committed source files.
"""

import json

import pytest

from core.boundary import json_safe
from services.demographics import (
    AGE_CODES,
    TOKYO_WARDS,
    parse_age_shares,
    parse_population,
    transform_census,
)

CHIYODA = "13101"
CHIYODA_AREA_KM2 = TOKYO_WARDS[CHIYODA][1]


def _population_row(area, raw, sex="0"):
    return {"@tab": "2025_01", "@cat01": sex, "@area": area, "@time": "2025000000", "$": raw}


def _share_row(area, age_code, raw, nationality="0", sex="0"):
    return {
        "@tab": "2025_42",
        "@cat01": nationality,
        "@cat02": sex,
        "@cat03": age_code,
        "@area": area,
        "@time": "2025000000",
        "$": raw,
    }


def _shares(area, young="12.94100", working="70.81787", elderly="16.24113"):
    return [
        _share_row(area, AGE_CODES["young"], young),
        _share_row(area, AGE_CODES["working"], working),
        _share_row(area, AGE_CODES["elderly"], elderly),
    ]


def _records(population_rows, share_rows, growth=None):
    return transform_census(parse_population(population_rows), parse_age_shares(share_rows), growth)


def _by_region(records):
    return {r["region"]: r for r in records}


def test_healthy_ward_is_populated():
    record = _by_region(_records([_population_row(CHIYODA, "66270")], _shares(CHIYODA)))["千代田区"]
    assert record["population"] == 66270
    assert record["density"] == round(66270 / CHIYODA_AREA_KM2)
    # Each share is the table's value rounded to a whole percent.
    assert record["ageGroups"] == {"young": 13, "working": 71, "elderly": 16}


def test_only_the_total_rows_count():
    """男 / 女 rows and うち日本人 rows are in the tables; only 総数 / 国籍総数 are ours."""
    population_rows = [
        _population_row(CHIYODA, "66270"),
        _population_row(CHIYODA, "33174", sex="1"),
        _population_row(CHIYODA, "33096", sex="2"),
    ]
    share_rows = _shares(CHIYODA) + [_share_row(CHIYODA, AGE_CODES["young"], "99", nationality="1")]
    record = _by_region(_records(population_rows, share_rows))["千代田区"]
    assert record["population"] == 66270
    assert record["ageGroups"]["young"] == 13


@pytest.mark.parametrize("suppressed", ["-", "***", "X", ""])
def test_suppressed_total_nulls_fields_but_keeps_the_ward(suppressed):
    """Aggregate data → null-not-drop: the ward must not vanish from the map."""
    records = _records([_population_row(CHIYODA, suppressed)], _shares(CHIYODA))
    by_region = _by_region(records)

    assert len(records) == len(TOKYO_WARDS)  # every ward still present
    assert "千代田区" in by_region
    assert by_region["千代田区"]["population"] is None
    assert by_region["千代田区"]["density"] is None
    # The shares came from another table and stand on their own.
    assert by_region["千代田区"]["ageGroups"]["elderly"] == 16


@pytest.mark.parametrize("suppressed", ["-", "***", "X", ""])
def test_suppressed_share_nulls_that_share_only(suppressed):
    records = _records([_population_row(CHIYODA, "66270")], _shares(CHIYODA, elderly=suppressed))
    record = _by_region(records)["千代田区"]
    assert record["ageGroups"] == {"young": 13, "working": 71, "elderly": None}
    assert record["population"] == 66270


def test_missing_ward_entirely_still_appears():
    records = _records([], [])  # e-Stat returned nothing at all
    assert len(records) == len(TOKYO_WARDS)
    assert all(r["population"] is None for r in records)
    assert all(r["ageGroups"] == {"young": None, "working": None, "elderly": None} for r in records)


@pytest.mark.parametrize("suppressed", ["-", "***", "X"])
def test_response_with_suppressed_cells_is_valid_json(suppressed):
    payload = json_safe(
        {"data": _records([_population_row(CHIYODA, suppressed)], _shares(CHIYODA)), "isLive": True}
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


def test_shares_are_kept_within_0_and_100():
    # A share outside 0–100 cannot be a share; it is clamped, never negative.
    record = _by_region(_records([_population_row(CHIYODA, "66270")], _shares(CHIYODA, working="104.2", young="-3")))["千代田区"]
    assert record["ageGroups"]["working"] == 100
    assert record["ageGroups"]["young"] == 0


def _reject(constant_name):
    raise ValueError(f"invalid JSON constant: {constant_name}")
