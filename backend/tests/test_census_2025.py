"""PR 2 of the real-data plan (RECON 2026-10-uo-real-data §9 row 2): one census vintage.

Every census figure the dashboard shows — population, density, age shares,
growth rate — comes from the 令和7年国勢調査 人口等基本集計（確報）, published
2026-09-29, and density is the 2025 population over the ward's area in the
国土地理院 面積調 whose reference date is the census date (令和7年10月1日時点).
Main today mixes three vintages: 2020 census population, density and age
(table 0003448299), a 2025 速報 growth rate (0004050417), and four ward areas
that match no edition of the 面積調 (港区, 江東区, 品川区, 大田区).

Nothing here is typed by hand. The expected figures are built by
fixtures/census_2025/build_expected.py from the raw e-Stat responses and the
面積調 CSV excerpt committed beside it (README.md there has the provenance);
e-Stat is scripted at the HTTP layer from those same files, per table, so the
guards do not depend on how the service is factored. The two legacy tables
main reads are served too, from fixtures/census_2025/legacy/, so on main the
route answers 200 with its 2020 / 速報 figures and each guard fails on the
figure, not on a missing stub.

PR 1's contract is kept: a census table failing is HTTP 503
{"status":"unavailable"}; the growth table failing is 200 "partial" with
unavailable ["growthRate"]; each table is cached on its own and only when it
answered. New in PR 2: the envelope carries ``sources`` — for each census
field the year, the e-Stat table and a label — so every figure on screen can
say which vintage it is, and the K1 tile can name its own table.

RED on main (b7b24b4).
"""

import importlib.util
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import core.authz as authz
from core import cache
from core.database import get_session
from main import app

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "census_2025"
EXPECTED = json.loads((FIXTURES / "expected.json").read_text(encoding="utf-8"))
WARDS: dict[str, dict] = EXPECTED["wards"]
TABLES: dict[str, str] = EXPECTED["meta"]["tables"]
POPULATION_TABLE, GROWTH_TABLE, AGE_TABLE = (
    TABLES["population"],
    TABLES["growthRate"],
    TABLES["ageGroups"],
)
AREA_EDITION = EXPECTED["meta"]["area"]["edition"]
CENSUS_YEAR = int(EXPECTED["meta"]["reference_date"][:4])

# What main serves today: the 2020 census table and the 2025 速報 growth table.
LEGACY_CENSUS_2020 = "0003448299"
LEGACY_SOKUHO_GROWTH = "0004050417"

EDOGAWA, CHIYODA = "13123", "13101"
CENSUS_FIELDS = ("population", "density", "ageGroups", "growthRate")

ACTIVE = {"Authorization": "Bearer active-token"}
ACTIVE_CLAIMS = {
    "sub": "gipuid_census_2025_000001",
    "email": "analyst@customcorp.jp",
    "email_verified": True,
}


