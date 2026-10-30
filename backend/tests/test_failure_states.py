"""PR 1 of the real-data plan (RECON 2026-10-uo-real-data §9; §7.1 F1, F3, F4, F5).

An upstream failure must come back as something the client can tell apart
from data — never as sample values, and never as a null that reads like
"not published".

Architect decisions (Stage 2): a full failure is **HTTP 503** with the body
``{"status": "unavailable"}`` and nothing else — a 200 would hide an upstream
outage from Cloud Run's error metrics. A partial answer is 200 with
``status: "partial"`` and ``unavailable`` naming the record field(s) the
upstream did not deliver, so the client renders those cells as 取得失敗 and
keeps データなし for a cell the upstream genuinely has no figure for.

The demographics route fetches two e-Stat tables and they are classed
differently (Stage 2c):

* ``0003448299`` (2020 census: population, density, age shares) — a **full
  failure**. Every figure and the ward rows themselves come from it; without
  it there is nothing meaningful to show, so 503.
* ``0004050417`` tab ``2025_35`` (5-year growth rate) — a **partial**. It
  feeds ``growthRate`` only; the census figures stand on their own, so the
  answer is 200 ``partial`` with ``unavailable: ["growthRate"]``.

Caching: a 503 or a partial answer is never stored as a complete answer. The
healthy census table is cached on its own, and the growth table is retried
on the next request; the transport route keeps nothing from a partial or
failed answer (its healthy half is a local file) and retries ODPT or the
file on the next request.
"""

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import core.authz as authz
from core import cache
from core.database import get_session
from main import app
from services import demographics, odpt, transport

ACTIVE = {"Authorization": "Bearer active-token"}
ACTIVE_CLAIMS = {
    "sub": "gipuid_failure_states_0001",
    "email": "analyst@customcorp.jp",
    "email_verified": True,
}

# Values that exist only in the sample set (src/data/sample.ts and its copy
# backend/data/sample_fallback.json @ 8d17736): 千代田区 population 67,927 and
# 新宿駅 ridership 775,386. Either one in a failure response is the sample leaking.
SAMPLE_DEMOGRAPHICS_MARKER = "67927"
SAMPLE_STATION_MARKER = "775386"

SAMPLE_FALLBACK_JSON = Path(__file__).resolve().parents[1] / "data" / "sample_fallback.json"

# 千代田区 as the two e-Stat tables yield it: the 2020 census cells
# transform_estat reads (total 66,680 — the test_demographics fixture) and the
# published 2025 速報 growth rate (−0.72136, the official file's row 686).
CENSUS_ROWS = [
    {"@area": "13101", "@tab": "020", "@cat01": "100", "@cat02": "100", "$": "66680"},
    {"@area": "13101", "@tab": "020", "@cat01": "110", "@cat02": "100", "$": "6000"},
    {"@area": "13101", "@tab": "020", "@cat01": "130", "@cat02": "100", "$": "10000"},
]
GROWTH_ROWS = [{"@area": "13101", "@tab": demographics.GROWTH_TAB_CODE, "$": "-0.72136"}]
CHIYODA_GROWTH = -0.72136


def _estat_body(values: list[dict]) -> dict:
    return {
        "GET_STATS_DATA": {
            "RESULT": {"STATUS": 0},
            "STATISTICAL_DATA": {"DATA_INF": {"VALUE": values}},
        }
    }


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    # No upstream credentials: e-Stat and ODPT both raise before any network
    # I/O, unless a test installs the scripted e-Stat below.
    monkeypatch.delenv("ESTAT_API_KEY", raising=False)
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
    """A scriptable e-Stat at the HTTP layer, one switch per table.

    ``estat["census"]`` / ``estat["growth"]`` hold the HTTP status each table
    answers with; ``estat["calls"]`` counts the requests each table received,
    which is how the caching pins see whether an upstream was retried.
    Stubbing at the transport, not at a service function, keeps the guards
    independent of how the service is factored.
    """
    monkeypatch.setenv("ESTAT_API_KEY", "test-estat-key")
    state: dict = {
        "census": 200,
        "growth": 200,
        "census_rows": CENSUS_ROWS,
        "calls": {"census": 0, "growth": 0},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        table = request.url.params.get("statsDataId")
        if table == demographics.STATS_DATA_ID:
            kind = "census"
        elif table == demographics.GROWTH_STATS_DATA_ID:
            kind = "growth"
        else:
            return httpx.Response(404, json={})
        state["calls"][kind] += 1
        if state[kind] != 200:
            return httpx.Response(state[kind], json={})
        rows = state["census_rows"] if kind == "census" else GROWTH_ROWS
        return httpx.Response(200, json=_estat_body(rows))

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *args, **kwargs: real_client(*args, transport=httpx.MockTransport(handler), **kwargs),
    )
    return state


