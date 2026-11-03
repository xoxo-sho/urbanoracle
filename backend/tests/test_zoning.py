"""PR 6 of the real-data plan (RECON 2026-10-uo-real-data §9 row 6): 用途地域 from A55-24.

On main (506b880) the 用途地域 tab and the 災害 tab's 用途地域 mini-bar show
``sampleZoning`` — eight hand-typed categories, one composition for every
ward, labelled SAMPLE. Architect decisions (2026-11-03): 国土数値情報
都市計画決定情報データ A55-24 (2024年度版, the 23 wards' youto layers of
A55-24_13000_SHP.zip) is the sole source, committed as a snapshot per
Decision 9: built by ``etl/zoning.py`` from the committed excerpts under
tests/fixtures/zoning/, validated when the app starts, served by a new gated
route ``GET /api/v1/zoning`` with the ``sources`` envelope and the 23区
composition as ``total``. Per ward: the share of the ward's designated area
by type (clipped to the N03 ward polygon; shares sum to 100), the designated
share of the ward (never above 100), per type the area-weighted mean 容積率 /
建蔽率 with their min–max, and the 時点 read from the A55 data list's
データ時点年 column (way 1: no inferred date; four wards say 記載なし). Every
KSJ credit is the 加工 form with no editor name (Decision 12) and the A55
page's 注意事項 ride with the figures.

Nothing below is typed by hand: every expected figure comes from the builder
over the committed source files, or is recomputed here from them with the
standard library (the projection and the shoelace area are the builder's own
functions, exercised on the committed GeoJSON).
RED on main (506b880).
"""

from __future__ import annotations

import csv
import importlib
import importlib.util
import json
import os
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import core.authz as authz
from core import cache
from core.config import settings
from core.database import get_session
from main import app

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
FIXTURES = BACKEND / "tests" / "fixtures" / "zoning"
N03_FIXTURES = BACKEND / "tests" / "fixtures" / "stations"
SNAPSHOT = BACKEND / "data" / "zoning.json"
BUILDER = ROOT / "etl" / "zoning.py"
ROUTE = "/api/v1/zoning"

# The edition the Architect pinned (brief 2026-11-03); the meta file carries
# what was downloaded, so a different file fails here.
A55_SHA256 = "330895e56ab323cf4da8033de1f59b65400dde3feb149141b90eba5cfc090962"
A55_ID = "A55-24"
A55_YEAR = 2024
DATALIST_SHA256 = "e27222a72127a6e45b393d2ae1963d2827e8915276ec235013ad892cc337c21a"
DATALIST_URL = "https://nlftp.mlit.go.jp/ksj/gml/codelist/A55_R6_datalist.xlsx"
N03_SHA256 = "94f10b26256566db970dd74b09d614f059c1e8a432f9244ac9c4add76c32ff16"

KSJ = "https://nlftp.mlit.go.jp/ksj/"
EDITED_A55 = f"「国土数値情報（都市計画決定情報データ）」（国土交通省）（{KSJ}）を加工して作成"
EDITED_N03 = f"「国土数値情報（行政区域データ）」（国土交通省）（{KSJ}）を加工して作成"
# The A55 page's 【重要：データ利用時の注意事項】, word for word (2026-11-03).
NOTICES = [
    "本データは、建築確認申請や不動産重要事項説明等の手続に用いることを保証するものではなく、参考情報としての利用を想定しています。",
    "本データに含まれる地区・地域の範囲は、概ねの位置を示すものであり、実際の都市計画の決定範囲等と異なる場合があります。",
    "本データは、当該自治体の都市計画等の情報全てではないことがあります。",
    "本データは、最新の情報ではないことがあります。本データの時点については、公表自治体及び掲載データ一覧を参考にしてください。",
    "最新の正確な都市計画決定情報が必要な場合は、該当する地方公共団体の担当課までお問い合わせください。",
    "本データを用いて行う一切の行為（コンテンツを編集・加工等した情報を利用することを含む）及び本データの利用によって発生した直接または間接の損失、損害等について、国土交通省並びに原典資料提供元の地方公共団体は一切の責任を負いません。",
]
ASOF_MISSING_TEXT = "時点：国土数値情報の掲載データ一覧に記載なし"
ASOF_TOTAL_LABEL = "2021年7月1日〜2024年10月1日（4区は掲載データ一覧に記載なし）"
# What the data list pins (jiten gate, 2026-11-03): the ward's own row; 中央区
# from its ③ entry; 江戸川区 from the 東京都 row; four wards without a date.
ASOF_PINNED = {
    "13101": "2024-03-26",
    "13102": "2023-12-18",
    "13103": "2021-07-01",
    "13104": "2023-04-28",
    "13105": "2023-04-28",
    "13106": "2023-04-28",
    "13107": "2024-09-01",
    "13108": None,
    "13109": "2024-03-06",
    "13110": None,
    "13111": "2024-10-01",
    "13112": "2024-08-31",
    "13113": None,
    "13114": "2023-12-01",
    "13115": "2023-04-28",
    "13116": "2023-04-28",
    "13117": "2023-04-28",
    "13118": "2024-03-31",
    "13119": None,
    "13120": "2024-09-10",
    "13121": "2023-04-28",
    "13122": "2023-12-21",
    "13123": "2024-04-26",
}

