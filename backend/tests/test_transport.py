"""Transport serves the committed stations snapshot (real-data plan PR 4) —
never a network call, never the bounding-box table that assigned wards on main."""

from pathlib import Path

from core.config import settings
from services import transport

MINIMAL = {
    "stations": [
        {
            "code": "000001",
            "name": "東京",
            "ward": "千代田区",
            "wardCode": "13101",
            "lat": 35.681,
            "lng": 139.767,
            "dailyPassengers": 300,
            "operators": [
                {"name": "東日本旅客鉄道", "lines": ["山手線", "中央線"], "rows": 2, "figureRows": 1, "passengers": 200},
                {"name": "東京地下鉄", "lines": ["4号線丸ノ内線"], "rows": 1, "figureRows": 1, "passengers": 100},
                {"name": "東京都", "lines": ["10号線新宿線"], "rows": 1, "figureRows": 0, "passengers": None},
            ],
        },
        {
            "code": "000002",
            "name": "ゆりかもめ駅",
            "ward": "港区",
            "wardCode": "13103",
            "lat": 35.63,
            "lng": 139.77,
            "dailyPassengers": None,
            "operators": [{"name": "ゆりかもめ", "lines": ["東京臨海新交通臨海線"], "rows": 1, "figureRows": 0, "passengers": None}],
            "note": "乗降客数2024は国土数値情報 S12 で他路線駅の行に記載（重複コード2）",
        },
    ],
    "sources": {"ridership": {"year": 2024, "table": "S12-25", "label": "x"}},
}


def test_snapshot_path_defaults_to_backend_data(monkeypatch):
    monkeypatch.delenv("STATIONS_PATH", raising=False)
    assert settings.STATIONS_PATH == Path(transport.__file__).resolve().parents[1] / "data" / "stations.json"
    monkeypatch.setenv("STATIONS_PATH", "/elsewhere/stations.json")
    assert settings.STATIONS_PATH == Path("/elsewhere/stations.json")


def test_line_labels_rewrite_the_three_big_operators_and_keep_the_rest():
    assert transport.line_label("東日本旅客鉄道", "山手線") == "JR 山手線"
    assert transport.line_label("東京地下鉄", "4号線丸ノ内線") == "メトロ 4号線丸ノ内線"
    assert transport.line_label("東京都", "10号線新宿線") == "都営 10号線新宿線"
    assert transport.line_label("ゆりかもめ", "東京臨海新交通臨海線") == "ゆりかもめ 東京臨海新交通臨海線"


def test_rows_are_the_client_records_of_the_snapshot_stations():
    rows = transport.rows(MINIMAL)
    assert [r["id"] for r in rows] == ["s12-000001-13101", "s12-000002-13103"]
    tokyo = rows[0]
    assert tokyo["name"] == "東京駅"
    assert (tokyo["lat"], tokyo["lng"]) == (35.681, 139.767)
    assert tokyo["type"] == "train"
    assert tokyo["dailyPassengers"] == 300
    assert tokyo["lines"] == ["JR 山手線", "JR 中央線", "メトロ 4号線丸ノ内線", "都営 10号線新宿線"]
    assert tokyo["ward"] == "千代田区" and tokyo["wardCode"] == "13101"
    assert tokyo["operators"] == [
        {"name": "東日本旅客鉄道", "lines": ["山手線", "中央線"], "passengers": 200},
        {"name": "東京地下鉄", "lines": ["4号線丸ノ内線"], "passengers": 100},
        {"name": "東京都", "lines": ["10号線新宿線"], "passengers": None},
    ]
    assert "note" not in tokyo
    other = rows[1]
    # A station the source counts on another row: None, never 0, and it says why.
    assert other["dailyPassengers"] is None
    assert other["note"].startswith("乗降客数2024は")


def test_rows_never_add_駅_twice():
    assert transport.rows(MINIMAL)[1]["name"] == "ゆりかもめ駅"


def test_sources_are_copied_not_shared():
    sources = transport.sources(MINIMAL)
    assert sources == MINIMAL["sources"]
    sources["ridership"]["year"] = 1999
    assert MINIMAL["sources"]["ridership"]["year"] == 2024


def test_loading_the_committed_snapshot_performs_no_network_io(monkeypatch):
    import httpx

    def explode(*args, **kwargs):
        raise AssertionError("transport must read the local snapshot, not use HTTP")

    monkeypatch.setattr(httpx, "get", explode, raising=False)
    monkeypatch.setattr(httpx.Client, "request", explode, raising=False)
    monkeypatch.setattr(httpx.AsyncClient, "request", explode, raising=False)
    snapshot = transport.get(settings.STATIONS_PATH)
    assert len(snapshot["stations"]) > 0
