"""Transport reads the committed GeoJSON from disk — never over HTTP."""

import json

import pytest

from core.config import settings
from services.transport import assign_ward, load_stations, stations_path, transform_stations


def test_the_committed_geojson_is_where_we_expect():
    assert stations_path().is_file(), f"missing {stations_path()}"


def test_load_stations_performs_no_network_io(monkeypatch):
    """Fault injection on the transport change: any HTTP call fails the test.

    The Next route fetched this same file from its own origin via
    VERCEL_URL; if that pattern ever returns, these stubs turn it red.
    """
    import httpx

    def explode(*args, **kwargs):
        raise AssertionError("transport must read the local file, not use HTTP")

    monkeypatch.setattr(httpx, "get", explode, raising=False)
    monkeypatch.setattr(httpx.Client, "request", explode, raising=False)
    monkeypatch.setattr(httpx.AsyncClient, "request", explode, raising=False)

    stations = load_stations()
    assert len(stations) == 50


def test_stations_are_sorted_by_line_count_desc():
    geojson = {
        "features": [
            _feature("A", 2, 139.75, 35.69),
            _feature("B", 9, 139.76, 35.68),
            _feature("C", 5, 139.77, 35.67),
        ]
    }
    names = [s["name"] for s in transform_stations(geojson)]
    assert names == ["B駅", "C駅", "A駅"]


def test_operator_names_are_rewritten():
    # Line strings copied verbatim from public/data/tokyo-stations.geojson —
    # an invented fixture here would test a format the source never emits.
    geojson = {
        "features": [
            _feature(
                "東京",
                3,
                139.7671,
                35.6812,
                lines=["東日本旅客鉄道 山手線", "東京地下鉄 4号線丸ノ内線", "東京都 10号線新宿線"],
            )
        ]
    }
    lines = transform_stations(geojson)[0]["lines"]
    assert lines == ["JR 山手線", "メトロ 4号線丸ノ内線", "都営 10号線新宿線"]


def test_coordinates_are_read_lng_lat_from_geojson():
    station = transform_stations({"features": [_feature("X", 1, 139.7671, 35.6812)]})[0]
    assert (station["lat"], station["lng"]) == (35.6812, 139.7671)


@pytest.mark.parametrize(
    ("lat", "lng", "expected"),
    [
        (35.6940, 139.7536, "千代田区"),
        (35.6640, 139.6982, "渋谷区"),
        (35.0000, 139.0000, None),  # outside every bbox
    ],
)
def test_ward_assignment_is_a_pure_bbox_lookup(lat, lng, expected):
    assert assign_ward(lat, lng) == expected


def test_real_file_transform_is_valid_json_and_shaped_right():
    with stations_path().open(encoding="utf-8") as fh:
        geojson = json.load(fh)
    assert geojson["type"] == "FeatureCollection"
    stations = transform_stations(geojson)
    assert len(stations) == 50
    assert all(isinstance(s["lines"], list) for s in stations)
    encoded = json.dumps({"data": stations})
    assert "NaN" not in encoded


def test_data_dir_falls_back_to_repo_public_data(monkeypatch):
    monkeypatch.delenv("DATA_DIR", raising=False)
    monkeypatch.delenv("STATIC_DIR", raising=False)
    assert settings.DATA_DIR.name == "data"
    assert settings.DATA_DIR.parent.name == "public"


def test_data_dir_follows_static_dir_in_the_container(monkeypatch):
    monkeypatch.delenv("DATA_DIR", raising=False)
    monkeypatch.setenv("STATIC_DIR", "/app/static")
    assert str(settings.DATA_DIR) == "/app/static/data"


def _feature(name, line_count, lng, lat, lines=None):
    return {
        "properties": {"name": name, "lineCount": line_count, "lines": lines or []},
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
    }
