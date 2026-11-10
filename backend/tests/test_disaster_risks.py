"""PR 7 of the real-data plan (RECON 2026-10-uo-real-data §9 row 7): 災害 from measured sources.

On main (deeb49d) ``GET /api/v1/disaster-risks`` answers the curated sample
set (12 hand-typed records with a ``level`` 1–5) with ``isLive`` false, and the
LP hero reads three sample sets. Architect decisions (2026-11-05):

- 地震 (decision 1): 東京都「地震に関する地域危険度測定調査（第9回）」 all2.csv —
  per ward the 町丁目 count per rank 1–5 for 総合危険度, 建物倒壊危険度 and
  火災危険度, stated as a relative evaluation among the 都's 町丁目. J-SHIS is
  not used. The licence basis rides in the source block.
- K2 (decision 8): 「総合危険度ランク5の町丁目」, the count with its denominator.
- 洪水: KSJ A31a-25 想定最大規模 including the 関東地方整備局 zip (国管理河川),
  per ward the share of the N03 ward area by depth class, the deepest class
  winning where rivers overlap.
- 土砂: KSJ A33-25, per ward the counts of 警戒区域 and 特別警戒区域 by 現象; 0 is
  a genuine zero.
- 津波: KSJ A40-23 has no polygon in the 23 wards and 東京都's 津波浸水想定 was set
  for the 島しょ部 only, so every ward is 対象外 with that basis stated.
- 高潮: until follow-up 3, KSJ A49-20 (2020年度). Architect decision B
  (2026-11-09) replaces it with 東京都港湾局・建設局「高潮浸水想定区域図」
  （令和6年12月改定）, 10 m cells with their 浸水深, put into the same seven
  classes at the same boundaries; per ward the share of the ward area by
  class. The guards for it are in test_takashio.py; the ones below that named
  A49 were flipped with it (each says so).
- Decision 9 pattern: ``etl/disaster.py`` builds the snapshot from committed
  excerpts; the route serves it with a ``source`` per hazard, no ``level``
  field, every ward a value or an explained 対象外; startup validation.
- Decision 11: the LP hero's rows are the top 6 by the L01 住宅地 平均変動率
  (継続地点) of the PR 5 snapshot, each with its 地震 (K2) and 洪水 (≥ 3 m)
  figure — a static file built from the two snapshots.

Nothing below is typed by hand except the Architect's cross-check figures:
every expected value is recomputed here from the committed source files, or
comes from the builder over them. RED on main (deeb49d).
"""

from __future__ import annotations

import csv
import importlib
import importlib.util
import io
import json
import os
import subprocess
import sys
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
FIXTURES = BACKEND / "tests" / "fixtures" / "disaster"
SNAPSHOT = BACKEND / "data" / "disaster_risks.json"
LAND_PRICES = BACKEND / "data" / "land_prices.json"
HERO = ROOT / "src" / "data" / "hero-spread.json"
BUILDER = ROOT / "etl" / "disaster.py"
ROUTE = "/api/v1/disaster-risks"

WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]
TOTAL_CODE = "13100"

# The pinned files (brief 2026-11-05; RECON evidence/disaster/REPORT-pr7-disaster.md §3).
KIKENDO_SHA256 = "62ad9f4479f43ea254ed89bdfbc289ee9ccf7f18546a3713c29e6d63bbabbfb9"
A33_SHA256 = "4107d815b48fd3a4e9d5394ff4c8504f9f54924293bb021c5f51b6ea3f2ee847"
A31_SHA256 = {
    "A31a-25_13_10_GEOJSON.zip": "ecef23e95ac75554bfd42e6156800291b7af27bca49198002eab6f0394fe9f93",
    "A31a-25_13_20_GEOJSON.zip": "3101bac42ebb9693f7c9f92d994b7eb60a2cfe2bf2659a21dfb2a0886885e0b4",
    "A31a-25_83_10_GEOJSON.zip": "e66542cecda1c2ed9e7cf74d3333512a65bdb334557410389e521e7c259bca35",
}
A40_SHA256 = "b8e24973e5f9b885d481c28211f107587d14597cb3d9674d26c1aa591dacdc5c"
# Follow-up 3 (Architect decision B, 2026-11-09): the 高潮 file is 東京都's
# shape(depth).zip of the 令和6年12月改定; the A49-20 pin left with the source.
TAKASHIO_SHA256 = "1ea3b9788eec769711b4574635058cf66debf4ace128e090088ae0757c5fae9c"
N03_SHA256 = "94f10b26256566db970dd74b09d614f059c1e8a432f9244ac9c4add76c32ff16"