def _raw(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# Raw e-Stat bodies, keyed by statsDataId, exactly as the API answered.
ESTAT_BODIES: dict[str, dict] = {
    POPULATION_TABLE: _raw(FIXTURES / f"estat_{POPULATION_TABLE}_wards.json"),
    GROWTH_TABLE: _raw(FIXTURES / f"estat_{GROWTH_TABLE}_wards.json"),
    AGE_TABLE: _raw(FIXTURES / f"estat_{AGE_TABLE}_wards.json"),
    LEGACY_CENSUS_2020: _raw(FIXTURES / "legacy" / f"estat_{LEGACY_CENSUS_2020}_wards.json"),
    LEGACY_SOKUHO_GROWTH: _raw(FIXTURES / "legacy" / f"estat_{LEGACY_SOKUHO_GROWTH}_wards.json"),
}


def _sokuho_growth(area: str) -> float:
    """The 速報 table's 5年間の人口増減率 for a ward — what main shows today."""
    values = ESTAT_BODIES[LEGACY_SOKUHO_GROWTH]["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
    return float(next(v["$"] for v in values if v["@area"] == area and v["@tab"] == "2025_35"))


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    monkeypatch.delenv("ODPT_API_KEY", raising=False)
    monkeypatch.setattr(
        authz, "decode_auth_token", lambda tok: ACTIVE_CLAIMS if tok == "active-token" else None
    )
    cache.clear()

    def _session_override():
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    yield TestClient(app)
    app.dependency_overrides.clear()
    cache.clear()


@pytest.fixture()
def estat(client, monkeypatch):
    """e-Stat at the HTTP layer, answering each table from its committed body.

    ``estat["status"][id]`` overrides the HTTP status of one table;
    ``estat["calls"]`` counts requests per table; ``estat["requested"]`` is the
    ordered list of every statsDataId asked for.
    """
    monkeypatch.setenv("ESTAT_API_KEY", "test-estat-key")
    state: dict = {"status": {}, "calls": {}, "requested": []}

    def handler(request: httpx.Request) -> httpx.Response:
        table = request.url.params.get("statsDataId")
        state["requested"].append(table)
        state["calls"][table] = state["calls"].get(table, 0) + 1
        status = state["status"].get(table, 200)
        if status != 200:
            return httpx.Response(status, json={})
        body = ESTAT_BODIES.get(table)
        if body is None:
            return httpx.Response(404, json={"unknown statsDataId": table})
        return httpx.Response(200, json=body)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *args, **kwargs: real_client(*args, transport=httpx.MockTransport(handler), **kwargs),
    )
    return state


def _get(client):
    return client.get("/api/v1/demographics", headers=ACTIVE)


def _records(body: dict) -> dict[str, dict]:
    return {r["region"]: r for r in body["data"]}


def _ok_body(client) -> dict:
    resp = _get(client)
    assert resp.status_code == 200, resp.text[:300]
    body = resp.json()
    assert body.get("status") == "ok", body.get("status")
    return body


# --- the fixture is what the source files say ---------------------------------


def test_expected_json_is_a_fresh_build_from_the_source_files():
    """Drift guard: expected.json must equal what build_expected.py derives now."""
    spec = importlib.util.spec_from_file_location("build_expected", FIXTURES / "build_expected.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.build() == EXPECTED


# --- ward areas: the 面積調 edition of the census date ---------------------------


def test_ward_area_constants_are_the_r7_10_01_mencho_values():
    """Every pinned area equals 令和7年10月1日時点 面積調 (= e-Stat 面積（参考）)."""
    from services.demographics import TOKYO_WARDS

    pinned = {code: area for code, (_name, area) in TOKYO_WARDS.items()}
    published = {code: w["area_km2"] for code, w in WARDS.items()}
    mismatched = {
        code: (pinned[code], published[code]) for code in published if pinned.get(code) != published[code]
    }
    assert mismatched == {}, f"pinned → {AREA_EDITION}: {mismatched}"


# --- every figure is the 2025 確報, for all 23 wards ---------------------------


def test_population_is_the_2025_kakuho_total_for_all_23_wards(client, estat):
    records = _records(_ok_body(client))
    wrong = {
        w["name"]: (records[w["name"]]["population"], w["population"])
        for w in WARDS.values()
        if records[w["name"]]["population"] != w["population"]
    }
    assert wrong == {}, f"(served, 2025 確報): {wrong}"


def test_density_is_the_2025_population_over_the_pinned_area_for_all_23_wards(client, estat):
    """density = 2025 population / 面積調 令和7年10月1日 area, rounded to a whole person;
    within one of e-Stat's own 人口密度 column, which is the same quotient."""
    records = _records(_ok_body(client))
    wrong = {}
    for w in WARDS.values():
        served = records[w["name"]]["density"]
        expected = round(w["population"] / w["area_km2"])
        if served != expected or abs(served - w["density_estat"]) >= 1:
            wrong[w["name"]] = (served, expected, w["density_estat"])
    assert wrong == {}, f"(served, pop/area, e-Stat 人口密度): {wrong}"


def test_age_shares_are_the_2025_fushokanchi_shares_for_all_23_wards(client, estat):
    """Each of the three shares is the 不詳補完値 table's value, rounded to a whole percent."""
    records = _records(_ok_body(client))
    wrong = {}
    for w in WARDS.values():
        served = records[w["name"]]["ageGroups"]
        expected = {k: round(v) for k, v in w["age_share"].items()}
        if served != expected:
            wrong[w["name"]] = (served, expected)
    assert wrong == {}, f"(served, 2025 不詳補完値): {wrong}"


def test_growth_rate_is_the_2025_kakuho_value_for_all_23_wards(client, estat):
    records = _records(_ok_body(client))
    wrong = {
        w["name"]: (records[w["name"]]["growthRate"], w["growth_rate"])
        for w in WARDS.values()
        if records[w["name"]]["growthRate"] != pytest.approx(w["growth_rate"])
    }
    assert wrong == {}, f"(served, 2025 確報): {wrong}"


def test_edogawa_growth_rate_is_the_kakuho_value_not_the_sokuho(client, estat):
    """江戸川区: the 確報 table (0004065882) says one thing, the 速報 (0004050417) another."""
    edogawa = _records(_ok_body(client))["江戸川区"]
    kakuho, sokuho = WARDS[EDOGAWA]["growth_rate"], _sokuho_growth(EDOGAWA)
    assert kakuho != pytest.approx(sokuho), "fixture sanity: the two tables differ for 江戸川区"
    assert edogawa["growthRate"] == pytest.approx(kakuho), (
        f"served {edogawa['growthRate']} — 確報 {kakuho}, 速報 {sokuho}"
    )


def test_neither_the_2020_census_nor_the_sokuho_table_is_requested(client, estat):
    _ok_body(client)
    asked = set(estat["requested"])
    assert asked <= {POPULATION_TABLE, GROWTH_TABLE, AGE_TABLE}, sorted(asked)
    assert LEGACY_CENSUS_2020 not in asked and LEGACY_SOKUHO_GROWTH not in asked, sorted(asked)


# --- the payload says which vintage every figure is ---------------------------


def test_envelope_names_the_year_and_table_of_every_census_field(client, estat):
    sources = _ok_body(client).get("sources")
    assert isinstance(sources, dict), "no `sources` in the envelope"
    assert set(CENSUS_FIELDS) <= set(sources), sorted(sources)
    years = {field: sources[field].get("year") for field in CENSUS_FIELDS}
    assert years == {field: CENSUS_YEAR for field in CENSUS_FIELDS}, years
    assert sources["population"]["table"] == POPULATION_TABLE
    assert sources["growthRate"]["table"] == GROWTH_TABLE
    assert sources["ageGroups"]["table"] == AGE_TABLE
    assert "不詳補完値" in sources["ageGroups"]["label"], sources["ageGroups"]
    # Density is the population table's figure over the 面積調 area: both named.
    assert sources["density"]["table"] == POPULATION_TABLE
    assert AREA_EDITION in sources["density"]["label"], sources["density"]
    for field in CENSUS_FIELDS:
        assert "確報" in sources[field]["label"] or "不詳補完値" in sources[field]["label"], sources[field]
        assert "速報" not in sources[field]["label"], sources[field]


# --- PR 1's contract, kept across the new tables -------------------------------


def _assert_unavailable(resp):
    assert resp.status_code == 503, f"expected 503, got {resp.status_code}: {resp.text[:200]}"
    assert resp.json() == {"status": "unavailable"}


@pytest.mark.parametrize("table", [POPULATION_TABLE, AGE_TABLE])
def test_a_census_table_failing_is_a_full_failure(client, estat, table):
    """Population and age shares are the answer: either table down ⇒ 503, no data."""
    estat["status"][table] = 503
    _assert_unavailable(_get(client))


def test_growth_table_failing_is_partial_and_drops_its_source(client, estat):
    estat["status"][GROWTH_TABLE] = 503
    resp = _get(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "partial", body.get("status")
    assert body.get("unavailable") == ["growthRate"], body.get("unavailable")
    assert body["isLive"] is True
    records = _records(body)
    assert records["千代田区"]["population"] == WARDS[CHIYODA]["population"]
    assert all(r["growthRate"] is None for r in records.values())
    sources = body.get("sources") or {}
    assert "growthRate" not in sources, "nothing on screen to attribute"
    assert {"population", "density", "ageGroups"} <= set(sources), sorted(sources)


def test_each_table_is_cached_on_its_own_and_only_when_it_answered(client, estat):
    """Age table down twice: 503 twice, the population table asked once; it
    recovers: complete answer, population still once, then cache."""
    estat["status"][AGE_TABLE] = 503
    _assert_unavailable(_get(client))
    _assert_unavailable(_get(client))
    assert estat["calls"].get(POPULATION_TABLE) == 1, estat["calls"]
    assert estat["calls"].get(AGE_TABLE) == 2, estat["calls"]

    estat["status"].pop(AGE_TABLE)
    body = _ok_body(client)
    assert "unavailable" not in body
    assert _records(body)["江戸川区"]["growthRate"] == pytest.approx(WARDS[EDOGAWA]["growth_rate"])
    assert estat["calls"] == {POPULATION_TABLE: 1, AGE_TABLE: 3, GROWTH_TABLE: 1}, estat["calls"]

    _ok_body(client)
    assert estat["calls"] == {POPULATION_TABLE: 1, AGE_TABLE: 3, GROWTH_TABLE: 1}, "served from cache"
