"""PR 4 of the real-data plan (RECON 2026-10-uo-real-data §9 row 4): stations and ridership on S12.

On main (d8d1287) /api/v1/transport serves the top 50 of a bundled GeoJSON of
unknown provenance, assigns wards by a table of bounding boxes
(services/transport.py WARD_BOUNDS) that leaves 江戸川区 with no station, and
fills ridership live from ODPT — eight operators (JR東日本 among them) never
covered, the rest a runtime dependency on a key. Architect decisions
(2026-11-02): 国土数値情報 駅別乗降客数データ S12-25 (2024年度版) is the sole
ridership source, committed as a snapshot per Decision 9 — built by
``etl/stations.py`` from the committed excerpts under
tests/fixtures/stations/ (the S12 rows inside the 23 wards and the N03
行政区域 polygons), validated when the app starts, served by the existing
gated route with the ``sources`` envelope; ODPT leaves the code path; every
KSJ credit is the 加工 form with no editor name (Decision 12); T2 becomes
事業者別 so its total equals K3 (Decision 13).

Nothing below is typed by hand: every expected figure comes from the builder
over the committed source files, or is recomputed here from those files. The
three ward totals the Architect gave as cross-checks are asserted against
both. RED on main (d8d1287).
"""

from __future__ import annotations

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
FIXTURES = BACKEND / "tests" / "fixtures" / "stations"
SNAPSHOT = BACKEND / "data" / "stations.json"
BUILDER = ROOT / "etl" / "stations.py"
OLD_GEOJSON = ROOT / "public" / "data" / "tokyo-stations.geojson"
ROUTE = "/api/v1/transport"

# The editions the Architect pinned (brief 2026-11-02); the meta file carries
# what was downloaded, so a different file fails here.
S12_SHA256 = "0785e932a32b3ec15e1a1345537ae145eafe1c07bf38d5c16c11ee2b391e7a28"
N03_SHA256 = "94f10b26256566db970dd74b09d614f059c1e8a432f9244ac9c4add76c32ff16"

# The Architect's cross-check figures for K3 (brief 2026-11-02): the sum of a
# ward's rows with 重複コード 1 and データ有無コード 1 in the 2024 columns.
CROSS_CHECK = {"江戸川区": 627_375, "新宿区": 5_036_759, "文京区": 744_471}

KSJ = "https://nlftp.mlit.go.jp/ksj/"
EDITED_S12 = f"「国土数値情報（駅別乗降客数データ）」（国土交通省）（{KSJ}）を加工して作成"
EDITED_N03 = f"「国土数値情報（行政区域データ）」（国土交通省）（{KSJ}）を加工して作成"
DEFINITION_NOTE = "事業者ごとの駅別乗降客数の合計（乗換客は事業者ごとに数えられます）"
JR_NOTE = "JR東日本の値は乗車人員を2倍した値（原典資料による）"

# Built so this file does not itself contain the retired source's name.
RETIRED = "od" + "pt"
RETIRED_JA = "公共交通オープン" + "データ"

ACTIVE = {"Authorization": "Bearer active-token"}
PENDING = {"Authorization": "Bearer pending-token"}
TOKENS = {
    "active-token": {"sub": "gipuid_stations_active_0001", "email": "analyst@customcorp.jp", "email_verified": True},
    "pending-token": {"sub": "gipuid_stations_pending_001", "email": "visitor@gmail.com", "email_verified": False},
}


# --- the builder over the committed source files ----------------------------------


def _builder():
    assert BUILDER.is_file(), f"no builder at {BUILDER}"
    spec = importlib.util.spec_from_file_location("stations_etl", BUILDER)
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


def _row_totals(etl) -> dict[str, int]:
    """K3 per ward recomputed from the excerpts without build(): the rows with
    重複コード 1 and データ有無コード 1 in the latest year, summed per the ward
    whose polygon contains the row's midpoint."""
    n03 = json.loads((FIXTURES / etl.N03_EXCERPT).read_text(encoding="utf-8"))
    s12 = json.loads((FIXTURES / etl.S12_EXCERPT).read_text(encoding="utf-8"))
    index = etl.WardIndex(n03["features"])
    year = etl.S12_YEAR
    totals: dict[str, int] = defaultdict(int)
    for f in s12["features"]:
        p = f["properties"]
        ward = index.ward_of(*etl.midpoint(f["geometry"]["coordinates"]))
        assert ward is not None, p[etl.NAME]
        if p[etl.column(year, 0)] == 1 and p[etl.column(year, 1)] == 1:
            totals[ward[1]] += p[etl.column(year, 3)]
    return dict(totals)


def test_fixtures_are_the_pinned_editions(meta):
    assert meta["S12"]["id"] == "S12-25" and meta["S12"]["sha256"] == S12_SHA256
    assert meta["N03"]["id"] == "N03-20260101" and meta["N03"]["sha256"] == N03_SHA256
    assert "CC_BY_4.0" in meta["S12"]["licence"] and "CC_BY_4.0" in meta["N03"]["licence"]
    assert (FIXTURES / "ksj_S12-25_tokyo23.geojson").is_file()
    assert (FIXTURES / "ksj_N03-20260101_tokyo23.geojson").is_file()