TYPE_CODES = list(range(1, 14))
WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]
TOTAL_CODE = "13100"

ACTIVE = {"Authorization": "Bearer active-token"}
PENDING = {"Authorization": "Bearer pending-token"}
TOKENS = {
    "active-token": {"sub": "gipuid_zoning_active_0001", "email": "analyst@customcorp.jp", "email_verified": True},
    "pending-token": {"sub": "gipuid_zoning_pending_001", "email": "visitor@gmail.com", "email_verified": False},
}


# --- the builder over the committed source files ------------------------------------


def _builder():
    assert BUILDER.is_file(), f"no builder at {BUILDER}"
    spec = importlib.util.spec_from_file_location("zoning_etl", BUILDER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def etl():
    return _builder()


@pytest.fixture(scope="module")
def built(etl) -> dict:
    return etl.build()


@pytest.fixture(scope="module")
def meta() -> dict:
    return json.loads((FIXTURES / "ksj.meta.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def asof_table() -> dict:
    return json.loads((FIXTURES / "a55_datalist_asof_tokyo23.json").read_text(encoding="utf-8"))


def _excerpt() -> list[dict]:
    path = FIXTURES / "ksj_A55-24_youto_tokyo23.csv"
    assert path.is_file(), f"no excerpt at {path}"
    return list(csv.DictReader(path.read_text(encoding="utf-8").splitlines()))


def _recomputed() -> dict[str, dict]:
    """Per ward code (and the 23区 as 13100): the designated area, each type's
    clipped area, and the area-weighted 容積率 / 建蔽率 with their range —
    straight from the CSV without build()."""
    rows = _excerpt()
    out: dict[str, dict] = {}
    for code in WARD_CODES + [TOTAL_CODE]:
        mine = rows if code == TOTAL_CODE else [r for r in rows if r["code"] == code]
        by_type: dict[int, list[dict]] = defaultdict(list)
        for r in mine:
            if float(r["in_ward_m2"]) > 0:
                by_type[int(r["youto_code"])].append(r)
        designated = sum(float(r["in_ward_m2"]) for r in mine)
        types = {}
        for t, trs in by_type.items():
            m2 = sum(float(r["in_ward_m2"]) for r in trs)
            far = sum(float(r["in_ward_m2"]) * int(r["far"]) for r in trs) / m2
            bcr = sum(float(r["in_ward_m2"]) * int(r["bcr"]) for r in trs) / m2
            types[t] = {
                "m2": m2,
                "share": m2 / designated * 100,
                "n": len(trs),
                "far": {"mean": round(far, 1), "min": min(int(r["far"]) for r in trs), "max": max(int(r["far"]) for r in trs)},
                "bcr": {"mean": round(bcr, 1), "min": min(int(r["bcr"]) for r in trs), "max": max(int(r["bcr"]) for r in trs)},
            }
        out[code] = {"designated": designated, "polygons": len(mine), "types": types}
    return out


def test_fixture_is_the_pinned_edition(meta):
    assert meta["A55"]["id"] == A55_ID and meta["A55"]["sha256"] == A55_SHA256 and meta["A55"]["year"] == A55_YEAR
    assert "CC_BY_4.0" in meta["A55"]["licence"]
    assert meta["datalist"]["url"] == DATALIST_URL and meta["datalist"]["sha256"] == DATALIST_SHA256
    assert meta["N03"]["sha256"] == N03_SHA256
    stations_meta = json.loads((N03_FIXTURES / "ksj.meta.json").read_text(encoding="utf-8"))
    assert meta["N03"]["id"] == stations_meta["N03"]["id"]
    assert meta["A55"]["notices"] == NOTICES
    rows = _excerpt()
    assert len(rows) == meta["A55"]["rows_kept"]
    assert {r["code"] for r in rows} == set(WARD_CODES)
    for code in WARD_CODES:
        assert sum(1 for r in rows if r["code"] == code) == meta["A55"]["wards"][code]["polygons"]


def test_every_excerpt_row_is_a_valid_a55_polygon(etl):
    for r in _excerpt():
        where = f"{r['code']}#{r['idx']}"
        code = int(r["youto_code"])
        assert code in TYPE_CODES, where
        assert r["youto_name"] == etl.TYPE_NAMES[code], where
        assert int(r["far"]) > 0 and 0 < int(r["bcr"]) <= 100, where
        area, in_ward = float(r["area_m2"]), float(r["in_ward_m2"])
        assert area > 0 and 0 <= in_ward <= area + 1e-6, where
        if r["inside"] == "1":
            assert r["in_ward_m2"] == r["area_m2"], where


def test_the_committed_geojson_re_derives_the_csv_with_the_standard_library(etl):
    """The 千代田区 and 江戸川区 layers are committed as geometry: projected onto
    第IX系 by the builder's own formula and measured by the shoelace, every
    polygon's area_m2 equals the CSV's, attribute for attribute."""
    assert etl.verify() == []
    gj = json.loads((FIXTURES / "ksj_A55-24_youto_13101_13123.geojson").read_text(encoding="utf-8"))
    assert {f["properties"]["code"] for f in gj["features"]} == {"13101", "13123"}
    assert len(gj["features"]) == sum(1 for r in _excerpt() if r["code"] in ("13101", "13123"))


def test_the_n03_ward_areas_are_re_derived_from_pr4s_excerpt(etl, meta):
    areas = etl.ward_areas(N03_FIXTURES)
    assert set(areas) == set(WARD_CODES)
    for code in WARD_CODES:
        assert f"{areas[code]:.3f}" == meta["N03"]["ward_area_m2"][code], code
        assert areas[code] > 1e6, code
    assert meta["projection"]["check"]["max_abs_diff_m"] is not None
    assert meta["projection"]["check"]["max_abs_diff_m"] < 1e-3


def test_every_ward_has_its_composition_and_the_figures_are_the_recomputation(built):
    recomputed = _recomputed()
    assert [w["code"] for w in built["wards"]] == WARD_CODES
    for w in built["wards"]:
        mine = recomputed[w["code"]]
        assert w["polygons"] == mine["polygons"]
        assert abs(w["designatedM2"] - mine["designated"]) < 1e-3, w["name"]
        assert [t["code"] for t in w["types"]] == sorted(mine["types"]), w["name"]
        assert [t["code"] for t in w["types"]] == sorted(t["code"] for t in w["types"]), "A55 code order"
        for t in w["types"]:
            expected = mine["types"][t["code"]]
            assert abs(t["m2"] - expected["m2"]) < 1e-3, (w["name"], t["name"])
            assert abs(t["share"] - expected["share"]) < 1e-3, (w["name"], t["name"])
            assert t["n"] == expected["n"]
            assert t["far"] == expected["far"] and t["bcr"] == expected["bcr"], (w["name"], t["name"])
            assert t["far"]["min"] <= t["far"]["mean"] <= t["far"]["max"]
            assert t["bcr"]["min"] <= t["bcr"]["mean"] <= t["bcr"]["max"]


def test_per_ward_the_shares_sum_to_100_and_the_designated_share_never_exceeds_100(built):
    for w in built["wards"] + [built["total"]]:
        total = sum(t["share"] for t in w["types"])
        assert abs(total - 100) <= 0.5, (w["name"], total)
        assert 0 < w["designatedShare"] <= 100, (w["name"], w["designatedShare"])
        assert w["designatedM2"] <= w["wardM2"] * (1 + 1e-9), w["name"]
        assert abs(w["designatedShare"] - round(w["designatedM2"] / w["wardM2"] * 100, 2)) < 1e-6, w["name"]


def test_edogawa_is_about_84_percent_designated_and_chiyoda_about_100(built):
    by_name = {w["name"]: w for w in built["wards"]}
    assert 83.5 <= by_name["江戸川区"]["designatedShare"] <= 84.5
    assert by_name["千代田区"]["designatedShare"] >= 99.0


def test_the_23_ward_composition_is_the_area_weighted_sum_over_the_wards(built):
    total = built["total"]
    assert total["code"] == TOTAL_CODE and total["name"] == "東京23区"
    assert abs(total["designatedM2"] - sum(w["designatedM2"] for w in built["wards"])) < 1e-2
    assert abs(total["wardM2"] - sum(w["wardM2"] for w in built["wards"])) < 1e-2
    assert total["polygons"] == sum(w["polygons"] for w in built["wards"])
    for t in total["types"]:
        m2 = sum(wt["m2"] for w in built["wards"] for wt in w["types"] if wt["code"] == t["code"])
        assert abs(t["m2"] - m2) < 1e-2, t["name"]
        assert abs(t["share"] - m2 / total["designatedM2"] * 100) < 1e-3, t["name"]
    recomputed = _recomputed()[TOTAL_CODE]
    for t in total["types"]:
        assert t["far"] == recomputed["types"][t["code"]]["far"], t["name"]
        assert t["bcr"] == recomputed["types"][t["code"]]["bcr"], t["name"]


def test_the_asof_table_pins_what_the_data_list_says(asof_table):
    assert asof_table["source"]["url"] == DATALIST_URL and asof_table["source"]["sha256"] == DATALIST_SHA256
    assert asof_table["tokyo"]["rowCode"] == "130001" and asof_table["tokyo"]["date"] == "2024-04-26"
    by_code = {e["code"]: e for e in asof_table["wards"]}
    assert list(by_code) == WARD_CODES
    for code, expected in ASOF_PINNED.items():
        assert by_code[code]["date"] == expected, (code, by_code[code])
        assert by_code[code]["cells"]["asOf"] is None or isinstance(by_code[code]["cells"]["asOf"], str)
    assert by_code["13102"]["basis"] == "asof_itemised" and "③" in by_code["13102"]["cells"]["asOf"]
    assert by_code["13123"]["basis"] == "tokyo_row" and by_code["13123"]["cells"]["asOf"] == "都に準ずる"
    assert by_code["13123"]["note"] == "都に準ずる"
    for code in ("13108", "13110", "13113", "13119"):
        assert by_code[code]["basis"] == "none"


def test_each_wards_asof_equals_the_table_and_the_four_wards_say_not_listed(built, asof_table):
    by_code = {e["code"]: e for e in asof_table["wards"]}
    for w in built["wards"]:
        expected = by_code[w["code"]]
        assert w["asOf"]["date"] == expected["date"], w["name"]
        assert w["asOf"]["basis"] == expected["basis"]
        if expected["date"] is None:
            assert w["asOf"]["text"] == ASOF_MISSING_TEXT, w["name"]
            assert not any(ch.isdigit() for ch in w["asOf"]["label"]), w["name"]
        else:
            y, m, d = (int(p) for p in expected["date"].split("-"))
            assert w["asOf"]["label"].startswith(f"{y}年{m}月{d}日"), w["name"]
            assert w["asOf"]["text"] == f"時点：{w['asOf']['label']}"
    by_name = {w["name"]: w for w in built["wards"]}
    assert by_name["江戸川区"]["asOf"]["text"] == "時点：2024年4月26日（都に準ずる）"
    assert by_name["中央区"]["asOf"]["text"] == "時点：2023年12月18日"
    assert by_name["港区"]["asOf"]["text"] == "時点：2021年7月1日"
    assert by_name["大田区"]["asOf"]["text"] == "時点：2024年10月1日"
    total = built["total"]["asOf"]
    assert total["date"] is None
    assert total["from"] == "2021-07-01" and total["to"] == "2024-10-01"
    assert total["missing"] == ["13108", "13110", "13113", "13119"]
    assert total["label"] == ASOF_TOTAL_LABEL
    assert total["text"] == f"時点：{ASOF_TOTAL_LABEL}"


def test_builder_names_the_edition_the_sources_the_licence_the_credits_and_the_notices(built, meta):
    assert built["year"] == A55_YEAR and built["region"] == "東京23区"
    for key in ("zoning", "wards", "asOf"):
        assert built["sources"][key]["table"].strip() and built["sources"][key]["label"].strip()
    assert built["sources"]["zoning"]["year"] == A55_YEAR and built["sources"]["zoning"]["table"] == A55_ID
    assert "2024年度" in built["sources"]["zoning"]["label"] and "令和6年度" in built["sources"]["zoning"]["label"]
    assert built["sources"]["wards"]["table"] == meta["N03"]["id"]
    assert built["sources"]["asOf"]["table"] == "A55_R6_datalist.xlsx"
    assert built["credit"]["edited_a55"] == EDITED_A55
    assert built["credit"]["edited_n03"] == EDITED_N03
    assert built["credit"]["source"].startswith("出典：国土交通省国土数値情報ダウンロードサイト")
    assert "をもとに" not in built["credit"]["edited_a55"]
    assert built["notices"] == NOTICES
    assert NOTICES[3] in built["notices"], "注意事項 bullet 4 (the 時点 bullet) is shown"
    assert built["licence"]["url"] == "https://nlftp.mlit.go.jp/ksj/other/agreement.html"
    assert built["inputs"]["ksj_A55-24_youto_tokyo23.csv"]["cut_from"]["sha256"] == A55_SHA256
    assert built["inputs"]["a55_datalist_asof_tokyo23.json"]["derived_from"]["sha256"] == DATALIST_SHA256
    assert built["inputs"]["ksj_N03-20260101_tokyo23.geojson"]["cut_from"]["sha256"] == N03_SHA256
    assert [t["code"] for t in built["types"]] == TYPE_CODES
    for key in ("share", "designated", "far", "asOf", "types", "area"):
        assert built["notes"][key].strip()


# --- the snapshot ------------------------------------------------------------------


def _snapshot() -> dict:
    assert SNAPSHOT.is_file(), f"no snapshot at {SNAPSHOT}"
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def test_snapshot_is_a_fresh_build_from_the_committed_source_files(built):
    assert built == _snapshot()


def test_nothing_in_the_backend_fetches_the_network_for_zoning():
    service = BACKEND / "services" / "zoning.py"
    assert service.is_file(), "no services/zoning.py — the route must read the committed snapshot"
    text = service.read_text(encoding="utf-8")
    assert "httpx" not in text and "shapely" not in text and "shapefile" not in text


# --- the route -------------------------------------------------------------------


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: TOKENS.get(tok))
    cache.clear()

    def _session_override():
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    yield TestClient(app)
    app.dependency_overrides.clear()
    cache.clear()


def _client_shape(composition: dict) -> dict:
    """The route's record for one composition: `name` becomes `region`, the
    data-list cells stay in the snapshot."""
    out = {k: v for k, v in composition.items() if k != "name"}
    out["region"] = composition["name"]
    out["asOf"] = {k: v for k, v in composition["asOf"].items() if k != "cells"}
    return out


def test_route_is_401_without_a_token_and_403_pending(client):
    assert client.get(ROUTE).status_code == 401
    resp = client.get(ROUTE, headers=PENDING)
    assert resp.status_code == 403
    assert resp.json() == {"status": "pending_activation"}


def test_route_serves_the_23_wards_and_the_23_ward_composition(client, built):
    resp = client.get(ROUTE, headers=ACTIVE)
    assert resp.status_code == 200, resp.text[:300]
    body = resp.json()
    assert body["status"] == "ok" and body["isLive"] is True
    assert "unavailable" not in body and "fetchedAt" not in body
    rows = body["data"]
    assert [r["code"] for r in rows] == WARD_CODES
    by_code = {w["code"]: w for w in built["wards"]}
    for r in rows:
        assert r == _client_shape(by_code[r["code"]]), r["region"]
        assert abs(sum(t["share"] for t in r["types"]) - 100) <= 0.5
        assert r["designatedShare"] <= 100
    assert body["total"] == _client_shape(built["total"])
    assert body["total"]["region"] == "東京23区"


def test_route_envelope_names_the_edition_and_tables_of_the_figures(client, built):
    body = client.get(ROUTE, headers=ACTIVE).json()
    sources = body.get("sources")
    assert isinstance(sources, dict), "no `sources` in the envelope"
    assert sources == built["sources"]
    assert sources["zoning"]["year"] == A55_YEAR and sources["zoning"]["table"] == A55_ID


def test_route_does_not_touch_the_network(client, monkeypatch):
    import httpx

    def explode(*args, **kwargs):
        raise AssertionError("the zoning route serves a committed file, never an upstream")

    monkeypatch.setattr(httpx.AsyncClient, "__init__", explode, raising=False)
    monkeypatch.setattr(httpx, "get", explode, raising=False)
    assert client.get(ROUTE, headers=ACTIVE).status_code == 200


# --- startup validation ---------------------------------------------------------------


def _import_main_with(path: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "ZONING_PATH": str(path)}
    return subprocess.run(
        [sys.executable, "-c", "import main"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=60
    )


def test_startup_refuses_a_missing_snapshot(tmp_path):
    proc = _import_main_with(tmp_path / "missing.json")
    assert proc.returncode != 0, "the app started without its zoning snapshot"
    assert "zoning" in proc.stderr


def _ward(s: dict, name: str) -> dict:
    return next(w for w in s["wards"] if w["name"] == name)


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda s: s["wards"].clear(), id="no wards"),
        pytest.param(lambda s: s["wards"].remove(_ward(s, "江戸川区")), id="a ward missing"),
        pytest.param(lambda s: _ward(s, "千代田区")["types"][0].__setitem__("share", 90.0), id="shares not summing to 100"),
        pytest.param(lambda s: _ward(s, "千代田区").__setitem__("designatedShare", 100.5), id="designated share above 100"),
        pytest.param(lambda s: _ward(s, "江戸川区").__setitem__("designatedM2", _ward(s, "江戸川区")["wardM2"] * 1.01), id="designated area larger than the ward"),
        pytest.param(lambda s: _ward(s, "江戸川区")["types"][0].__setitem__("code", 14), id="a type code outside 1-13"),
        pytest.param(lambda s: _ward(s, "江戸川区")["types"][0].__setitem__("name", "第1種低層住居専用地域"), id="a type name not the codelist's"),
        pytest.param(lambda s: _ward(s, "江戸川区")["types"][0]["far"].__setitem__("mean", 9999), id="a mean outside its range"),
        pytest.param(lambda s: _ward(s, "江東区")["asOf"].__setitem__("text", "時点：2024年4月26日"), id="a date claimed for a ward the list does not date"),
        pytest.param(lambda s: _ward(s, "千代田区")["asOf"].__setitem__("date", "2024/03/26"), id="a 時点 that is not an ISO date"),
        pytest.param(lambda s: s["total"].__setitem__("designatedM2", 1.0), id="the 23区 total not the sum of the wards"),
        pytest.param(lambda s: s["sources"].pop("zoning"), id="the zoning source missing"),
        pytest.param(lambda s: s["credit"].pop("edited_a55"), id="the 加工 credit missing"),
        pytest.param(lambda s: s["credit"].__setitem__("edited_a55", "「国土数値情報（都市計画決定情報データ）」（国土交通省）をもとにX社作成"), id="an editor name in the credit"),
        pytest.param(lambda s: s["notices"].pop(3), id="注意事項 bullet 4 missing"),
    ],
)
def test_startup_refuses_a_malformed_snapshot(tmp_path, mutate):
    snapshot = _snapshot()
    mutate(snapshot)
    bad = tmp_path / "zoning.json"
    bad.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    proc = _import_main_with(bad)
    assert proc.returncode != 0, "the app started on a malformed snapshot"
    assert "zoning" in proc.stderr


def test_startup_accepts_the_committed_snapshot():
    proc = _import_main_with(SNAPSHOT)
    assert proc.returncode == 0, proc.stderr[-800:]


def test_validator_rejects_a_non_finite_figure():
    zoning = importlib.import_module("services.zoning")
    snapshot = _snapshot()
    _ward(snapshot, "千代田区")["types"][0]["share"] = float("nan")
    with pytest.raises(zoning.SnapshotError):
        zoning.validate(snapshot)


def test_snapshot_path_defaults_to_backend_data(monkeypatch):
    monkeypatch.delenv("ZONING_PATH", raising=False)
    assert settings.ZONING_PATH == BACKEND / "data" / "zoning.json"
    monkeypatch.setenv("ZONING_PATH", "/elsewhere/zoning.json")
    assert settings.ZONING_PATH == Path("/elsewhere/zoning.json")