# The Architect's cross-check figures (brief 2026-11-05).
EDOGAWA_TOTAL_RANKS = [46, 45, 75, 28, 5]
ADACHI_RANK5 = 16
TOKYO23_RANK5 = 85
TOKYO23_CHOCHOMOKU = 3138
EDOGAWA_DEEP = 44.0
ADACHI_DEEP = 50.3

HAZARDS = ("earthquake", "flood", "landslide", "tsunami", "hightide")
TSUNAMI_TEXT = "対象外：東京都の津波浸水想定（津波防災地域づくり法第8条）は島しょ部が対象で、区部には設定されていない（国土数値情報 A40 に23区の区域なし）"
KSJ = "https://nlftp.mlit.go.jp/ksj/"
EDITED = {
    "edited_a31": f"「国土数値情報（洪水浸水想定区域データ）」（国土交通省）（{KSJ}）を加工して作成",
    "edited_a33": f"「国土数値情報（土砂災害警戒区域データ）」（国土交通省）（{KSJ}）を加工して作成",
    "edited_a40": f"「国土数値情報（津波浸水想定データ）」（国土交通省）（{KSJ}）を加工して作成",
    "edited_n03": f"「国土数値情報（行政区域データ）」（国土交通省）（{KSJ}）を加工して作成",
}
CC_BY = "クリエイティブ・コモンズ・ライセンス 表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）"

ACTIVE = {"Authorization": "Bearer active-token"}
PENDING = {"Authorization": "Bearer pending-token"}
TOKENS = {
    "active-token": {"sub": "gipuid_disaster_active_001", "email": "analyst@customcorp.jp", "email_verified": True},
    "pending-token": {"sub": "gipuid_disaster_pending_01", "email": "visitor@gmail.com", "email_verified": False},
}


# --- the builder over the committed source files ------------------------------------


def _builder():
    assert BUILDER.is_file(), f"no builder at {BUILDER}"
    spec = importlib.util.spec_from_file_location("disaster_etl", BUILDER)
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


def _snapshot() -> dict:
    assert SNAPSHOT.is_file(), f"no snapshot at {SNAPSHOT}"
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def _ward(s: dict, name: str) -> dict:
    return next(w for w in s["wards"] if w["name"] == name)


def _kikendo_rows() -> list[list[str]]:
    raw = (FIXTURES / "tokyo_kikendo9_all2.csv").read_bytes()
    return list(csv.reader(io.StringIO(raw.decode("cp932"))))


def _class_csv(name: str) -> dict[str, dict[int, float]]:
    out: dict[str, dict[int, float]] = {}
    for r in csv.DictReader((FIXTURES / name).read_text(encoding="utf-8").splitlines()):
        out.setdefault(r["code"], {})[int(r["class"])] = float(r["m2"])
    return out


def _has_key(value, key: str) -> bool:
    if isinstance(value, dict):
        return key in value or any(_has_key(v, key) for v in value.values())
    if isinstance(value, list):
        return any(_has_key(v, key) for v in value)
    return False


def test_fixtures_are_the_pinned_files(meta):
    import hashlib

    assert hashlib.sha256((FIXTURES / "tokyo_kikendo9_all2.csv").read_bytes()).hexdigest() == KIKENDO_SHA256
    assert meta["kikendo"]["sha256"] == KIKENDO_SHA256 and meta["kikendo"]["encoding"] == "cp932"
    assert {z["file"]: z["sha256"] for z in meta["A31a"]["zips"]} == A31_SHA256
    assert meta["A31a"]["id"] == "A31a-25" and meta["A31a"]["member_dir"] == "20_想定最大規模"
    assert meta["A33"]["sha256"] == A33_SHA256 and meta["A33"]["tokyo_asof"] == "2025-07-30"
    assert meta["A40"]["sha256"] == A40_SHA256
    # Flipped in follow-up 3: 高潮 is no longer cut from 国土数値情報 A49-20.
    assert "A49" not in meta
    assert meta["takashio"]["sha256"] == TAKASHIO_SHA256 and meta["takashio"]["revision"] == "令和6年12月改定"
    assert meta["N03"]["sha256"] == N03_SHA256
    # The national-river zones are in: 荒川 and 江戸川 are 関東地方整備局's.
    rivers = meta["A31a"]["rivers"]
    assert any(k.startswith("荒川（関東地方整備局）") for k in rivers)
    assert any(k.startswith("江戸川（関東地方整備局）") for k in rivers)