def test_every_ward_has_a_station_and_edogawa_has_eleven(built):
    wards = {w["name"]: w for w in built["wards"]}
    assert len(wards) == 23
    assert all(w["stations"] >= 1 for w in wards.values()), {n: w["stations"] for n, w in wards.items()}
    assert wards["江戸川区"]["stations"] == 11


def test_wards_come_from_the_polygons_not_a_bbox(built):
    by_name = defaultdict(set)
    for s in built["stations"]:
        by_name[s["name"]].add(s["ward"])
    assert by_name["新小岩"] == {"葛飾区"}
    assert by_name["小岩"] == {"江戸川区"}
    assert "武蔵小杉" not in by_name and "日吉" not in by_name


def test_k3_is_the_sum_of_the_wards_rows_and_matches_the_cross_checks(etl, built):
    recomputed = _row_totals(etl)
    assert {w["name"]: w["passengers"] for w in built["wards"]} == recomputed
    assert {name: recomputed[name] for name in CROSS_CHECK} == CROSS_CHECK


def test_t2_per_operator_sums_equal_k3_for_every_ward_and_for_all_23(built):
    per_ward: dict[str, int] = defaultdict(int)
    for s in built["stations"]:
        operators = sum(o["passengers"] for o in s["operators"] if o["passengers"] is not None)
        assert s["dailyPassengers"] == (operators if any(o["passengers"] is not None for o in s["operators"]) else None), s["name"]
        per_ward[s["ward"]] += operators
    assert per_ward == {w["name"]: w["passengers"] for w in built["wards"]}
    assert sum(per_ward.values()) == sum(w["passengers"] for w in built["wards"])


def test_builder_names_the_year_the_sources_the_licence_and_the_credits(built, meta):
    assert built["year"] == int(meta["S12"]["latest_column"].replace("乗降客数", ""))
    assert built["sources"]["ridership"] == {"year": built["year"], "table": meta["S12"]["id"], "label": built["sources"]["ridership"]["label"]}
    assert built["sources"]["stations"]["table"] == meta["S12"]["id"]
    assert built["sources"]["wards"]["table"] == meta["N03"]["id"]
    assert built["credit"]["edited_s12"] == EDITED_S12
    assert built["credit"]["edited_n03"] == EDITED_N03
    assert built["credit"]["source"].startswith("出典：国土交通省国土数値情報ダウンロードサイト")
    assert "作成" not in built["credit"]["edited_s12"].replace("を加工して作成", "")
    assert built["notes"]["definition"] == DEFINITION_NOTE
    assert built["notes"]["jr_east"] == JR_NOTE
    assert built["licence"]["url"] == "https://nlftp.mlit.go.jp/ksj/other/agreement.html"
    assert built["inputs"][etl_name(meta, "S12")]["cut_from"]["sha256"] == S12_SHA256


def etl_name(meta: dict, key: str) -> str:
    return {"S12": "ksj_S12-25_tokyo23.geojson", "N03": "ksj_N03-20260101_tokyo23.geojson"}[key]


# --- the snapshot and what is gone --------------------------------------------------


def _snapshot() -> dict:
    assert SNAPSHOT.is_file(), f"no snapshot at {SNAPSHOT}"
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def test_snapshot_is_a_fresh_build_from_the_committed_source_files(built):
    assert built == _snapshot()


def test_the_bbox_table_and_the_top_50_cut_are_gone():
    transport = importlib.import_module("services.transport")
    assert not hasattr(transport, "WARD_BOUNDS")
    assert not hasattr(transport, "assign_ward")
    assert not hasattr(transport, "MAX_STATIONS")


def test_the_bundled_geojson_is_gone():
    assert not OLD_GEOJSON.exists(), f"{OLD_GEOJSON} is still in the repo"


def test_no_retired_source_in_the_backend():
    hits = []
    for path in sorted(BACKEND.rglob("*")):
        if not path.is_file() or path.suffix not in {".py", ".json", ".txt", ".md", ".ini", ".toml"}:
            continue
        if path == Path(__file__) or "__pycache__" in path.parts or ".pytest_cache" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if RETIRED in text.lower() or RETIRED_JA in text:
            hits.append(str(path.relative_to(ROOT)))
    assert hits == [], hits
    assert importlib.util.find_spec("services." + RETIRED) is None


def test_no_retired_key_is_read_from_the_environment():
    config = (BACKEND / "core" / "config.py").read_text(encoding="utf-8")
    assert RETIRED not in config.lower()
    assert not hasattr(settings, RETIRED.upper() + "_API_KEY")


# --- the route ------------------------------------------------------------------


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