def _assert_unavailable(resp) -> dict:
    """The one shape a failure may take: HTTP 503, body ``{"status": "unavailable"}``.

    No ``data`` list, no sample record. The 503 is deliberate (Stage 2, CHANGE 1):
    Cloud Run counts it as a server error, so an upstream outage is visible in
    the service's error metrics instead of being a 200 that looked fine.
    """
    body = resp.json()
    leaked = body.get("data")
    evidence = (
        f"first record served: {leaked[0]!r}"
        if isinstance(leaked, list) and leaked
        else f"body: {body!r}"
    )
    assert resp.status_code == 503, f"expected 503, got {resp.status_code} — {evidence}"
    assert body == {"status": "unavailable"}, body
    return body


def _get_demographics(client):
    return client.get("/api/v1/demographics", headers=ACTIVE)


def _get_transport(client):
    return client.get("/api/v1/transport", headers=ACTIVE)


# --- full failures -----------------------------------------------------------


def test_demographics_estat_failure_is_unavailable_not_sample(client, monkeypatch):
    """F1: e-Stat unreachable (no key configured) ⇒ 503, never the sample set."""
    resp = _get_demographics(client)
    _assert_unavailable(resp)
    assert SAMPLE_DEMOGRAPHICS_MARKER not in resp.text, "sample 千代田区 population served as data"


def test_census_table_failure_is_a_full_failure_even_with_a_healthy_growth_table(client, estat):
    """Table 0003448299 is classed as a full failure: every figure and the ward
    rows come from it, so a healthy growth table has nothing to attach to."""
    estat["census"] = 503
    _assert_unavailable(_get_demographics(client))


def test_census_with_no_usable_population_is_a_full_failure(client, estat):
    """A census answer whose every total is suppressed shows nothing meaningful."""
    estat["census_rows"] = [{**row, "$": "-"} for row in CENSUS_ROWS]
    _assert_unavailable(_get_demographics(client))


def test_transport_station_file_failure_is_unavailable_not_sample(client, monkeypatch):
    """F3: the committed GeoJSON unreadable ⇒ unavailable, not the ten sample stations."""
    monkeypatch.setattr(
        transport, "stations_path", lambda: Path("/nonexistent/tokyo-stations.geojson")
    )

    resp = _get_transport(client)
    _assert_unavailable(resp)
    assert SAMPLE_STATION_MARKER not in resp.text, "sample 新宿駅 ridership served as data"


# --- partial answers ---------------------------------------------------------


