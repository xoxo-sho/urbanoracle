"""PR 5 of the real-data plan (RECON 2026-10-uo-real-data §9 row 5): 地価 from L01.

On main (4b09098) the 地価 tab, the 区別データテーブル's 地価 column and the map's
地価 choropleth show ``sampleLandPriceSummary`` and ``WARD_META.avgLandPrice`` —
hand-typed figures for 16 wards, labelled SAMPLE. Architect decisions
(2026-11-02): 国土数値情報 地価公示データ L01-26 (2026年版, 東京都 extract,
2026-01-01) is the sole source — L02 is not used — committed as a snapshot per
Decision 9: built by ``etl/land_prices.py`` from the committed excerpt under
tests/fixtures/land_prices/, validated when the app starts, served by a new
gated route ``GET /api/v1/land-prices`` with the ``sources`` envelope. Per
ward and per use (住宅地 / 商業地; 工業地 gets a count only): price = the simple
mean of L01_008 over all points of that use, change = the simple mean of
L01_009 over the 継続 points (L01_010 = 1) — the definitions 東京都 uses — and
every figure carries its n. Every KSJ credit is the 加工 form with no editor
name (Decision 12).

Nothing below is typed by hand: every expected figure comes from the builder
over the committed source file, or is recomputed here from that file.
RED on main (4b09098).
"""

from __future__ import annotations

import csv
import importlib
import importlib.util
import json
import math
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
FIXTURES = BACKEND / "tests" / "fixtures" / "land_prices"
SNAPSHOT = BACKEND / "data" / "land_prices.json"
BUILDER = ROOT / "etl" / "land_prices.py"
ROUTE = "/api/v1/land-prices"

# The edition the Architect pinned (brief 2026-11-02); the meta file carries
# what was downloaded, so a different file fails here.
L01_SHA256 = "4f3e251683a6affe7181236b60fda2a7eee1d5e83daffc9db82435a1542a7795"
L01_ID = "L01-26"
REFERENCE_DATE = "2026-01-01"

KSJ = "https://nlftp.mlit.go.jp/ksj/"
EDITED_L01 = f"「国土数値情報（地価公示データ）」（国土交通省）（{KSJ}）を加工して作成"
PRICE_NOTE = "平均価格は各用途の全地点の地価公示価格の単純平均"
CHANGE_NOTE = "変動率は継続地点（前年と比較できる地点）の対前年変動率の単純平均"

USES = {"residential": "000", "commercial": "005"}
INDUSTRIAL = "009"
CONTINUING = 1
WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]

ACTIVE = {"Authorization": "Bearer active-token"}
PENDING = {"Authorization": "Bearer pending-token"}
TOKENS = {
    "active-token": {"sub": "gipuid_landprice_active_01", "email": "analyst@customcorp.jp", "email_verified": True},
    "pending-token": {"sub": "gipuid_landprice_pending_1", "email": "visitor@gmail.com", "email_verified": False},
}


# --- the builder over the committed source file ---------------------------------------


def _builder():
    assert BUILDER.is_file(), f"no builder at {BUILDER}"
    spec = importlib.util.spec_from_file_location("land_prices_etl", BUILDER)
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


def _excerpt() -> list[dict]:
    path = FIXTURES / "ksj_L01-26_tokyo23.csv"
    assert path.is_file(), f"no excerpt at {path}"
    return list(csv.DictReader(path.read_text(encoding="utf-8").splitlines()))


def _recomputed() -> dict[str, dict[str, dict]]:
    """Per ward code and use, n / mean price / n continuing / mean change,
    straight from the CSV without build(): the simple mean of price over every
    point of the use, the simple mean of change over its 継続 points."""
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in _excerpt():
        groups[(r["code"], r["use"])].append(r)
    out: dict[str, dict[str, dict]] = {}
    for code in WARD_CODES:
        out[code] = {}
        for use, use_code in USES.items():
            rows = groups.get((code, use_code), [])
            prices = [int(r["price"]) for r in rows]
            changes = [float(r["change"]) for r in rows if int(r["status"]) == CONTINUING]
            out[code][use] = {
                "n": len(prices),
                "meanPrice": round(sum(prices) / len(prices)) if prices else None,
                "nContinuing": len(changes),
                "meanChange": round(sum(changes) / len(changes), 4) if changes else None,
            }
        out[code]["industrial"] = {"n": len(groups.get((code, INDUSTRIAL), []))}
        out[code]["n"] = sum(len(rows) for (c, _), rows in groups.items() if c == code)
    return out


def test_fixture_is_the_pinned_edition(meta):
    assert meta["L01"]["id"] == L01_ID and meta["L01"]["sha256"] == L01_SHA256
    assert meta["L01"]["reference_date"] == REFERENCE_DATE and meta["L01"]["year"] == 2026
    assert "CC_BY_4.0" in meta["L01"]["licence"]
    rows = _excerpt()
    assert len(rows) == meta["L01"]["rows_kept"]
    assert {r["code"] for r in rows} == set(WARD_CODES)
    assert all(r["year"] == "2026" for r in rows)