def test_committed_excerpts_stay_small():
    total = sum(p.stat().st_size for p in FIXTURES.iterdir() if p.is_file())
    assert total <= 2_200_000, f"committed disaster excerpts are {total} bytes"


def test_the_kikendo_csv_carries_three_ranked_measures_and_5192_chochomoku(etl):
    rows = _kikendo_rows()
    header = rows[0]
    assert [c for c in header if c.endswith("ランク")] == ["建物倒壊危険度ランク", "火災危険度ランク", "総合危険度ランク"]
    # The fourth measure has a 困難係数 and no rank.
    assert "災害時活動困難度困難係数" in header and not any(c.startswith("災害時活動困難度") and c.endswith("ランク") for c in header)
    assert len([r for r in rows[1:] if r]) == 5192


def test_every_wards_rank_counts_are_the_recount_of_the_csv(built):
    rows = _kikendo_rows()
    header = rows[0]
    col = {k: header.index(c) for k, c in (("total", "総合危険度ランク"), ("building", "建物倒壊危険度ランク"), ("fire", "火災危険度ランク"))}
    for w in built["wards"]:
        mine = [r for r in rows[1:] if r and r[0] == w["name"]]
        assert w["earthquake"]["n"] == len(mine) > 0, w["name"]
        for key, i in col.items():
            assert w["earthquake"]["ranks"][key] == [sum(1 for r in mine if r[i] == str(k)) for k in range(1, 6)], (w["name"], key)
        assert w["earthquake"]["rank5"] == w["earthquake"]["ranks"]["total"][4]
        assert w["earthquake"]["rank5Share"] == round(w["earthquake"]["rank5"] / w["earthquake"]["n"] * 100, 4)
        assert "相対評価" in w["earthquake"]["relative"]


def test_the_architects_cross_check_figures(built):
    assert _ward(built, "江戸川区")["earthquake"]["ranks"]["total"] == EDOGAWA_TOTAL_RANKS
    assert _ward(built, "足立区")["earthquake"]["rank5"] == ADACHI_RANK5
    assert built["total"]["earthquake"]["rank5"] == TOKYO23_RANK5
    assert built["total"]["earthquake"]["n"] == TOKYO23_CHOCHOMOKU
    assert round(_ward(built, "江戸川区")["flood"]["deepShare"], 1) == EDOGAWA_DEEP
    assert round(_ward(built, "足立区")["flood"]["deepShare"], 1) == ADACHI_DEEP


def test_flood_and_hightide_shares_are_the_class_areas_over_the_n03_ward_area(built, etl):
    areas = etl.ward_areas()
    for name, key, n_classes, deep in (("ksj_A31a-25_L2_tokyo23.csv", "flood", 6, 3), ("tokyo_takashio_r6_tokyo23.csv", "hightide", 7, None)):
        m2 = _class_csv(name)
        for w in built["wards"]:
            block = w[key]
            assert [c["code"] for c in block["classes"]] == list(range(1, n_classes + 1))
            assert abs(block["wardM2"] - round(areas[w["code"]], 3)) < 1e-6
            for c in block["classes"]:
                assert c["m2"] == round(m2[w["code"]][c["code"]], 3)
                assert c["share"] == round(m2[w["code"]][c["code"]] / areas[w["code"]] * 100, 4)
            assert sum(m2[w["code"]].values()) <= areas[w["code"]] * (1 + 1e-9), w["name"]
            if deep:
                expected = sum(v for c, v in m2[w["code"]].items() if c >= deep) / areas[w["code"]] * 100
                assert block["deepShare"] == round(expected, 4)


def test_the_committed_guards_re_derive_the_guard_wards_flood_and_hightide_rows(etl, meta):
    # One guard ward per hazard, recorded in the meta; its rows are re-derived
    # with the standard library. 洪水: the smallest resolved geometry covering
    # ≥ 2 classes. 高潮 (flipped in follow-up 3): the cells of the ward with the
    # fewest cells covering ≥ 2 classes — test_takashio.py re-derives them.
    for name, key in (("ksj_A31a-25_L2_guard.geojson", "A31a"),):
        features = json.loads((FIXTURES / name).read_text(encoding="utf-8"))["features"]
        assert {f["properties"]["code"] for f in features} == {meta[key]["guard_ward"]}
        assert len(features) >= 2
    assert not (FIXTURES / "ksj_A49-20_guard.geojson").exists() and not (FIXTURES / "ksj_A49-20_tokyo23.csv").exists()
    assert (FIXTURES / "tokyo_takashio_r6_guard.csv").is_file()
    assert etl.verify() == []


