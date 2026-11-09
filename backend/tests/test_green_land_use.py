"""PR 8 of the real-data plan (RECON 2026-10-uo-real-data §9 row 8): the comparison table's inputs.

On main (56bdbf6) the 区別総合比較 radar draws five hand-typed 0–100 scores
(``sampleWardProfiles``). Architect decisions (2026-11-09): the radar becomes a
comparison table of seven measures, each from a shipped snapshot or endpoint;
the seventh, 公園等・農用地・森林・原野の面積割合, comes from 東京都都市整備局
「東京の土地利用 令和３年東京都区部」（表－１）令和３年土地面積（区部・区別）
(tochi_r3_01.csv, CC BY on the 東京都オープンデータAPIカタログ), committed whole
and served from a snapshot by the gated ``GET /api/v1/green-land-use`` (Decision
9 pattern). Share = (公園等 + 農用地 + 森林 + 原野) ÷ the survey's own ward total;
the 23区 figure over the 23 ward rows. The table's 23区 column also needs the
census area each density divides by (an additive ``areaKm2`` on the
/demographics records) and the 地価公示 23区 figure (an additive ``total`` on
/land-prices). And the 津波 source line prints 「A40-23」 once.

Every expected value is recomputed here from the committed CSV with the
standard library; the cross-check figures are the Architect's. RED on main.
"""

from __future__ import annotations

import csv
import hashlib
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
FIXTURES = BACKEND / "tests" / "fixtures" / "green"
CSV_FILE = FIXTURES / "tochi_r3_01.csv"
SNAPSHOT = BACKEND / "data" / "green_land_use.json"
BUILDER = ROOT / "etl" / "green.py"
ROUTE = "/api/v1/green-land-use"
SHA256 = "dc807361a6613a514d1c0384ad89146d1fb990d55e27440f0877e0b762b114b7"
URL = "https://www.toshiseibi.metro.tokyo.lg.jp/seisaku/tochi_c/pdf/tochi_r3/tochi_r3_01.csv"
API_PAGE = "https://spec.api.metro.tokyo.lg.jp/spec/t000008d2000000016-d6caababf14359878916424ed55bc222-0?lang=ja"
WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]
CLASS_COLUMNS = ["L-3／公園等（ha）", "L-6／農用地（ha）", "L-8／森林（ha）", "L-9／原野（ha）"]
TOTAL_COLUMN = "合計（ha）"
OTHER_ROWS = ["区部（R3）", "区部（H28）", "中央防波堤"]
TITLE = "東京の土地利用 令和３年東京都区部（表－１）令和３年土地面積（区部・区別）"
CC_BY = "クリエイティブ・コモンズ・ライセンス 表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）"
# The Architect's cross-check figures (brief 2026-11-09).
CHIYODA = 6.86
EDOGAWA = 11.90

ACTIVE = {"Authorization": "Bearer active-token"}
PENDING = {"Authorization": "Bearer pending-token"}
TOKENS = {
    "active-token": {"sub": "gipuid_green_active_000001", "email": "analyst@customcorp.jp", "email_verified": True},
    "pending-token": {"sub": "gipuid_green_pending_00001", "email": "visitor@gmail.com", "email_verified": False},
}