def test_the_excerpt_change_is_the_rounded_ratio_of_the_two_price_columns():
    """On every 継続 row L01_009 equals (L01_105 − L01_104) × 100 ÷ L01_104, half-up to one decimal."""
    from decimal import ROUND_HALF_UP, Decimal

    off = []
    for r in _excerpt():
        if int(r["status"]) != CONTINUING:
            continue
        prev, cur = int(r["previous_price"]), int(r["price"])
        expected = float(Decimal(str((cur - prev) * 100 / prev)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
        if abs(expected - float(r["change"])) > 1e-9:
            off.append((r["code"], r["use"], r["seq"], prev, cur, r["change"]))
    assert off == []


def test_every_ward_has_both_uses_and_the_figures_are_the_simple_means(built):
    recomputed = _recomputed()
    assert [w["code"] for w in built["wards"]] == WARD_CODES
    for w in built["wards"]:
        mine = recomputed[w["code"]]
        for use in USES:
            assert w[use]["n"] >= 1, (w["name"], use)
            assert {k: w[use][k] for k in ("n", "meanPrice", "nContinuing", "meanChange")} == mine[use], (w["name"], use)
            assert w[use]["nContinuing"] <= w[use]["n"]
            assert w[use]["minPrice"] <= w[use]["meanPrice"] <= w[use]["maxPrice"]
        assert w["industrial"] == mine["industrial"]
        assert "meanPrice" not in w["industrial"], "工業地 gets a count, not a series"
        assert w["n"] == mine["n"] == w["residential"]["n"] + w["commercial"]["n"] + w["industrial"]["n"]


def test_the_23_ward_totals_are_the_same_means_over_every_point(built):
    rows = _excerpt()
    for use, use_code in USES.items():
        prices = [int(r["price"]) for r in rows if r["use"] == use_code]
        changes = [float(r["change"]) for r in rows if r["use"] == use_code and int(r["status"]) == CONTINUING]
        assert built["total"][use]["n"] == len(prices)
        assert built["total"][use]["meanPrice"] == round(sum(prices) / len(prices))
        assert built["total"][use]["meanChange"] == round(sum(changes) / len(changes), 4)
    assert built["total"]["n"] == len(rows) == sum(w["n"] for w in built["wards"])
    assert built["total"]["industrial"]["n"] == sum(1 for r in rows if r["use"] == INDUSTRIAL)


def test_builder_names_the_year_the_sources_the_licence_and_the_credits(built, meta):
    assert built["year"] == meta["L01"]["year"] == 2026
    assert built["referenceDate"] == REFERENCE_DATE
    for key in ("price", "change"):
        assert built["sources"][key]["year"] == built["year"]
        assert built["sources"][key]["table"] == L01_ID
        assert built["sources"][key]["label"].strip()
    assert "2026年1月1日" in built["sources"]["price"]["label"]
    assert "令和8年" in built["sources"]["price"]["label"]
    assert built["credit"]["edited_l01"] == EDITED_L01
    assert built["credit"]["source"].startswith("出典：国土交通省国土数値情報ダウンロードサイト")
    assert "をもとに" not in built["credit"]["edited_l01"]
    assert built["notes"]["price"] == PRICE_NOTE
    assert built["notes"]["change"] == CHANGE_NOTE
    assert built["licence"]["url"] == "https://nlftp.mlit.go.jp/ksj/other/agreement.html"
    assert built["inputs"]["ksj_L01-26_tokyo23.csv"]["cut_from"]["sha256"] == L01_SHA256
    assert built["uses"] == {"residential": {"code": "000", "label": "住宅地"}, "commercial": {"code": "005", "label": "商業地"}}


# --- the snapshot ------------------------------------------------------------------


def _snapshot() -> dict:
    assert SNAPSHOT.is_file(), f"no snapshot at {SNAPSHOT}"
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def test_snapshot_is_a_fresh_build_from_the_committed_source_file(built):
    assert built == _snapshot()


def test_nothing_in_the_backend_fetches_reinfolib_or_the_network_for_land_prices():
    service = BACKEND / "services" / "land_prices.py"
    assert service.is_file(), "no services/land_prices.py — the route must read the committed snapshot"
    text = service.read_text(encoding="utf-8")
    assert "httpx" not in text and "reinfolib" not in text.lower()


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


def test_route_is_401_without_a_token_and_403_pending(client):
    assert client.get(ROUTE).status_code == 401
    resp = client.get(ROUTE, headers=PENDING)
    assert resp.status_code == 403
    assert resp.json() == {"status": "pending_activation"}


def test_route_serves_the_23_wards_with_both_uses_and_their_counts(client, built):
    resp = client.get(ROUTE, headers=ACTIVE)
    assert resp.status_code == 200, resp.text[:300]
    body = resp.json()
    assert body["status"] == "ok" and body["isLive"] is True
    assert "unavailable" not in body and "fetchedAt" not in body
    rows = body["data"]
    assert [r["code"] for r in rows] == WARD_CODES
    by_code = {w["code"]: w for w in built["wards"]}
    for r in rows:
        w = by_code[r["code"]]
        assert r["region"] == w["name"]
        for use in USES:
            assert r[use] == w[use], (r["region"], use)
            assert isinstance(r[use]["n"], int) and r[use]["n"] >= 1
        assert r["industrial"] == w["industrial"]
        assert r["n"] == w["n"]


def test_route_envelope_names_the_year_and_table_of_the_figures(client, built):
    body = client.get(ROUTE, headers=ACTIVE).json()
    sources = body.get("sources")
    assert isinstance(sources, dict), "no `sources` in the envelope"
    assert sources == built["sources"]
    assert sources["price"]["year"] == 2026 and sources["price"]["table"] == L01_ID


def test_route_does_not_touch_the_network(client, monkeypatch):
    import httpx

    def explode(*args, **kwargs):
        raise AssertionError("the land-prices route serves a committed file, never an upstream")

    monkeypatch.setattr(httpx.AsyncClient, "__init__", explode, raising=False)
    monkeypatch.setattr(httpx, "get", explode, raising=False)
    assert client.get(ROUTE, headers=ACTIVE).status_code == 200


# --- startup validation ---------------------------------------------------------------


def _import_main_with(path: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "LAND_PRICES_PATH": str(path)}
    return subprocess.run(
        [sys.executable, "-c", "import main"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=60
    )


def test_startup_refuses_a_missing_snapshot(tmp_path):
    proc = _import_main_with(tmp_path / "missing.json")
    assert proc.returncode != 0, "the app started without its land-prices snapshot"
    assert "land_prices" in proc.stderr


def _ward(s: dict, name: str) -> dict:
    return next(w for w in s["wards"] if w["name"] == name)


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda s: s["wards"].clear(), id="no wards"),
        pytest.param(lambda s: s["wards"].remove(_ward(s, "江戸川区")), id="a ward missing"),
        pytest.param(lambda s: _ward(s, "千代田区")["residential"].update({"n": 0, "meanPrice": None}), id="a use without points"),
        pytest.param(lambda s: _ward(s, "千代田区")["commercial"].__setitem__("meanPrice", "7356538"), id="a price as text"),
        pytest.param(lambda s: _ward(s, "江戸川区")["residential"].__setitem__("meanChange", None), id="change missing while points continue"),
        pytest.param(lambda s: _ward(s, "江戸川区")["residential"].__setitem__("nContinuing", 1000), id="more continuing than points"),
        pytest.param(lambda s: _ward(s, "江戸川区").__setitem__("n", 1), id="ward total not the sum of its uses"),
        pytest.param(lambda s: s["sources"].pop("price"), id="the price source missing"),
        pytest.param(lambda s: s["sources"]["change"].__setitem__("year", 2025), id="a source year off the snapshot's"),
        pytest.param(lambda s: s["credit"].pop("edited_l01"), id="the 加工 credit missing"),
        pytest.param(lambda s: s["credit"].__setitem__("edited_l01", "「国土数値情報（地価公示データ）」（国土交通省）をもとにX社作成"), id="an editor name in the credit"),
    ],
)
def test_startup_refuses_a_malformed_snapshot(tmp_path, mutate):
    snapshot = _snapshot()
    mutate(snapshot)
    bad = tmp_path / "land_prices.json"
    bad.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    proc = _import_main_with(bad)
    assert proc.returncode != 0, "the app started on a malformed snapshot"
    assert "land_prices" in proc.stderr


def test_startup_accepts_the_committed_snapshot():
    proc = _import_main_with(SNAPSHOT)
    assert proc.returncode == 0, proc.stderr[-800:]


def test_validator_rejects_a_non_finite_figure():
    land_prices = importlib.import_module("services.land_prices")
    snapshot = _snapshot()
    _ward(snapshot, "千代田区")["residential"]["meanChange"] = float("nan")
    with pytest.raises(land_prices.SnapshotError):
        land_prices.validate(snapshot)
    snapshot = _snapshot()
    _ward(snapshot, "千代田区")["commercial"]["meanPrice"] = math.inf
    with pytest.raises(land_prices.SnapshotError):
        land_prices.validate(snapshot)


def test_snapshot_path_defaults_to_backend_data(monkeypatch):
    monkeypatch.delenv("LAND_PRICES_PATH", raising=False)
    assert settings.LAND_PRICES_PATH == BACKEND / "data" / "land_prices.json"
    monkeypatch.setenv("LAND_PRICES_PATH", "/elsewhere/land_prices.json")
    assert settings.LAND_PRICES_PATH == Path("/elsewhere/land_prices.json")