def test_landslide_counts_are_distinct_zone_numbers_by_phenomenon_and_zero_where_none(built):
    rows = list(csv.DictReader((FIXTURES / "ksj_A33-25_tokyo23.csv").read_text(encoding="utf-8").splitlines()))
    for w in built["wards"]:
        mine = [r for r in rows if r["code"] == w["code"]]
        ph = {p["code"]: p for p in w["landslide"]["phenomena"]}
        assert [p["name"] for p in w["landslide"]["phenomena"]] == ["急傾斜地の崩壊", "土石流", "地滑り"]
        for code, p in ph.items():
            for zone, key in ((1, "warning"), (2, "special")):
                assert p[key] == len({r["zone_id"] for r in mine if int(r["phenomenon"]) == code and int(r["zone"]) == zone})
    # Wards without any zone show a genuine 0, not a missing value.
    for name in ("中央区", "墨田区", "江東区", "足立区", "葛飾区", "江戸川区"):
        assert _ward(built, name)["landslide"]["warning"] == 0 and _ward(built, name)["landslide"]["special"] == 0
    assert _ward(built, "港区")["landslide"]["warning"] > 0


def test_tsunami_is_not_covered_with_its_basis_for_every_ward(built):
    coverage = json.loads((FIXTURES / "ksj_A40-23_tokyo23_coverage.json").read_text(encoding="utf-8"))
    assert coverage["polygons"] > 0 and coverage["polygons_in_wards_bbox"] == 0
    assert all(v == 0 for v in coverage["polygons_per_ward"].values())
    assert coverage["extent_lonlat"][3] < 35.0  # every A40-23_13 polygon lies south of the 区部
    quotes = [b["quote"] for b in coverage["basis"]]
    assert "津波浸水想定は、東京都の区部を除いて設定済み。" in quotes
    assert any("東京都の島しょ部を対象として実施しました" in q for q in quotes)
    for w in built["wards"] + [built["total"]]:
        assert w["tsunami"] == {"status": "notCovered", "text": TSUNAMI_TEXT}
    assert built["hazards"]["tsunami"]["basis"] == coverage["basis"]


def test_the_23_ward_total_is_the_sum_over_the_wards(built):
    t = built["total"]
    assert t["code"] == TOTAL_CODE and t["name"] == "東京23区"
    for key in ("total", "building", "fire"):
        assert t["earthquake"]["ranks"][key] == [sum(w["earthquake"]["ranks"][key][i] for w in built["wards"]) for i in range(5)]
    for hazard in ("flood", "hightide"):
        assert abs(t[hazard]["wardM2"] - sum(w[hazard]["wardM2"] for w in built["wards"])) < 0.01
        for i, c in enumerate(t[hazard]["classes"]):
            assert abs(c["m2"] - sum(w[hazard]["classes"][i]["m2"] for w in built["wards"])) < 0.01


def test_the_snapshot_names_a_source_per_hazard_the_licence_basis_and_the_credits(built):
    assert set(built["sources"]) == {*HAZARDS, "wards"}
    assert built["sources"]["earthquake"]["year"] == 2022 and "第9回" in built["sources"]["earthquake"]["label"]
    assert "令和4年9月公表" in built["sources"]["earthquake"]["label"]
    assert built["sources"]["flood"]["table"] == "A31a-25" and "想定最大規模" in built["sources"]["flood"]["label"]
    assert built["sources"]["landslide"]["table"] == "A33-25" and "2025年7月30日時点" in built["sources"]["landslide"]["label"]
    assert built["sources"]["tsunami"]["table"] == "A40-23"
    # Flipped in follow-up 3: the 高潮 source is the 都's map, its 時点 the revision.
    assert built["sources"]["hightide"]["table"] == "令和6年12月改定" and "東京都港湾局・建設局" in built["sources"]["hightide"]["label"]
    assert "A49" not in json.dumps(built["sources"], ensure_ascii=False)
    basis = built["licence"]["earthquake"]["basis"]
    assert "クリエイティブ・コモンズ 表示（CC BY）" in basis and "本利用規約が優先するものとします" in basis
    assert "無断で複製・転用することはできません" in basis and "spec.api.metro.tokyo.lg.jp" in basis
    credit = built["credit"]
    assert credit["kikendo"].endswith(f"、東京都、{CC_BY}")
    assert credit["kikendo_edited"].startswith("このサービスは、以下の著作物を改変して利用しています。")
    for key, text in EDITED.items():
        assert credit[key] == text
    assert not _has_key(built, "level")