def _builder():
    assert BUILDER.is_file(), f"no builder at {BUILDER}"
    spec = importlib.util.spec_from_file_location("green_etl", BUILDER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def built() -> dict:
    return _builder().build()


def _snapshot() -> dict:
    assert SNAPSHOT.is_file(), f"no snapshot at {SNAPSHOT}"
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def _csv() -> dict[str, dict]:
    rows = list(csv.reader(io.StringIO(CSV_FILE.read_bytes().decode("cp932"))))
    return {r[0]: dict(zip(rows[0], r)) for r in rows[1:] if r}


def test_the_committed_csv_is_the_pinned_file_with_the_quoted_columns():
    assert hashlib.sha256(CSV_FILE.read_bytes()).hexdigest() == SHA256
    header = list(csv.reader(io.StringIO(CSV_FILE.read_bytes().decode("cp932"))))[0]
    assert TOTAL_COLUMN in header and all(c in header for c in CLASS_COLUMNS)
    meta = json.loads((FIXTURES / "meta.json").read_text(encoding="utf-8"))
    assert meta["url"] == URL and meta["sha256"] == SHA256 and meta["api_page"] == API_PAGE
    assert meta["licence_evidence"]["api_page_licence"] == "クリエイティブ・コモンズ 表示（CC BY）"
    rows = _csv()
    assert set(rows) - {w["name"] for w in _snapshot()["wards"]} == set(OTHER_ROWS)


def test_every_wards_share_is_the_four_classes_over_the_survey_total(built):
    rows = _csv()
    for w in built["wards"]:
        r = rows[w["name"]]
        green = sum(float(r[c]) for c in CLASS_COLUMNS)
        assert w["totalHa"] == float(r[TOTAL_COLUMN])
        assert abs(w["greenHa"] - green) < 0.06
        assert w["share"] == round(w["greenHa"] / w["totalHa"] * 100, 4)
        assert [c["name"] for c in w["classes"]] == ["公園等", "農用地", "森林", "原野"]


def test_the_architects_cross_check_and_the_23_ward_figure_over_the_23_rows(built):
    by = {w["name"]: w for w in built["wards"]}
    assert abs(by["千代田区"]["share"] - CHIYODA) < 0.01
    assert abs(by["江戸川区"]["share"] - EDOGAWA) < 0.01
    rows = _csv()
    wards = [rows[w["name"]] for w in built["wards"]]
    green = sum(float(r[c]) for r in wards for c in CLASS_COLUMNS)
    total = sum(float(r[TOTAL_COLUMN]) for r in wards)
    assert abs(built["total"]["share"] - green / total * 100) < 1e-3
    # Not the CSV's 区部 row, which also counts 中央防波堤.
    kubu = rows["区部（R3）"]
    assert abs(built["total"]["totalHa"] - float(kubu[TOTAL_COLUMN])) > 100


def test_the_label_names_what_is_counted_and_the_credit_is_the_tokyo_cc_by_form(built):
    assert built["label"] == "公園等・農用地・森林・原野の面積割合"
    assert built["sources"]["green"]["year"] == 2021
    assert built["credit"]["tokyo"] == f"{TITLE}、東京都、{CC_BY}"
    assert built["credit"]["tokyo_edited"] == f"このサービスは、以下の著作物を改変して利用しています。{TITLE}、東京都、{CC_BY}"
    basis = built["licence"]["basis"]
    assert "クリエイティブ・コモンズ 表示（CC BY）" in basis and API_PAGE in basis and "無断で複製・転用することはできません" in basis


def test_snapshot_is_a_fresh_build_from_the_committed_csv(built):
    assert built == _snapshot()


# --- additive inputs for the comparison table -----------------------------------------


def test_census_records_carry_the_area_the_density_divides_by():
    demographics = importlib.import_module("services.demographics")
    expected = json.loads((BACKEND / "tests" / "fixtures" / "census_2025" / "expected.json").read_text(encoding="utf-8"))["wards"]
    pop = {c: w["population"] for c, w in expected.items()}
    records = demographics.transform_census(pop, {}, {})
    for code, r in zip(demographics.TOKYO_WARDS, records):
        assert r["areaKm2"] == expected[code]["area_km2"], r["region"]
        assert r["density"] == round(r["population"] / r["areaKm2"])


def test_disaster_tsunami_label_names_the_table_once():
    snapshot = json.loads((BACKEND / "data" / "disaster_risks.json").read_text(encoding="utf-8"))
    s = snapshot["sources"]["tsunami"]
    assert s["table"] == "A40-23" and "A40-23" not in s["label"]
    for key, src in snapshot["sources"].items():
        assert src["table"] not in src["label"], key


# --- the routes -------------------------------------------------------------------


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


def test_route_serves_the_23_wards_the_23_ward_figure_and_the_source(client, built):
    body = client.get(ROUTE, headers=ACTIVE).json()
    assert body["status"] == "ok" and body["isLive"] is True
    assert [r["code"] for r in body["data"]] == WARD_CODES
    assert body["data"] == [_client_shape(w) for w in built["wards"]]
    assert body["total"] == _client_shape(built["total"])
    assert body["sources"] == built["sources"]


def test_land_prices_route_adds_the_23_ward_figure_over_every_point(client):
    snapshot = json.loads((BACKEND / "data" / "land_prices.json").read_text(encoding="utf-8"))
    body = client.get("/api/v1/land-prices", headers=ACTIVE).json()
    assert body["total"]["residential"] == snapshot["total"]["residential"]
    assert body["total"]["residential"]["n"] == sum(w["residential"]["n"] for w in snapshot["wards"])


def _import_main_with(path: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "GREEN_LAND_USE_PATH": str(path)}
    return subprocess.run([sys.executable, "-c", "import main"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=60)


def test_startup_refuses_a_missing_snapshot(tmp_path):
    proc = _import_main_with(tmp_path / "missing.json")
    assert proc.returncode != 0 and "green" in proc.stderr


def _ward(s: dict, name: str) -> dict:
    return next(w for w in s["wards"] if w["name"] == name)


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda s: s["wards"].pop(), id="a ward missing"),
        pytest.param(lambda s: _ward(s, "千代田区").__setitem__("share", 50.0), id="a share not its classes over the total"),
        pytest.param(lambda s: _ward(s, "江戸川区")["classes"][0].__setitem__("name", "緑地"), id="a class renamed"),
        pytest.param(lambda s: s.__setitem__("label", "緑地"), id="a bare 緑地 label"),
        pytest.param(lambda s: s["total"].__setitem__("greenHa", 1.0), id="the 23区 figure not the sum of the wards"),
        pytest.param(lambda s: s["credit"].pop("tokyo_edited"), id="the 改変 sentence missing"),
        pytest.param(lambda s: s["sources"].pop("green"), id="the source missing"),
    ],
)
def test_startup_refuses_a_malformed_snapshot(tmp_path, mutate):
    snapshot = _snapshot()
    mutate(snapshot)
    bad = tmp_path / "green.json"
    bad.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    proc = _import_main_with(bad)
    assert proc.returncode != 0 and "green" in proc.stderr


def test_startup_accepts_the_committed_snapshot():
    assert _import_main_with(SNAPSHOT).returncode == 0


def test_snapshot_path_defaults_to_backend_data(monkeypatch):
    monkeypatch.delenv("GREEN_LAND_USE_PATH", raising=False)
    assert settings.GREEN_LAND_USE_PATH == BACKEND / "data" / "green_land_use.json"
