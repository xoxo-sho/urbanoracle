"""PR 3 of the real-data plan (RECON 2026-10-uo-real-data §9 row 3): 人口推移 from the census.

The 人口推移（東京23区） chart on the 人口 tab shows six points, 2000–2025. On
main they are ``samplePopulationTrends`` in src/data/sample.ts: five census
totals typed by hand with no source, and a 2025 figure (9,820,000) that is
neither the 速報 nor the 確報.

This PR replaces them with a committed snapshot, ``backend/data/
population_trends.json``, built by ``etl/population_trends.py`` from committed
source files — the 23-ward rows of the e-Stat 時系列 第6表 workbook for 2000–2020
(fixtures/population_trends/) and the 2025 確報 population table PR 2 committed
(fixtures/census_2025/) — and served by a new gated route,
``GET /api/v1/population-trends``, with the same ``sources`` envelope as
/demographics: per point, the year, the e-Stat table and a label. The route
has no upstream, so the snapshot is validated when the app starts: a missing
or malformed file stops the process (and so the deploy), never a request.

Architect decisions (2026-11-01): the 2025 point is the 確報 (table
0004065881), one vintage with the rest of the 人口 tab; the snapshot lives
under backend/data/ behind require_active, on its own route so a census-table
503 on /demographics cannot take the chart down.

Nothing below is typed by hand: every expected figure is read from the
committed source files, and the snapshot must equal a fresh build from them.

RED on main (149a782).
"""

import csv
import importlib
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import core.authz as authz
from core import cache
from core.database import get_session
from main import app

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
FIXTURES = BACKEND / "tests" / "fixtures"
TREND_FIXTURES = FIXTURES / "population_trends"
CENSUS_FIXTURES = FIXTURES / "census_2025"
SNAPSHOT = BACKEND / "data" / "population_trends.json"
BUILDER = ROOT / "etl" / "population_trends.py"
ROUTE = "/api/v1/population-trends"
REGION = "東京23区"

WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]
SPECIAL_WARDS = "13100"

# The sample value for 2025 (src/data/sample.ts @ 149a782). On screen or in
# a response it is the sample leaking.
SAMPLE_2025 = 9_820_000

ACTIVE = {"Authorization": "Bearer active-token"}
PENDING = {"Authorization": "Bearer pending-token"}
TOKENS = {
    "active-token": {"sub": "gipuid_trends_active_00001", "email": "analyst@customcorp.jp", "email_verified": True},
    "pending-token": {"sub": "gipuid_trends_pending_0001", "email": "visitor@gmail.com", "email_verified": False},
}


# --- expected values, from the committed source files only ---------------------

META = json.loads((TREND_FIXTURES / "estat_000001085987.meta.json").read_text(encoding="utf-8"))
TIMESERIES_TABLE = META["stat_infid"]
CENSUS_EXPECTED = json.loads((CENSUS_FIXTURES / "expected.json").read_text(encoding="utf-8"))
POPULATION_TABLE = CENSUS_EXPECTED["meta"]["tables"]["population"]
GROWTH_TABLE = CENSUS_EXPECTED["meta"]["tables"]["growthRate"]


def _excerpt_rows() -> list[dict]:
    path = TREND_FIXTURES / f"estat_{TIMESERIES_TABLE}_tokyo23.csv"
    return list(csv.DictReader(path.read_text(encoding="utf-8").splitlines()))