def test_snapshot_is_a_fresh_build_from_the_committed_source_files(built):
    assert built == _snapshot()


def test_the_lp_hero_file_is_a_fresh_build_from_the_two_snapshots(etl):
    land = json.loads(LAND_PRICES.read_text(encoding="utf-8"))
    expected = etl.hero(land, _snapshot())
    assert HERO.is_file(), f"no hero file at {HERO}"
    assert json.loads(HERO.read_text(encoding="utf-8")) == expected
    rows = expected["rows"]
    changes = sorted(
        ((w["residential"]["meanChange"], w["name"]) for w in land["wards"] if w["residential"]["meanChange"] is not None),
        reverse=True,
    )
    assert [r["region"] for r in rows] == [n for _, n in changes[:6]]
    disaster = {w["name"]: w for w in _snapshot()["wards"]}
    for r in rows:
        assert r["rank5"] == disaster[r["region"]]["earthquake"]["rank5"]
        assert r["chochomoku"] == disaster[r["region"]]["earthquake"]["n"]
        assert r["floodDeepShare"] == disaster[r["region"]]["flood"]["deepShare"]


def test_nothing_in_the_backend_reads_the_sample_set_any_more():
    service = BACKEND / "services" / "disaster_risks.py"
    text = service.read_text(encoding="utf-8")
    assert "sample" not in text and "httpx" not in text
    assert not (BACKEND / "services" / "sample_data.py").exists()
    assert not (BACKEND / "data" / "sample_fallback.json").exists()
    assert not (ROOT / "scripts" / "gen-sample-fallback.mjs").exists()


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


def _client_shape(record: dict) -> dict:
    out = {k: v for k, v in record.items() if k != "name"}
    out["region"] = record["name"]
    return out


def test_route_is_401_without_a_token_and_403_pending(client):
    assert client.get(ROUTE).status_code == 401
    resp = client.get(ROUTE, headers=PENDING)
    assert resp.status_code == 403
    assert resp.json() == {"status": "pending_activation"}


def test_route_serves_every_ward_with_a_value_or_an_explained_out_of_scope_per_hazard(client, built):
    resp = client.get(ROUTE, headers=ACTIVE)
    assert resp.status_code == 200, resp.text[:300]
    body = resp.json()
    assert body["status"] == "ok" and "isLive" not in body
    rows = body["data"]
    assert [r["code"] for r in rows] == WARD_CODES
    by_code = {w["code"]: w for w in built["wards"]}
    for r in rows:
        assert r == _client_shape(by_code[r["code"]]), r["region"]
        for hazard in HAZARDS:
            assert hazard in r, (r["region"], hazard)
        assert r["tsunami"]["status"] == "notCovered" and "島しょ部" in r["tsunami"]["text"] and "A40" in r["tsunami"]["text"]
    assert body["total"] == _client_shape(built["total"])
    assert not _has_key(body, "level"), "a Lv field survived in the payload"


def test_route_envelope_carries_a_source_per_hazard(client, built):
    body = client.get(ROUTE, headers=ACTIVE).json()
    assert body["sources"] == built["sources"]
    for hazard in HAZARDS:
        s = body["sources"][hazard]
        assert isinstance(s["year"], int) and s["table"] and s["label"]


def test_route_does_not_touch_the_network(client, monkeypatch):
    import httpx

    def explode(*args, **kwargs):
        raise AssertionError("the 災害 route serves a committed file, never an upstream")

    monkeypatch.setattr(httpx.AsyncClient, "__init__", explode, raising=False)
    monkeypatch.setattr(httpx, "get", explode, raising=False)
    assert client.get(ROUTE, headers=ACTIVE).status_code == 200


# --- startup validation ---------------------------------------------------------------


