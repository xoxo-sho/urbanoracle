"""PR 1 of the real-data plan (RECON 2026-10-uo-real-data §9; §7.1 F1, F3, F5).

An upstream failure must come back as an error the client can tell apart
from data — never as sample values. Today both live endpoints answer a
failure with the sample set and ``isLive: false`` (``routers/data.py:43-47``
for e-Stat, ``:83-87`` for the station file): the body has the same shape as
a real answer, and the only difference is a flag that means "not sample" —
which the client cannot read as "e-Stat is down".

Architect decisions (Stage 2): a full failure is **HTTP 503** with the body
``{"status": "unavailable"}`` and nothing else — a 200 would hide an upstream
outage from Cloud Run's error metrics. A partial answer (station file fine,
ODPT down) is 200 with ``status: "partial"`` and ``unavailable`` naming the
record field the upstream did not deliver, so the client can render those
cells as 取得失敗 and keep データなし for a cell the upstream genuinely has no
figure for.

RED on main (8d17736). Stage 1 of the PR; the fix flips
``test_routes.py:171-176`` and the demographics case of ``:71-76``.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import core.authz as authz
from core import cache
from core.database import get_session
from main import app
from services import demographics, transport

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


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    # No upstream credentials: e-Stat and ODPT both raise before any network I/O.
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


def test_demographics_estat_failure_is_unavailable_not_sample(client, monkeypatch):
    """F1: e-Stat raising ⇒ body has no ``data`` and ``status == "unavailable"``."""

    async def estat_down():
        raise RuntimeError("e-Stat API error: 503")

    monkeypatch.setattr(demographics, "fetch_demographics", estat_down)

    resp = client.get("/api/v1/demographics", headers=ACTIVE)
    _assert_unavailable(resp)
    assert SAMPLE_DEMOGRAPHICS_MARKER not in resp.text, "sample 千代田区 population served as data"


def test_transport_station_file_failure_is_unavailable_not_sample(client, monkeypatch):
    """F3: the committed GeoJSON unreadable ⇒ unavailable, not the ten sample stations."""
    monkeypatch.setattr(
        transport, "stations_path", lambda: Path("/nonexistent/tokyo-stations.geojson")
    )

    resp = client.get("/api/v1/transport", headers=ACTIVE)
    _assert_unavailable(resp)
    assert SAMPLE_STATION_MARKER not in resp.text, "sample 新宿駅 ridership served as data"


def test_transport_without_odpt_is_partial_and_names_the_missing_field(client):
    """F4 (CHANGE 2): the station file loaded, ODPT did not.

    Real stations, no ridership. The body says so in a way the client can
    branch on: ``status: "partial"`` and ``unavailable`` listing the record
    field the upstream did not deliver. Every ``dailyPassengers`` is None; it
    is the ``unavailable`` entry that tells the client to render those cells
    as 取得失敗 rather than データなし. A partial answer is not cached.
    """
    resp = client.get("/api/v1/transport", headers=ACTIVE)
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "partial", f"body keys: {sorted(body)}"
    assert body.get("unavailable") == ["dailyPassengers"], body.get("unavailable")
    assert len(body["data"]) == 50
    assert all(s["dailyPassengers"] is None for s in body["data"])
    assert body["isLive"] is False
    assert "fetchedAt" not in body
    assert cache.get("transport") is None, "a partial answer must not be cached"


def test_unavailable_demographics_is_not_cached(client, monkeypatch):
    """A failure must not be remembered for 24 h as though it were data.

    Pin (green on main: only successes are cached today). It is here so the
    fix cannot store the new unavailable body under the ``demographics`` key.
    The retried answer also carries a growth rate of exactly 0, which must
    survive as 0 — a genuine zero is data.
    """
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("e-Stat API error: 503")
        return [
            {
                "region": "千代田区",
                "population": 68_000,
                "density": 5_832,
                "growthRate": 0.0,
                "ageGroups": {"young": 11, "working": 68, "elderly": 21},
            }
        ]

    monkeypatch.setattr(demographics, "fetch_demographics", flaky)

    client.get("/api/v1/demographics", headers=ACTIVE)
    second = client.get("/api/v1/demographics", headers=ACTIVE).json()
    assert calls["n"] == 2, "the second request must go upstream again"
    assert second.get("data"), second
    assert second["data"][0]["growthRate"] == 0.0


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