def test_route_is_401_without_a_token_and_403_pending(client):
    assert client.get(ROUTE).status_code == 401
    resp = client.get(ROUTE, headers=PENDING)
    assert resp.status_code == 403
    assert resp.json() == {"status": "pending_activation"}


def test_route_serves_every_station_of_the_snapshot_live_and_complete(client, built):
    resp = client.get(ROUTE, headers=ACTIVE)
    assert resp.status_code == 200, resp.text[:300]
    body = resp.json()
    assert body["status"] == "ok"
    assert body["isLive"] is True
    assert "unavailable" not in body and "fetchedAt" not in body
    rows = body["data"]
    assert len(rows) == len(built["stations"])
    per_ward = defaultdict(list)
    for r in rows:
        per_ward[r["ward"]].append(r)
    assert {w: len(rs) for w, rs in per_ward.items()} == {w["name"]: w["stations"] for w in built["wards"]}
    for r in rows:
        known = [o["passengers"] for o in r["operators"] if o["passengers"] is not None]
        assert r["dailyPassengers"] == (sum(known) if known else None), r["name"]
        assert r["name"].endswith("駅") and r["ward"] and r["wardCode"] and r["lines"], r
        assert isinstance(r["lat"], float) and isinstance(r["lng"], float)


def test_route_k3_matches_the_cross_checks(client):
    rows = client.get(ROUTE, headers=ACTIVE).json()["data"]
    served = {name: sum(r["dailyPassengers"] or 0 for r in rows if r["ward"] == name) for name in CROSS_CHECK}
    assert served == CROSS_CHECK


def test_route_rewrites_the_three_big_operators_in_line_labels(client):
    rows = client.get(ROUTE, headers=ACTIVE).json()["data"]
    prefixes = {"東日本旅客鉄道": "JR ", "東京地下鉄": "メトロ ", "東京都": "都営 "}
    seen = set()
    for r in rows:
        for o in r["operators"]:
            if o["name"] in prefixes:
                seen.add(o["name"])
                assert any(line.startswith(prefixes[o["name"]]) for line in r["lines"]), (r["name"], r["lines"])
    assert seen == set(prefixes)


def test_route_envelope_names_the_year_and_table_of_the_figures(client, built):
    body = client.get(ROUTE, headers=ACTIVE).json()
    sources = body.get("sources")
    assert isinstance(sources, dict), "no `sources` in the envelope"
    assert sources["ridership"]["year"] == built["year"]
    assert sources["ridership"]["table"] == built["sources"]["ridership"]["table"]
    assert sources["ridership"]["label"].strip()
    assert sources["wards"]["table"] == built["sources"]["wards"]["table"]


def test_route_does_not_touch_the_network(client, monkeypatch):
    import httpx

    def explode(*args, **kwargs):
        raise AssertionError("the transport route serves a committed file, never an upstream")

    monkeypatch.setattr(httpx.AsyncClient, "__init__", explode, raising=False)
    monkeypatch.setattr(httpx, "get", explode, raising=False)
    assert client.get(ROUTE, headers=ACTIVE).status_code == 200


# --- startup validation ---------------------------------------------------------


def _import_main_with(path: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "STATIONS_PATH": str(path)}
    return subprocess.run(
        [sys.executable, "-c", "import main"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=60
    )


def test_startup_refuses_a_missing_snapshot(tmp_path):
    proc = _import_main_with(tmp_path / "missing.json")
    assert proc.returncode != 0, "the app started without its stations snapshot"
    assert "stations" in proc.stderr


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda s: s["stations"].clear(), id="no stations"),
        pytest.param(lambda s: [s["stations"].remove(x) for x in [st for st in s["stations"] if st["ward"] == "江戸川区"]], id="a ward without stations"),
        pytest.param(lambda s: s["stations"][0].__setitem__("dailyPassengers", 1), id="total not the sum of operators"),
        pytest.param(lambda s: s["sources"].pop("ridership"), id="the ridership source missing"),
        pytest.param(lambda s: s["stations"][0]["operators"][0].__setitem__("passengers", 1.5), id="a non-integer figure"),
        pytest.param(lambda s: s["credit"].pop("edited_s12"), id="the 加工 credit missing"),
    ],
)
def test_startup_refuses_a_malformed_snapshot(tmp_path, mutate):
    snapshot = _snapshot()
    mutate(snapshot)
    bad = tmp_path / "stations.json"
    bad.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    proc = _import_main_with(bad)
    assert proc.returncode != 0, "the app started on a malformed snapshot"
    assert "stations" in proc.stderr


def test_startup_accepts_the_committed_snapshot():
    proc = _import_main_with(SNAPSHOT)
    assert proc.returncode == 0, proc.stderr[-800:]


def test_validator_rejects_a_non_finite_figure():
    transport = importlib.import_module("services.transport")
    snapshot = _snapshot()
    snapshot["stations"][0]["dailyPassengers"] = float("nan")
    with pytest.raises(transport.SnapshotError):
        transport.validate(snapshot)