def _import_main_with(path: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "DISASTER_RISKS_PATH": str(path)}
    return subprocess.run([sys.executable, "-c", "import main"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=60)


def test_startup_refuses_a_missing_snapshot(tmp_path):
    proc = _import_main_with(tmp_path / "missing.json")
    assert proc.returncode != 0, "the app started without its 災害 snapshot"
    assert "disaster" in proc.stderr


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda s: s["wards"].clear(), id="no wards"),
        pytest.param(lambda s: s["wards"].remove(_ward(s, "江戸川区")), id="a ward missing"),
        pytest.param(lambda s: _ward(s, "江戸川区")["earthquake"]["ranks"]["total"].__setitem__(4, 99), id="ranks not summing to n"),
        pytest.param(lambda s: _ward(s, "足立区")["earthquake"].__setitem__("rank5", 3), id="rank5 not the rank-5 count"),
        pytest.param(lambda s: _ward(s, "足立区")["earthquake"].__setitem__("level", 5), id="a level field"),
        pytest.param(lambda s: _ward(s, "江戸川区")["flood"]["classes"][1].__setitem__("share", 99.0), id="a flood share not its area over the ward"),
        pytest.param(lambda s: _ward(s, "江戸川区")["flood"].__setitem__("deepShare", 1.0), id="deepShare not the ≥3m classes"),
        pytest.param(lambda s: _ward(s, "江戸川区")["flood"]["classes"][0].__setitem__("m2", 1e12), id="class areas larger than the ward"),
        pytest.param(lambda s: _ward(s, "港区")["landslide"]["phenomena"][0].__setitem__("warning", -1), id="a negative zone count"),
        pytest.param(lambda s: _ward(s, "江東区")["tsunami"].__setitem__("status", "ok"), id="tsunami claimed covered"),
        pytest.param(lambda s: _ward(s, "江東区")["tsunami"].__setitem__("text", "対象外"), id="対象外 without its basis"),
        pytest.param(lambda s: _ward(s, "江東区").pop("hightide"), id="a hazard missing"),
        pytest.param(lambda s: s["sources"].pop("flood"), id="the flood source missing"),
        pytest.param(lambda s: s["total"]["earthquake"].__setitem__("rank5", 1), id="the 23区 total not the sum of the wards"),
        pytest.param(lambda s: s["credit"].__setitem__("edited_a31", "「国土数値情報（洪水浸水想定区域データ）」（国土交通省）をもとにX社作成"), id="an editor name in the credit"),
        pytest.param(lambda s: s["credit"].pop("kikendo"), id="the 都 CC BY credit missing"),
        # Follow-up 3: the 高潮 source's credit, licence basis and 時点.
        pytest.param(lambda s: s["credit"].pop("takashio_edited"), id="the 高潮 CC BY modified-use credit missing"),
        pytest.param(lambda s: s["credit"].__setitem__("takashio_edited", "このサービスは、高潮浸水想定区域図を利用しています。"), id="the 高潮 credit not in the 都's form"),
        pytest.param(lambda s: s["licence"].pop("hightide"), id="the 高潮 licence basis missing"),
        pytest.param(lambda s: s["notes"].pop("hightide_as_of"), id="the 高潮 時点 missing"),
        pytest.param(lambda s: s["notes"].__setitem__("hightide_as_of", "時点：2020年度"), id="a 高潮 時点 the source does not name"),
        pytest.param(lambda s: s["notes"].pop("hightide_classes"), id="the 高潮 class note missing"),
    ],
)
def test_startup_refuses_a_malformed_snapshot(tmp_path, mutate):
    snapshot = _snapshot()
    mutate(snapshot)
    bad = tmp_path / "disaster_risks.json"
    bad.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    proc = _import_main_with(bad)
    assert proc.returncode != 0, "the app started on a malformed snapshot"
    assert "disaster" in proc.stderr


def test_startup_accepts_the_committed_snapshot():
    proc = _import_main_with(SNAPSHOT)
    assert proc.returncode == 0, proc.stderr[-800:]


def test_validator_rejects_a_non_finite_figure():
    service = importlib.import_module("services.disaster_risks")
    snapshot = _snapshot()
    _ward(snapshot, "千代田区")["flood"]["classes"][0]["share"] = float("nan")
    with pytest.raises(service.SnapshotError):
        service.validate(snapshot)


def test_snapshot_path_defaults_to_backend_data(monkeypatch):
    monkeypatch.delenv("DISASTER_RISKS_PATH", raising=False)
    assert settings.DISASTER_RISKS_PATH == BACKEND / "data" / "disaster_risks.json"
    monkeypatch.setenv("DISASTER_RISKS_PATH", "/elsewhere/disaster_risks.json")
    assert settings.DISASTER_RISKS_PATH == Path("/elsewhere/disaster_risks.json")