def _estat_values(table: str) -> list[dict]:
    body = json.loads((CENSUS_FIXTURES / f"estat_{table}_wards.json").read_text(encoding="utf-8"))
    values = body["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
    return values if isinstance(values, list) else [values]


def timeseries_totals() -> dict[int, int]:
    """year -> 特別区部 total, from the 時系列 excerpt."""
    return {int(r["year"]): int(r["total"]) for r in _excerpt_rows() if r["code"] == SPECIAL_WARDS}


def timeseries_wards() -> dict[int, dict[str, int]]:
    out: dict[int, dict[str, int]] = {}
    for r in _excerpt_rows():
        if r["code"] in WARD_CODES:
            out.setdefault(int(r["year"]), {})[r["code"]] = int(r["total"])
    return out


def kakuho_2025_wards() -> dict[str, int]:
    return {
        v["@area"]: int(v["$"])
        for v in _estat_values(POPULATION_TABLE)
        if v["@tab"] == "2025_01" and v["@cat01"] == "0"
    }


def kumikae_2020_wards() -> dict[str, int]:
    return {v["@area"]: int(v["$"]) for v in _estat_values(GROWTH_TABLE) if v["@tab"] == "2025_03"}


EXPECTED_TOTALS: dict[int, int] = {**timeseries_totals(), 2025: sum(kakuho_2025_wards().values())}
EXPECTED_TABLES: dict[int, str] = {**{y: TIMESERIES_TABLE for y in timeseries_totals()}, 2025: POPULATION_TABLE}
YEARS = sorted(EXPECTED_TOTALS)


def test_fixture_sanity_the_sources_agree_with_each_other():
    """The 時系列 2020 sheet and the 確報's 2020年（組替） are the same basis: equal per ward."""
    assert timeseries_wards()[2020] == kumikae_2020_wards()
    assert sum(kumikae_2020_wards().values()) == EXPECTED_TOTALS[2020]
    assert YEARS == [2000, 2005, 2010, 2015, 2020, 2025]
    assert EXPECTED_TOTALS[2025] != SAMPLE_2025


# --- fixtures -----------------------------------------------------------------


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


def _snapshot() -> dict:
    assert SNAPSHOT.is_file(), f"no snapshot at {SNAPSHOT}"
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def _service():
    return importlib.import_module("services.population_trends")


def _builder():
    assert BUILDER.is_file(), f"no builder at {BUILDER}"
    spec = importlib.util.spec_from_file_location("population_trends_etl", BUILDER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --- the snapshot is what the source files say ----------------------------------


def test_snapshot_is_a_fresh_build_from_the_committed_source_files():
    """Drift guard: backend/data/population_trends.json equals build() now."""
    assert _builder().build() == _snapshot()


def test_snapshot_points_are_the_six_census_totals_with_their_tables():
    points = {p["year"]: p for p in _snapshot()["points"]}
    assert sorted(points) == YEARS
    wrong = {y: (points[y]["population"], EXPECTED_TOTALS[y]) for y in YEARS if points[y]["population"] != EXPECTED_TOTALS[y]}
    assert wrong == {}, f"(snapshot, source): {wrong}"
    assert {y: points[y]["table"] for y in YEARS} == EXPECTED_TABLES


def test_snapshot_keeps_the_23_ward_rows_and_they_sum_to_the_total():
    ts, k2025 = timeseries_wards(), kakuho_2025_wards()
    for point in _snapshot()["points"]:
        wards = {w["code"]: w["population"] for w in point["wards"]}
        assert sorted(wards) == WARD_CODES, point["year"]
        assert sum(wards.values()) == point["population"], point["year"]
        assert wards == (k2025 if point["year"] == 2025 else ts[point["year"]]), point["year"]


def test_snapshot_sources_name_a_year_table_and_label_per_point():
    snapshot = _snapshot()
    sources = snapshot["sources"]
    assert sorted(int(k) for k in sources) == YEARS
    for year in YEARS:
        entry = sources[str(year)]
        assert entry["year"] == year
        assert entry["table"] == EXPECTED_TABLES[year]
        assert entry["label"].strip()
    assert "速報" not in json.dumps(sources, ensure_ascii=False)
    assert "確報" in sources["2025"]["label"]


def test_snapshot_records_its_inputs_licence_and_credit():
    snapshot = _snapshot()
    inputs = snapshot["inputs"]
    excerpt = inputs[f"estat_{TIMESERIES_TABLE}_tokyo23.csv"]
    assert excerpt["cut_from"]["sha256"] == META["sha256"]
    assert excerpt["cut_from"]["url"] == META["url"]
    assert excerpt["cut_from"]["open_date"] == META["open_date"]
    assert inputs[f"estat_{POPULATION_TABLE}_wards.json"]["table"] == POPULATION_TABLE
    assert inputs[f"estat_{POPULATION_TABLE}_wards.json"]["open_date"] == "2026-09-29"
    assert snapshot["licence"]["url"] == "https://www.e-stat.go.jp/terms-of-use"
    assert snapshot["credit"]["source"].startswith("出典：政府統計の総合窓口(e-Stat)")
    assert "加工して作成" in snapshot["credit"]["edited"]
    assert snapshot["region"] == REGION


# --- the route ------------------------------------------------------------------


def _rows(body: dict) -> dict[tuple[str, int], int]:
    return {(r["region"], r["year"]): r["population"] for r in body["data"]}


def test_route_is_401_without_a_token_and_403_pending(client):
    assert client.get(ROUTE).status_code == 401
    resp = client.get(ROUTE, headers=PENDING)
    assert resp.status_code == 403
    assert resp.json() == {"status": "pending_activation"}


def test_route_serves_the_six_totals_from_the_snapshot(client):
    resp = client.get(ROUTE, headers=ACTIVE)
    assert resp.status_code == 200, resp.text[:300]
    body = resp.json()
    assert body["status"] == "ok"
    assert "isLive" not in body
    rows = _rows(body)
    served = {y: rows[(REGION, y)] for y in YEARS}
    assert served == EXPECTED_TOTALS, f"(served, source): {served} vs {EXPECTED_TOTALS}"
    assert SAMPLE_2025 not in rows.values()


def test_route_serves_the_ward_rows_too(client):
    rows = _rows(client.get(ROUTE, headers=ACTIVE).json())
    names = {w["name"] for p in _snapshot()["points"] for w in p["wards"]}
    assert len(names) == 23
    for year in YEARS:
        assert sum(rows[(name, year)] for name in names) == EXPECTED_TOTALS[year], year


def test_route_envelope_names_the_year_and_table_of_every_point(client):
    body = client.get(ROUTE, headers=ACTIVE).json()
    sources = body.get("sources")
    assert isinstance(sources, dict), "no `sources` in the envelope"
    assert sorted(int(k) for k in sources) == YEARS
    for year in YEARS:
        assert sources[str(year)]["year"] == year
        assert sources[str(year)]["table"] == EXPECTED_TABLES[year]
        assert isinstance(sources[str(year)]["label"], str) and sources[str(year)]["label"]


def test_route_does_not_touch_the_network(client, monkeypatch):
    """Every upstream call in this backend goes through httpx.AsyncClient (the
    TestClient itself is a sync httpx.Client, so that one is left alone)."""
    import httpx

    def explode(*args, **kwargs):
        raise AssertionError("the trend route serves a committed file, never an upstream")

    monkeypatch.setattr(httpx.AsyncClient, "__init__", explode, raising=False)
    monkeypatch.setattr(httpx, "get", explode, raising=False)
    assert client.get(ROUTE, headers=ACTIVE).status_code == 200


# --- startup validation ---------------------------------------------------------


def _import_main_with(path: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "POPULATION_TRENDS_PATH": str(path)}
    return subprocess.run(
        [sys.executable, "-c", "import main"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=60
    )


def test_startup_refuses_a_missing_snapshot(tmp_path):
    proc = _import_main_with(tmp_path / "missing.json")
    assert proc.returncode != 0, "the app started without its snapshot"
    assert "population_trends" in proc.stderr


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda s: s["points"].pop(), id="a point missing"),
        pytest.param(lambda s: s["points"][0]["wards"].pop(), id="a ward missing"),
        pytest.param(lambda s: s["points"][-1].__setitem__("population", SAMPLE_2025), id="total not the sum of wards"),
        pytest.param(lambda s: s["sources"].pop("2025"), id="a source missing"),
        pytest.param(lambda s: s["points"][1]["wards"][0].__setitem__("population", None), id="a null figure"),
    ],
)
def test_startup_refuses_a_malformed_snapshot(tmp_path, mutate):
    snapshot = _snapshot()
    mutate(snapshot)
    bad = tmp_path / "population_trends.json"
    bad.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    proc = _import_main_with(bad)
    assert proc.returncode != 0, "the app started on a malformed snapshot"
    assert "population_trends" in proc.stderr


def test_startup_accepts_the_committed_snapshot():
    proc = _import_main_with(SNAPSHOT)
    assert proc.returncode == 0, proc.stderr[-800:]


def test_validator_rejects_a_non_finite_or_non_integer_figure(tmp_path):
    service = _service()
    snapshot = _snapshot()
    snapshot["points"][0]["wards"][0]["population"] = 1.5
    with pytest.raises(service.SnapshotError):
        service.validate(snapshot)
    snapshot = _snapshot()
    snapshot["points"][0]["population"] = float("nan")
    with pytest.raises(service.SnapshotError):
        service.validate(snapshot)