def test_growth_table_failure_is_partial_and_names_growth_rate(client, estat):
    """Table 0004050417 is classed as a partial: it feeds growthRate only.

    The census figures stand; growthRate is None in every record, and the
    envelope says why — ``unavailable: ["growthRate"]`` — so the client renders
    取得失敗 there, not the データなし it shows for a suppressed cell.
    """
    estat["growth"] = 503

    resp = _get_demographics(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "partial", f"status: {body.get('status')!r}, keys: {sorted(body)}"
    assert body.get("unavailable") == ["growthRate"], body.get("unavailable")
    assert body["isLive"] is True
    chiyoda = next(r for r in body["data"] if r["region"] == "千代田区")
    assert chiyoda["population"] == 66680
    assert chiyoda["growthRate"] is None


def test_transport_without_odpt_is_partial_and_names_the_missing_field(client):
    """F4 (CHANGE 2): the station file loaded, ODPT did not.

    Real stations, no ridership. The body says so in a way the client can
    branch on: ``status: "partial"`` and ``unavailable`` listing the record
    field the upstream did not deliver. Every ``dailyPassengers`` is None; it
    is the ``unavailable`` entry that tells the client to render those cells
    as 取得失敗 rather than データなし.
    """
    resp = _get_transport(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "partial", f"body keys: {sorted(body)}"
    assert body.get("unavailable") == ["dailyPassengers"], body.get("unavailable")
    assert len(body["data"]) == 50
    assert all(s["dailyPassengers"] is None for s in body["data"])
    assert body["isLive"] is False
    assert "fetchedAt" not in body


# --- caching: nothing incomplete is remembered as complete -------------------


def test_partial_demographics_caches_the_census_and_retries_the_growth_table(client, estat):
    """The healthy half is cached on its own; the failed half is retried.

    Two requests with the growth table down: the census table is fetched once
    and reused, the growth table is asked twice, both answers are partial. The
    growth table recovers: the next request is complete, with the real rate,
    and from then on the complete answer is served without any upstream call.
    """
    estat["growth"] = 503

    first = _get_demographics(client).json()
    second = _get_demographics(client).json()
    assert first.get("status") == "partial" and second.get("status") == "partial", (first.get("status"), second.get("status"))
    assert estat["calls"] == {"census": 1, "growth": 2}, estat["calls"]

    estat["growth"] = 200
    third = _get_demographics(client).json()
    assert third.get("status") == "ok", third.get("status")
    assert "unavailable" not in third
    chiyoda = next(r for r in third["data"] if r["region"] == "千代田区")
    assert chiyoda["growthRate"] == pytest.approx(CHIYODA_GROWTH)
    assert estat["calls"] == {"census": 1, "growth": 3}, estat["calls"]

    fourth = _get_demographics(client).json()
    assert fourth.get("status") == "ok"
    assert estat["calls"] == {"census": 1, "growth": 3}, "a complete answer is served from cache"


def test_unavailable_demographics_retries_the_census_on_the_next_request(client, estat):
    """A 503 is never remembered: the census table is asked again, and the
    first healthy answer is complete. The growth figure is exactly as
    published — a real negative, not a 0."""
    estat["census"] = 503

    _assert_unavailable(_get_demographics(client))
    _assert_unavailable(_get_demographics(client))
    assert estat["calls"]["census"] == 2, estat["calls"]

    estat["census"] = 200
    body = _get_demographics(client).json()
    assert body.get("status") == "ok", body.get("status")
    chiyoda = next(r for r in body["data"] if r["region"] == "千代田区")
    assert chiyoda["population"] == 66680
    assert chiyoda["growthRate"] == pytest.approx(CHIYODA_GROWTH)


def test_partial_transport_is_not_cached_and_retries_odpt(client, monkeypatch):
    """ODPT down: both answers are partial and ODPT is asked each time; when it
    recovers the answer is complete, carries fetchedAt, and is cached."""
    calls = {"n": 0}

    async def ridership():
        calls["n"] += 1
        if calls["n"] <= 2:
            raise RuntimeError("odpt:PassengerSurvey error: 503")
        return {odpt.normalize_station_name("東京"): 500000}, 2024

    monkeypatch.setattr(odpt, "fetch_ridership", ridership)

    first = _get_transport(client).json()
    second = _get_transport(client).json()
    assert first.get("status") == "partial" and second.get("status") == "partial"
    assert calls["n"] == 2, "ODPT must be retried on the second request"

    third = _get_transport(client).json()
    assert third.get("status") == "ok"
    assert "unavailable" not in third
    assert "fetchedAt" in third
    assert calls["n"] == 3

    fourth = _get_transport(client).json()
    assert fourth.get("status") == "ok"
    assert calls["n"] == 3, "a complete answer is served from cache"


def test_unavailable_transport_retries_the_station_file_on_the_next_request(client, monkeypatch):
    """A 503 is never remembered: the file is read again on the next request."""
    real_path = transport.stations_path()
    calls = {"n": 0}

    def flaky_path() -> Path:
        calls["n"] += 1
        return Path("/nonexistent/tokyo-stations.geojson") if calls["n"] <= 2 else real_path

    monkeypatch.setattr(transport, "stations_path", flaky_path)

    _assert_unavailable(_get_transport(client))
    _assert_unavailable(_get_transport(client))
    assert calls["n"] == 2

    body = _get_transport(client).json()
    assert body.get("status") == "partial"  # the file is back; ODPT (no key) is not
    assert len(body["data"]) == 50


# --- the sample sets are gone from the server ---------------------------------


def test_the_two_live_sample_sets_leave_the_backend():
    """RECON §9 PR 1 "Deletes": sampleDemographics and sampleTransportStations leave
    sample_fallback.json, and with them the F1 / F3 fallback functions (F5 in part).
    """
    from services import sample_data

    payload = json.loads(SAMPLE_FALLBACK_JSON.read_text(encoding="utf-8"))
    assert "sampleDemographics" not in payload, sorted(payload)
    assert "sampleTransportStations" not in payload, sorted(payload)
    assert not hasattr(sample_data, "demographics")
    assert not hasattr(sample_data, "transport_stations")
    assert not hasattr(demographics, "fallback")
    assert not hasattr(transport, "fallback")
