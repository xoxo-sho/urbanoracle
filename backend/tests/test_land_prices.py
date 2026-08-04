"""Land prices: non-finite prices are dropped, coordinates are deterministic."""

import json

import pytest

from core.boundary import json_safe
from services.land_prices import deterministic_offset, transform_ward_records

WARD = "13101"


def _record(price, area="100", district="丸の内一丁目"):
    return {
        "Municipality": "千代田区",
        "DistrictName": district,
        "TradePrice": price,
        "Area": area,
        "CityPlanning": "商業地域",
        "Use": "事務所",
    }


def test_valid_record_becomes_a_point():
    points = transform_ward_records(WARD, [_record("100000000", "100")])
    assert len(points) == 1
    assert points[0]["price"] == 1_000_000


@pytest.mark.parametrize("bad_price", ["非公表", "", "N/A", "***", None])
def test_non_numeric_price_is_dropped(bad_price):
    """Point data → drop. NaN <= 0 is False, so the original guard let these
    through as a point with a null price."""
    points = transform_ward_records(WARD, [_record(bad_price)])
    assert points == []


@pytest.mark.parametrize("bad_area", ["0", "非公表", ""])
def test_unusable_area_is_dropped_not_coerced(bad_area):
    points = transform_ward_records(WARD, [_record("100000000", bad_area)])
    assert points == []


def test_comma_formatted_price_is_parsed_not_truncated():
    # parseInt("1,000,000") returned 1 in the JS original.
    points = transform_ward_records(WARD, [_record("100,000,000", "100")])
    assert points[0]["price"] == 1_000_000


def test_response_with_bad_record_is_valid_json():
    records = [_record("非公表", district="A"), _record("100000000", district="B")]
    payload = json_safe({"data": transform_ward_records(WARD, records), "isLive": True})
    encoded = json.dumps(payload)
    assert "NaN" not in encoded
    parsed = json.loads(encoded, parse_constant=_reject)
    assert len(parsed["data"]) == 1  # the bad record was dropped, not nulled


def test_coordinates_are_deterministic_across_calls():
    first = transform_ward_records(WARD, [_record("100000000")])
    second = transform_ward_records(WARD, [_record("100000000")])
    assert (first[0]["lat"], first[0]["lng"]) == (second[0]["lat"], second[0]["lng"])


def test_different_districts_get_different_offsets():
    points = transform_ward_records(
        WARD,
        [_record("100000000", district="丸の内一丁目"), _record("200000000", district="大手町一丁目")],
    )
    assert (points[0]["lat"], points[0]["lng"]) != (points[1]["lat"], points[1]["lng"])


def test_offset_stays_within_the_documented_range():
    for district in ("A", "B", "C", "丸の内", "大手町", "神田"):
        for axis in ("lat", "lng"):
            assert abs(deterministic_offset(f"{WARD}|{district}", axis)) <= 0.0075


def test_points_stay_near_the_ward_centroid():
    points = transform_ward_records(WARD, [_record("100000000")])
    assert abs(points[0]["lat"] - 35.6940) <= 0.0075
    assert abs(points[0]["lng"] - 139.7536) <= 0.0075


def test_duplicate_districts_are_deduplicated():
    records = [_record("100000000", district="同じ町"), _record("200000000", district="同じ町")]
    assert len(transform_ward_records(WARD, records)) == 1


def test_at_most_five_points_per_ward():
    records = [_record("100000000", district=f"町{i}") for i in range(20)]
    assert len(transform_ward_records(WARD, records)) == 5


def _reject(constant_name):
    raise ValueError(f"invalid JSON constant: {constant_name}")
