"""ODPT ridership: the two-hop join and its three traps.

Every test here guards a failure mode that is SILENT in production — a wrong
join, a mixed definition, or a fabricated zero all render as a plausible
number with no error anywhere.
"""

import json

import pytest

from core.boundary import json_safe
from services.odpt import (
    build_name_to_urn,
    build_ridership,
    build_urn_to_passengers,
    latest_survey_year,
    normalize_station_name,
)
from services.transport import transform_stations

STATIONS = [
    {"dc:title": "霞ケ関", "owl:sameAs": "odpt.Station:TokyoMetro.Marunouchi.Kasumigaseki"},
    {"dc:title": "大手町", "owl:sameAs": "odpt.Station:TokyoMetro.Marunouchi.Otemachi"},
    {"dc:title": "西ケ原", "owl:sameAs": "odpt.Station:TokyoMetro.Namboku.Nishigahara"},
    {"dc:title": "新宿", "owl:sameAs": "odpt.Station:Toei.Shinjuku.Shinjuku"},
    {"dc:title": "国際展示場", "owl:sameAs": "odpt.Station:TWR.Rinkai.KokusaiTenjijo"},
]

SURVEYS = [
    {
        "odpt:station": ["odpt.Station:TokyoMetro.Marunouchi.Kasumigaseki"],
        "odpt:includeAlighting": True,
        "odpt:passengerSurveyObject": [
            {"odpt:surveyYear": 2023, "odpt:passengerJourneys": 100000},
            {"odpt:surveyYear": 2024, "odpt:passengerJourneys": 123456},
        ],
    },
    {
        "odpt:station": ["odpt.Station:TokyoMetro.Marunouchi.Otemachi"],
        "odpt:includeAlighting": True,
        "odpt:passengerSurveyObject": [{"odpt:surveyYear": 2024, "odpt:passengerJourneys": 200000}],
    },
    {
        "odpt:station": ["odpt.Station:TokyoMetro.Namboku.Nishigahara"],
        "odpt:includeAlighting": True,
        "odpt:passengerSurveyObject": [{"odpt:surveyYear": 2024, "odpt:passengerJourneys": 7000}],
    },
    {
        # Boardings only — a DIFFERENT definition, must not be used.
        "odpt:station": ["odpt.Station:TWR.Rinkai.KokusaiTenjijo"],
        "odpt:includeAlighting": False,
        "odpt:passengerSurveyObject": [{"odpt:surveyYear": 2024, "odpt:passengerJourneys": 35085}],
    },
]


# ---------------------------------------------------------------------------
# Trap 2: kana normalization
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("ours", "odpt_name"),
    [
        ("霞ヶ関", "霞ケ関"),   # small ヶ vs katakana ケ — the observed mismatch
        ("西ヶ原", "西ケ原"),
        ("南阿佐ヶ谷", "南阿佐ケ谷"),
    ],
)
def test_kana_variants_normalize_to_the_same_key(ours, odpt_name):
    assert normalize_station_name(ours) == normalize_station_name(odpt_name)


def test_trailing_eki_is_stripped_but_not_internal_eki():
    # Our GeoJSON writes "東京駅"; ODPT writes "東京".
    assert normalize_station_name("東京駅") == normalize_station_name("東京")
    # 大塚駅前 is a tram stop whose name CONTAINS 駅 — stripping it everywhere
    # would turn it into 大塚前 and match the wrong stop.
    assert normalize_station_name("大塚駅前") == "大塚駅前"


def test_kasumigaseki_joins_after_normalization():
    """The exact-match join drops this station silently; normalization saves it."""
    ridership = build_ridership(STATIONS, SURVEYS)
    assert ridership[normalize_station_name("霞ヶ関")] == 123456


# ---------------------------------------------------------------------------
# Trap 1: the two-hop URN join
# ---------------------------------------------------------------------------


def test_name_to_urn_uses_the_station_master():
    mapping = build_name_to_urn(STATIONS)
    assert mapping[normalize_station_name("霞ヶ関")].startswith("odpt.Station:")


def test_latest_survey_year_wins():
    """A station surveyed repeatedly must report the newest figure."""
    assert build_ridership(STATIONS, SURVEYS)[normalize_station_name("霞ヶ関")] == 123456


def test_latest_survey_year_reported_for_provenance():
    assert latest_survey_year(SURVEYS) == 2024


# ---------------------------------------------------------------------------
# Trap 3: one definition only
# ---------------------------------------------------------------------------


def test_boardings_only_records_are_excluded():
    """includeAlighting=False is 乗車人員, a different measure — not mixed in."""
    urns = build_urn_to_passengers(SURVEYS)
    assert "odpt.Station:TWR.Rinkai.KokusaiTenjijo" not in urns
    assert normalize_station_name("国際展示場") not in build_ridership(STATIONS, SURVEYS)


def test_every_returned_figure_shares_one_definition():
    kept = build_urn_to_passengers(SURVEYS)
    for survey in SURVEYS:
        if survey["odpt:includeAlighting"] is not True:
            for urn in survey["odpt:station"]:
                assert urn not in kept


# ---------------------------------------------------------------------------
# No-data vs zero
# ---------------------------------------------------------------------------


def _feature(name, line_count, lng=139.76, lat=35.68):
    return {
        "properties": {"name": name, "lineCount": line_count, "lines": []},
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
    }


def test_uncovered_station_is_null_not_zero():
    """JR/Keio/Odakyu are absent from ODPT. 0 would claim they carry nobody."""
    geo = {"features": [_feature("品川", 9), _feature("大手町", 8)]}
    out = transform_stations(geo, build_ridership(STATIONS, SURVEYS))
    by_name = {s["name"]: s["dailyPassengers"] for s in out}
    assert by_name["品川駅"] is None
    assert by_name["大手町駅"] == 200000


def test_boardings_only_station_is_null_not_zero():
    geo = {"features": [_feature("国際展示場", 3)]}
    out = transform_stations(geo, build_ridership(STATIONS, SURVEYS))
    assert out[0]["dailyPassengers"] is None


def test_no_ridership_at_all_yields_all_null():
    geo = {"features": [_feature("大手町", 8), _feature("品川", 9)]}
    out = transform_stations(geo, None)
    assert all(s["dailyPassengers"] is None for s in out)
    assert not any(s["dailyPassengers"] == 0 for s in out)


def test_null_ridership_serializes_as_valid_json():
    geo = {"features": [_feature("品川", 9)]}
    payload = json_safe({"data": transform_stations(geo, {}), "isLive": False})
    encoded = json.dumps(payload)
    assert "NaN" not in encoded
    assert json.loads(encoded)["data"][0]["dailyPassengers"] is None
